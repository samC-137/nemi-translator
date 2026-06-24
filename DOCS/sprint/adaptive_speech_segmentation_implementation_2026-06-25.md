# Adaptive Speech Segmentation Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Накапливать STT-текст до двух предложений, паузы 800 мс или жёсткого предела 10 секунд и передавать в MT без потерь и дублирования.

**Architecture:** `PhraseAggregator` остаётся синхронным владельцем текста и временных меток, но возвращает типизированный результат с причиной отправки. `audio_ws` владеет одной перезапускаемой асинхронной задачей, которая проверяет ближайший deadline и логирует причину, длительность, число предложений и длину текста. Настройки доступны через backend environment; defense overlay включает согласованные значения.

**Tech Stack:** Python 3, FastAPI, asyncio, stdlib `unittest`, Docker Compose.

---

## Структура файлов

- `backend/app/services/translation_quality.py` — состояние и детерминированные правила агрегатора.
- `backend/tests/test_phrase_aggregator.py` — изолированные unit-тесты времени, пунктуации и сброса.
- `backend/app/core/config.py` — загрузка новых environment-параметров.
- `backend/app/api/audio_ws.py` — асинхронное планирование flush и журналирование.
- `backend/app/scripts/smoke_translation_quality.py` — совместимый smoke-сценарий качества перевода.
- `docker-compose.defense.yml` — отдельный профиль демонстрационной сегментации.
- `backend/.env.example` — документированные значения конфигурации.
- `DOCS/sprint/adaptive_speech_segmentation_verification_2026-06-25.md` — команды, результаты и выдержка причин flush.

### Task 1: Зафиксировать правила агрегатора тестами

**Files:**
- Create: `backend/tests/__init__.py`
- Create: `backend/tests/test_phrase_aggregator.py`

- [ ] **Step 1: Написать failing unit-тесты**

Создать тестовый helper и сценарии первой/второй точки, переноса inactivity deadline, max age, max chars, повторного таймера и manual flush:

```python
import unittest

from app.services.translation_quality import PhraseAggregator


class PhraseAggregatorTests(unittest.TestCase):
    def make_aggregator(self) -> PhraseAggregator:
        return PhraseAggregator(
            max_sentences=2,
            max_chars=300,
            inactivity_ms=800,
            max_age_ms=10_000,
        )

    def test_second_sentence_flushes_immediately(self) -> None:
        aggregator = self.make_aggregator()
        self.assertIsNone(aggregator.push("Первое предложение.", now_ms=0))
        result = aggregator.push("Второе предложение!", now_ms=300)
        self.assertEqual(result.text, "Первое предложение. Второе предложение!")
        self.assertEqual(result.reason, "sentence_limit")

    def test_new_fragment_moves_inactivity_deadline(self) -> None:
        aggregator = self.make_aggregator()
        aggregator.push("Начало", now_ms=0)
        aggregator.push("продолжение", now_ms=700)
        self.assertIsNone(aggregator.flush_due(now_ms=800))
        self.assertEqual(aggregator.flush_due(now_ms=1500).reason, "inactivity")
```

Добавить остальные сценарии с явными `now_ms`, чтобы не ждать реальные 10 секунд:

```python
    def test_first_sentence_waits(self) -> None:
        aggregator = self.make_aggregator()
        self.assertIsNone(aggregator.push("Одно предложение.", now_ms=0))
        self.assertTrue(aggregator.has_pending())

    def test_inactivity_flushes_unfinished_text(self) -> None:
        aggregator = self.make_aggregator()
        aggregator.push("Незаконченная мысль", now_ms=100)
        self.assertIsNone(aggregator.flush_due(now_ms=899))
        self.assertEqual(aggregator.flush_due(now_ms=900).reason, "inactivity")

    def test_max_age_wins_during_continuous_fragments(self) -> None:
        aggregator = self.make_aggregator()
        aggregator.push("Начало", now_ms=0)
        aggregator.push("ещё", now_ms=9_500)
        self.assertEqual(aggregator.flush_due(now_ms=10_000).reason, "max_age")

    def test_max_chars_flushes_immediately(self) -> None:
        aggregator = PhraseAggregator(2, 10, 800, 10_000)
        result = aggregator.push("1234567890", now_ms=0)
        self.assertEqual(result.reason, "max_chars")

    def test_stale_timer_cannot_flush_twice(self) -> None:
        aggregator = self.make_aggregator()
        aggregator.push("Первая. Вторая.", now_ms=0)
        self.assertIsNone(aggregator.flush_due(now_ms=800))

    def test_manual_flush_returns_remainder(self) -> None:
        aggregator = self.make_aggregator()
        aggregator.push("Остаток", now_ms=100)
        result = aggregator.flush(now_ms=200)
        self.assertEqual(result.text, "Остаток")
        self.assertEqual(result.reason, "manual_flush")

    def test_colon_and_semicolon_are_not_sentence_boundaries(self) -> None:
        aggregator = self.make_aggregator()
        self.assertIsNone(aggregator.push("Тема: STT; MT.", now_ms=0))
```

- [ ] **Step 2: Запустить тесты и подтвердить ожидаемое падение**

Run: `cd backend && python -m unittest tests.test_phrase_aggregator -v`

Expected: `ERROR` из-за неподдерживаемых аргументов `max_sentences`, `inactivity_ms`, `max_age_ms`.

- [ ] **Step 3: Закоммитить red-тесты**

```bash
git add backend/tests/__init__.py backend/tests/test_phrase_aggregator.py
git commit -m "test: define adaptive phrase aggregation"
```

### Task 2: Реализовать детерминированный PhraseAggregator

**Files:**
- Modify: `backend/app/services/translation_quality.py`
- Modify: `backend/app/scripts/smoke_translation_quality.py`

- [ ] **Step 1: Добавить тип результата и причины**

```python
@dataclass(frozen=True)
class PhraseFlush:
    text: str
    reason: str
    age_ms: int
    sentence_count: int


def _sentence_count(text: str) -> int:
    return len(re.findall(r"[.!?]+(?=\s|$)", text))
```

- [ ] **Step 2: Заменить старые min-chars/timeout правила**

Конструктор принимает `max_sentences`, `max_chars`, `inactivity_ms`, `max_age_ms`; хранит `_first_seen_ms` и `_last_seen_ms`. `push()` проверяет `max_chars`, `sentence_limit`, затем `max_age`. `flush_due()` проверяет `max_age` до `inactivity`, чтобы жёсткий предел имел однозначную причину:

```python
def push(self, text: str, now_ms: Optional[int] = None) -> Optional[PhraseFlush]:
    cleaned = normalize_translation_text(text)
    if not cleaned:
        return None
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    if self._first_seen_ms is None:
        self._first_seen_ms = now
    self._last_seen_ms = now
    self._parts.append(cleaned)
    phrase = self._current_phrase()
    if len(phrase) >= self._max_chars:
        return self.flush("max_chars", now)
    if _sentence_count(phrase) >= self._max_sentences:
        return self.flush("sentence_limit", now)
    if now - self._first_seen_ms >= self._max_age_ms:
        return self.flush("max_age", now)
    return None

def flush_due(self, now_ms: Optional[int] = None) -> Optional[PhraseFlush]:
    if self._first_seen_ms is None or self._last_seen_ms is None:
        return None
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    if now - self._first_seen_ms >= self._max_age_ms:
        return self.flush("max_age", now)
    if now - self._last_seen_ms >= self._inactivity_ms:
        return self.flush("inactivity", now)
    return None
```

```python
def flush(self, reason: str = "manual_flush", now_ms: Optional[int] = None) -> Optional[PhraseFlush]:
    if not self._parts or self._first_seen_ms is None:
        return None
    now = now_ms if now_ms is not None else int(time.time() * 1000)
    text = self._current_phrase()
    result = PhraseFlush(
        text=text,
        reason=reason,
        age_ms=max(0, now - self._first_seen_ms),
        sentence_count=_sentence_count(text),
    )
    self._parts = []
    self._first_seen_ms = None
    self._last_seen_ms = None
    return result
```

Добавить `next_deadline_ms()`, возвращающий `min(_last_seen_ms + _inactivity_ms, _first_seen_ms + _max_age_ms)`, чтобы `audio_ws` не выполнял polling.

- [ ] **Step 3: Обновить smoke_translation_quality под новый контракт**

Проверять `result.text` и `result.reason`; сохранить остальные glossary/Ollama проверки без изменений.

- [ ] **Step 4: Запустить unit и quality smoke**

Run: `cd backend && python -m unittest tests.test_phrase_aggregator -v && python app/scripts/smoke_translation_quality.py`

Expected: все unit-тесты `OK`; smoke печатает `{"status": "ok", "tests": 4}`.

- [ ] **Step 5: Закоммитить реализацию**

```bash
git add backend/app/services/translation_quality.py backend/app/scripts/smoke_translation_quality.py
git commit -m "feat: add adaptive phrase aggregation"
```

### Task 3: Подключить настройки и безопасный asyncio scheduler

**Files:**
- Modify: `backend/app/core/config.py`
- Modify: `backend/app/api/audio_ws.py`
- Modify: `backend/app/api/http.py`
- Modify: `backend/.env.example`

- [ ] **Step 1: Добавить settings-поля**

```python
phrase_max_sentences: int
phrase_inactivity_ms: int
phrase_max_age_ms: int
```

Загрузить `PHRASE_MAX_SENTENCES=2`, `PHRASE_INACTIVITY_MS=800`, `PHRASE_MAX_AGE_MS=10000`. Старый `PHRASE_TIMEOUT_MS` оставить в `Settings` и system-status на один цикл совместимости, но не использовать новым агрегатором.

- [ ] **Step 2: Передать настройки в PhraseAggregator**

```python
phrase_aggregator = PhraseAggregator(
    max_sentences=settings.phrase_max_sentences,
    max_chars=settings.phrase_max_chars,
    inactivity_ms=settings.phrase_inactivity_ms,
    max_age_ms=settings.phrase_max_age_ms,
)
```

- [ ] **Step 3: Реализовать перезапускаемый scheduler**

Каждый новый фрагмент отменяет предыдущую задачу и создаёт новую. Задача спит до `next_deadline_ms()`, вызывает `flush_due()` и передаёт ровно один `PhraseFlush`. `asyncio.CancelledError` считается штатным исходом.

```python
async def enqueue_phrase(result: PhraseFlush) -> None:
    logger.info(
        "Phrase flush: room=%s reason=%s age_ms=%s sentences=%s chars=%s",
        room_id, result.reason, result.age_ms, result.sentence_count, len(result.text),
    )
    await enqueue_translation_phrase(result.text)
```

- [ ] **Step 4: Добавить новые поля в system status и env example**

Статус возвращает значения новых параметров рядом с существующими phrase-полями; `.env.example` содержит согласованные имена и значения.

- [ ] **Step 5: Запустить compile и unit/smoke проверки**

Run: `cd backend && python -m compileall -q app tests && python -m unittest tests.test_phrase_aggregator -v && python app/scripts/smoke_translation_quality.py`

Expected: exit code 0.

- [ ] **Step 6: Закоммитить интеграцию**

```bash
git add backend/app/core/config.py backend/app/api/audio_ws.py backend/app/api/http.py backend/.env.example
git commit -m "feat: schedule adaptive phrase flushes"
```

### Task 4: Добавить defense-конфигурацию

**Files:**
- Create: `docker-compose.defense.yml`
- Modify: `DOCS/sprint/defense_ml_profile_design_2026-06-24.md`

- [ ] **Step 1: Создать compose overlay**

Overlay задаёт:

```yaml
services:
  backend:
    environment:
      STT_SEGMENT_MAX_MS: 10000
      STT_SEGMENT_MIN_MS: 0
      VAD_PADDING_MS: 650
      PHRASE_MAX_SENTENCES: 2
      PHRASE_INACTIVITY_MS: 800
      PHRASE_MAX_AGE_MS: 10000
      PHRASE_MAX_CHARS: 300
      LISTENER_DELAY_MS: 0
```

`LISTENER_DELAY_MS=0` исключает искусственную задержку после готовности перевода.

- [ ] **Step 2: Синхронизировать профильный дизайн**

Заменить старые `PHRASE_MIN_CHARS/PHRASE_TIMEOUT_MS` значения ссылкой на утверждённую адаптивную спецификацию и новые параметры.

- [ ] **Step 3: Проверить итоговую Compose-конфигурацию**

Run: `docker compose -f docker-compose.yml -f docker-compose.defense.yml config --quiet`

Expected: exit code 0.

- [ ] **Step 4: Закоммитить профиль**

```bash
git add docker-compose.defense.yml
git add -f DOCS/sprint/defense_ml_profile_design_2026-06-24.md
git commit -m "config: add adaptive defense speech profile"
```

### Task 5: Проверить контейнеры и realtime pipeline

**Files:**
- Modify: `backend/app/scripts/smoke_translation_quality.py` только если контейнер выявит несовместимость.

- [ ] **Step 1: Собрать и запустить профиль**

Run: `docker compose -f docker-compose.yml -f docker-compose.defense.yml up -d --build`

Expected: backend и frontend имеют статус `Up`; backend health становится healthy/доступным.

- [ ] **Step 2: Запустить smoke-набор**

```bash
docker compose exec backend python app/scripts/smoke_translation_quality.py
docker compose exec backend python app/scripts/smoke_rest.py http://127.0.0.1:8000
docker compose exec backend python app/scripts/smoke_ws.py http://127.0.0.1:8000
```

Expected: каждый скрипт сообщает `status: ok` и завершается с code 0.

- [ ] **Step 3: Проверить backend logs**

Run: `docker compose logs --since=10m backend`

Expected: нет traceback; при аудиосценарии присутствуют `Phrase flush` с допустимыми причинами и числовыми метриками.

- [ ] **Step 4: Закоммитить только необходимые исправления**

Если проверка не потребовала кода, отдельный пустой коммит не создавать. При исправлении — повторить весь smoke-набор и создать точечный `fix:` коммит.

### Task 6: Зафиксировать итоговую проверку

**Files:**
- Create: `DOCS/sprint/adaptive_speech_segmentation_verification_2026-06-25.md`

- [ ] **Step 1: Записать воспроизводимые результаты**

Документ содержит SHA коммитов, Compose-команду, результаты unit/REST/WS smoke, статус контейнеров, причины phrase flush из логов и известное ограничение: 800 мс измеряются после последнего STT-фрагмента, а не непосредственно от конца звука.

- [ ] **Step 2: Проверить рабочее дерево и diff**

Run: `git diff --check && git status --short`

Expected: нет whitespace errors; пользовательские `.gitignore`, `.current_presentation_workspace`, `outputs/` не staged.

- [ ] **Step 3: Закоммитить отчёт**

```bash
git add -f DOCS/sprint/adaptive_speech_segmentation_verification_2026-06-25.md
git commit -m "docs: verify adaptive speech segmentation"
```

- [ ] **Step 4: Финальная верификация перед завершением**

Повторить unit-тесты, quality/REST/WS smoke и проверить свежие backend logs. Не заявлять о готовности без сохранённых exit codes и фактических результатов.
