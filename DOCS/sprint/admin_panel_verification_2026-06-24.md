# Проверка административной панели

Дата: 2026-06-24

## Результат

Административная панель работает с реальным FastAPI backend и запущена через Docker Compose.

- Frontend: http://localhost:4173/admin
- Backend: http://localhost:8000
- Dev-учетная запись: `admin` / `admin`
- Ветка: `codex/admin-panel-mvp`

## Реализованный сценарий

- JWT-вход и автоматический возврат на login при истечении сессии;
- реальные комнаты и агрегированная статистика backend;
- независимая загрузка системного ML-статуса;
- обновление списка комнат каждые две секунды;
- поиск и фильтр по статусу;
- Stop из dashboard с подтверждением и pending-состоянием;
- realtime-статус, listeners, транскрипция и перевод на странице комнаты;
- Stop, Reset listeners и Restart с подтверждением и защитой от повторного запроса;
- доступные поля формы, focus states и live-region сообщения;
- автоматизированный browser smoke полного admin-сценария.

## Проверки

### Frontend tests

```bash
cd frontend
npm test
```

Результат: 4 test files, 15 tests passed.

### Frontend production build

```bash
cd frontend
npm run build
```

Результат: Vite build завершен успешно. Запущенный контейнер отдает новый bundle `index-2rEQgIp7.js` и `index-DCMITPDT.css`.

### Backend compile

```bash
python3 -m compileall backend/app
```

Результат: все backend-модули скомпилированы без ошибок; созданные `__pycache__` удалены после проверки.

### REST admin lifecycle

```bash
python3 backend/app/scripts/smoke_rest.py http://127.0.0.1:8000
```

Результат: `status=ok`, проверена последовательность `restart-reset-stop` и защищенный системный статус.

### Browser acceptance

```bash
cd frontend
npm run smoke:admin
```

Результат: `status=ok`, сценарий `admin-browser` прошел redirect, login, поиск реальной комнаты, details, Restart, Reset listeners, Stop и logout.

### Runtime

```bash
curl --fail http://127.0.0.1:8000/health
docker compose ps
```

Результат: health возвращает `ok`; backend и frontend имеют состояние `Up`, порты `8000` и `4173` опубликованы.

Дополнительно выполнена визуальная проверка через встроенный браузер: dashboard показывает реальные комнаты и активные провайдеры `faster-whisper`, `marian`, `piper`.

## Коммиты

- `9fb21f0` — дизайн MVP;
- `b04eef0` — план реализации;
- `b0c59bc` — безопасное исключение локальных worktree;
- `7c3242b` — тестовый каркас frontend;
- `36cdcf9` — жизненный цикл admin-сессии;
- `dfc820e` — polling dashboard;
- `ccbc18b` — действия из dashboard;
- `1790819` — realtime room monitoring;
- `c6a4041` — REST admin lifecycle smoke;
- `d25b3e8` — browser acceptance smoke.

## Известное ограничение

`npm audit` сообщает 10 уязвимостей транзитивных зависимостей (1 low, 4 moderate, 5 high). Автоматический `npm audit fix` намеренно не применялся, поскольку он может изменить версии существующего стека и не относится к функциональному MVP админ-панели.
