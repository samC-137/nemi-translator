# Проверка адаптивной сегментации речи

Дата: 2026-06-25

## Результат

Адаптивная сегментация реализована и запущена в defense-профиле. Переводимый
блок отправляется по второй границе предложения, после 800 мс неактивности,
через максимум 10 секунд либо по лимиту 300 символов.

Публичные REST и WebSocket контракты событий не изменились. Backend и frontend
работают в Docker на портах 8000 и 4173.

## Коммиты этапа

- `c75ec0e` — спецификация;
- `952924a` — план реализации;
- `d87882c` — red-тесты агрегатора;
- `c6ea105` — реализация агрегатора;
- `0bd3a9f` — red-тесты настроек;
- `d3e697e` — настройки, scheduler, API status и логи;
- `9526d55` — defense compose overlay;
- `485e194` — аудио smoke для inactivity-пути;
- `13411ab` — гарантированная VAD-тишина в аудио smoke.

## Команда запуска

```bash
docker compose -f docker-compose.yml -f docker-compose.defense.yml up -d --build
```

Итоговые параметры контейнера:

```text
STT_SEGMENT_MAX_MS=10000
STT_SEGMENT_MIN_MS=0
VAD_PADDING_MS=650
PHRASE_MAX_SENTENCES=2
PHRASE_INACTIVITY_MS=800
PHRASE_MAX_AGE_MS=10000
PHRASE_MAX_CHARS=300
LISTENER_DELAY_MS=0
```

## Автоматические проверки

### Unit

```bash
PYTHONPATH=backend python3 -m unittest discover -s backend/tests -v
```

Результат: 14 тестов, `OK`. Покрыты первая и вторая границы предложения,
пунктуация, inactivity deadline, перенос deadline новым фрагментом, max age,
max chars, повторный timer, manual flush и environment overrides.

### Quality smoke

Host и контейнер:

```bash
PYTHONPATH=backend python3 backend/app/scripts/smoke_translation_quality.py
docker compose -f docker-compose.yml -f docker-compose.defense.yml exec -T backend \
  python -m app.scripts.smoke_translation_quality
```

Оба запуска: `{"status": "ok", "tests": 4}`.

### REST и WebSocket

```bash
docker compose -f docker-compose.yml -f docker-compose.defense.yml exec -T backend \
  python app/scripts/smoke_rest.py http://127.0.0.1:8000
docker compose -f docker-compose.yml -f docker-compose.defense.yml exec -T backend \
  python app/scripts/smoke_ws.py http://127.0.0.1:8000
```

Результаты: REST `status=ok`, включая admin lifecycle; WebSocket `status=ok`.

### Полный аудиопоток

```bash
docker compose -f docker-compose.yml -f docker-compose.defense.yml exec -T backend \
  python app/scripts/smoke_audio_pipeline.py http://127.0.0.1:8000
```

Результат комнаты `NEMI-2775`:

- STT: `Hello World, this is a short test lecture.`;
- MT: `Привет, Мир, это короткая лекция по тестам.`;
- TTS: 152576 raw bytes, 22050 Hz, `ru-RU`;
- события: transcription, translation, TTS;
- полный elapsed: 7281 мс;
- backend latency: 897 мс.

Ключевая запись backend:

```text
Phrase flush: room=NEMI-2775 reason=inactivity age_ms=808 sentences=1 chars=42
```

Traceback, `ERROR` и необработанных исключений в свежих backend-логах нет.

## Ограничение измерения

Порог 800 мс отсчитывается после получения последнего STT-текста. Он не включает
предшествующие VAD и STT inference. В проверенном локальном сценарии измеренный
backend latency составил 897 мс, а полный STT → MT → TTS цикл — 7,3 секунды.

## Состояние рабочего дерева

Пользовательские `.gitignore`, `.current_presentation_workspace` и `outputs/` не
изменялись и не добавлялись в коммиты этого этапа.
