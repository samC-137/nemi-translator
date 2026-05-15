# NEMI Realtime Speech Translation

NEMI is a diploma project for delayed realtime lecture translation. The system receives lecturer audio, performs speech recognition, translates the recognized text, synthesizes translated speech for listeners, and provides an admin dashboard for monitoring rooms and stream status.

The project is built around free/open-source runtime options and can run fully through Docker.

## Current Status

Implemented:

- Lecturer, Listener, and Admin browser roles.
- Backend-driven room creation and listener join.
- REST API and WebSocket realtime contracts.
- Audio WebSocket for lecturer microphone stream.
- Admin JWT authentication.
- Admin room dashboard, room details, and room actions.
- Open-source ML profiles:
  - `demo`: fake STT/MT + fake TTS for interface testing.
  - `light`: faster-whisper small int8 + MarianMT + Piper.
  - `diploma`: faster-whisper medium int8 + NLLB-200 distilled 600M + Piper.
- Controlled listener delay and phrase buffering for CPU-only deployment.
- Optional local LLM translation profile through Ollama for local MacBook demos.
- Smoke tests for REST, WebSocket, translation quality, and audio pipeline.

Main documented limitation:

- The most stable deployment profile is `diploma`.
- The optional Ollama profile gives better contextual translation, but it is resource-heavy and not recommended for cheap CPU servers.

## Technology Stack

Frontend:

- React
- Vite
- TypeScript
- Tailwind CSS
- Web Audio API

Backend:

- FastAPI
- Uvicorn
- REST + WebSocket
- PyJWT
- faster-whisper
- MarianMT / NLLB
- Piper TTS
- optional Ollama HTTP API

Infrastructure:

- Docker Compose
- Local model cache under `models/`

## Repository Structure

```text
.
├── backend/
│   ├── app/
│   │   ├── api/
│   │   │   ├── audio_ws.py          # lecturer audio WebSocket and STT/MT/TTS pipeline
│   │   │   ├── http.py              # REST API: rooms, admin, status, languages
│   │   │   └── ws.py                # realtime room WebSocket events
│   │   ├── config/
│   │   │   └── glossary.json        # domain glossary for translation consistency
│   │   ├── core/
│   │   │   └── config.py            # environment settings
│   │   ├── models/                  # room/participant/stream dataclasses
│   │   ├── scripts/                 # smoke tests and model prefetch helpers
│   │   └── services/                # STT, MT, TTS, auth, store, quality helpers
│   ├── requirements.txt             # Python dependencies
│   ├── .env.example                 # generic backend environment
│   ├── .env.demo.example            # fake demo profile
│   ├── .env.light.example           # light open-source profile
│   ├── .env.diploma.example         # diploma profile
│   └── .env.local-llm.example       # optional Ollama profile
├── frontend/
│   ├── components/                  # Lecturer, Listener, Admin, Lobby UI
│   ├── services/                    # REST/WS clients and realtime contracts
│   ├── scripts/                     # browser microphone smoke test
│   ├── package.json
│   └── .env.example
├── DOCS/
│   ├── sprint/                      # sprint reports, verification logs, design notes
│   └── practice_report/             # diploma/practice report drafts
├── docker-compose.yml               # base compose file
├── docker-compose.demo.yml          # fake model profile
├── docker-compose.light.yml         # light model profile
├── docker-compose.diploma.yml       # diploma model profile
├── docker-compose.local-llm.yml     # optional Ollama overlay
└── README.md
```

Do not edit generated artifacts:

- `frontend/dist/`
- `frontend/node_modules/`
- Python `__pycache__/`
- downloaded model files under `models/`

## Requirements

Required:

- Docker Desktop or Docker Engine with Docker Compose.
- Node.js 20+ for local frontend development.
- Python 3.12+ for local backend development.
- Enough disk space for local ML models.

Python dependencies are listed in:

```text
backend/requirements.txt
```

Install backend dependencies locally:

```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
```

Install frontend dependencies locally:

```bash
cd frontend
npm install
```

## Quick Start

Recommended diploma profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.diploma.yml up --build
```

Open:

- Frontend: `http://localhost:4173`
- Backend health: `http://localhost:8000/health`
- Admin login: `http://localhost:4173/admin`

Default admin credentials:

```text
username: admin
password: admin
```

Stop the stack:

```bash
docker compose -f docker-compose.yml -f docker-compose.diploma.yml down
```

## Docker Profiles

Demo profile without real models:

```bash
docker compose -f docker-compose.yml -f docker-compose.demo.yml up --build
```

Light profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.light.yml up --build
```

Diploma profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.diploma.yml up --build
```

Optional local LLM profile:

```bash
docker compose -f docker-compose.yml -f docker-compose.diploma.yml -f docker-compose.local-llm.yml up --build
```

The local LLM profile requires Ollama running on the host machine:

```bash
ollama serve
ollama pull qwen2.5:7b-instruct
```

The Ollama profile is not recommended for low-budget CPU servers because it adds large latency and high memory/CPU pressure.

## Model Profiles

### Demo

Purpose: UI and API demonstration without model downloads.

```text
STT_PROVIDER=llm
MT_PROVIDER=llm
TTS_PROVIDER=fake
LLM_FAKE_TRANSCRIPTS=true
LLM_FAKE_TRANSLATIONS=true
```

### Light

Purpose: cheaper local run with open models.

```text
STT: faster-whisper small int8
MT: MarianMT / OPUS-MT for en/ru/es
TTS: Piper low/medium voices
```

### Diploma

Purpose: main diploma demonstration profile.

```text
STT: faster-whisper medium int8
MT: facebook/nllb-200-distilled-600M
TTS: Piper medium voices
```

### Local LLM

Purpose: optional local quality experiment.

```text
MT_PROVIDER=ollama
OLLAMA_MODEL=qwen2.5:7b-instruct
```

This profile improves contextual translation in some cases, but it is slower and resource-heavy. It is kept as an experimental profile, not the default diploma profile.

## Environment Variables

Important backend variables:

```text
APP_ENV=production
JWT_SECRET=dev-change-me
JWT_EXPIRES_MINUTES=60

STT_PROVIDER=faster-whisper
STT_MODEL=/models/hf/...
STT_DEVICE=cpu
STT_COMPUTE_TYPE=int8
STT_SEGMENT_MAX_MS=7000
STT_SEGMENT_MIN_MS=2500
VAD_PADDING_MS=650

MT_PROVIDER=nllb
MT_MODEL=facebook/nllb-200-distilled-600M
MT_MODELS=

TTS_PROVIDER=piper
TTS_MODELS=en-US=/models/piper/...,ru-RU=/models/piper/...,es-ES=/models/piper/...
TTS_SAMPLE_RATE=0

LISTENER_DELAY_MS=5000
TRANSLATION_CONTEXT_SEGMENTS=5
TRANSLATION_GLOSSARY_PATH=/app/app/config/glossary.json
PHRASE_MIN_CHARS=28
PHRASE_MAX_CHARS=260
PHRASE_TIMEOUT_MS=1800

ADMIN_USER=admin
ADMIN_PASSWORD=admin
```

Frontend variable:

```text
VITE_BACKEND_URL=http://localhost:8000
```

## How To Use

1. Start the Docker profile.
2. Open `http://localhost:4173`.
3. On the lobby screen choose lecturer language and create a room.
4. Open the listener link in another tab/browser.
5. On the listener screen click `Включить озвучку` to unlock browser audio playback.
6. On the lecturer screen start the session and allow microphone access.
7. Speak into the microphone.
8. The listener receives delayed translated text and synthesized audio.
9. Open `/admin` to monitor room status, listeners, latency, and active ML profile.

## API Contract

The realtime event contract is defined in:

```text
frontend/services/realtimeContracts.ts
```

Client to server:

```text
room:join
room:leave
```

Server to client:

```text
room:status
room:error
room:listenerCount
stream:transcription
stream:translation
stream:tts
```

Core REST endpoints:

```text
GET  /health
POST /rooms
POST /rooms/{room_id}/join
POST /admin/login
GET  /admin/rooms
GET  /admin/rooms/{room_id}
POST /admin/rooms/{room_id}/stop
POST /admin/rooms/{room_id}/reset-listeners
POST /admin/rooms/{room_id}/restart
GET  /admin/system/status
GET  /supported-languages
```

Admin endpoints require:

```text
Authorization: Bearer <admin_jwt>
```

## Testing

Run after Docker is started.

REST smoke:

```bash
docker compose exec backend python -m app.scripts.smoke_rest http://backend:8000
```

WebSocket smoke:

```bash
docker compose exec backend python -m app.scripts.smoke_ws http://backend:8000
```

Translation quality smoke:

```bash
docker compose exec backend python -m app.scripts.smoke_translation_quality
```

TTS smoke:

```bash
docker compose exec backend python -m app.scripts.smoke_tts
```

Audio pipeline smoke:

```bash
docker compose exec backend python -m app.scripts.smoke_audio_pipeline http://backend:8000
```

Frontend build:

```bash
cd frontend
npm run build
```

Browser microphone smoke:

```bash
cd frontend
npm run smoke:mic
```

## External Test Set

For diploma verification, keep an external test set with real user phrases separate from training/tuning notes.

Recommended file location:

```text
DOCS/sprint/external_user_phrases.md
```

Recommended fields:

```text
id
source_language
target_language
speaker_text
expected_meaning
domain_terms
notes
```

Minimum coverage:

- lecture introduction;
- technical explanation;
- short phrase;
- long phrase;
- interruption or self-correction;
- domain terms such as speech recognition, latency, listener, lecturer;
- irrelevant or noisy utterance;
- mixed punctuation;
- names and dates;
- command-like phrases;
- repeated words.

The current repository contains smoke-test phrases and manual test logs in `DOCS/sprint`, but the larger external phrase set should be expanded before final defense.

## Evaluation Reports

For the current translation system, relevant metrics are:

- STT output quality on real speech;
- translation adequacy;
- glossary consistency;
- listener delay;
- TTS availability;
- TTS naturalness;
- end-to-end latency.

Recommended report locations:

```text
DOCS/sprint/manual_microphone_e2e_2026-05-07.md
DOCS/sprint/smoke_tests_2026-05-07.md
DOCS/sprint/m5_translation_quality_implementation_2026-05-08.md
```

For a future NLU/intent module, add a separate classification report for all 11 intents:

```text
DOCS/sprint/nlu_classification_report_11_intents.md
```

Expected classification report format:

```text
intent
precision
recall
f1-score
support
macro avg
weighted avg
confusion matrix
```

This repository currently implements speech translation, not a production NLU classifier. The 11-intent classification report is therefore documented as a future NLU-module artifact, not as a fabricated current result.

## OOD Evaluation

OOD means out-of-distribution input: requests or phrases that do not belong to supported lecture translation behavior.

Recommended OOD report:

```text
DOCS/sprint/ood_evaluation.md
```

Suggested OOD groups:

- irrelevant user requests;
- empty or very short input;
- background speech;
- profanity or aggressive speech;
- unsupported language;
- commands unrelated to translation;
- repeated noise;
- mixed-language fragments.

For each group record:

```text
input
expected behavior
actual behavior
error handling
notes
```

## Ablation Study

The current system has several quality mechanisms that can be compared independently:

- controlled listener delay;
- VAD padding;
- STT segment min/max window;
- phrase aggregation;
- translation context window;
- glossary postprocessing;
- optional local LLM provider.

Recommended ablation report:

```text
DOCS/sprint/ablation_study.md
```

Suggested experiments:

```text
without controlled delay
without phrase aggregation
without translation context
without glossary
without local LLM
light profile vs diploma profile
```

The note from the review mentions examples such as "without FAISS", "without contrastive loss", and "without negative handling". Those components are not part of the current speech translation implementation. If a future NLU/RAG module is added, the ablation study should include:

```text
without FAISS
without contrastive loss
without negative handling
```

## Future NLU Module API Contract

The current API is focused on rooms and realtime translation. If the project is extended with an NLU module for digital-agent integration, use a separate contract.

Proposed endpoint:

```http
POST /nlu/intent
Content-Type: application/json
Authorization: Bearer <token>
```

Request:

```json
{
  "text": "user phrase",
  "language": "ru-RU",
  "sessionId": "optional-session-id",
  "context": {
    "source": "digital-agent"
  }
}
```

Response:

```json
{
  "intent": "intent_name",
  "confidence": 0.92,
  "isOutOfDistribution": false,
  "entities": [],
  "reason": "short diagnostic explanation"
}
```

Recommended error behavior:

```json
{
  "intent": "unknown",
  "confidence": 0.0,
  "isOutOfDistribution": true,
  "entities": [],
  "reason": "unsupported or irrelevant request"
}
```

## Key Documentation

Sprint and verification artifacts:

```text
DOCS/sprint/project_state_2026-05-07.md
DOCS/sprint/backlog_2026-05-07.md
DOCS/sprint/final_completion_report_2026-05-07.md
DOCS/sprint/quality_buffer_design_2026-05-07.md
DOCS/sprint/listener_audio_reliability_2026-05-07.md
DOCS/sprint/local_llm_translation_profile_2026-05-08.md
DOCS/sprint/m5_translation_quality_implementation_2026-05-08.md
```

Backend verification:

```text
DOCS/Backend_E2E_Verification_Report.md
DOCS/Backend_Stage_1_3_Test_Report.md
```

Admin appendix:

```text
DOCS/Приложение_Админ_интерфейс.md
```

## Known Limitations

- CPU-only ML inference is slow compared with GPU inference.
- The diploma profile intentionally uses delayed streaming to improve output quality.
- Browser audio playback requires a user gesture; the listener must click `Включить озвучку`.
- Optional Ollama translation is useful for local experiments but too resource-heavy for low-budget servers.
- Large external evaluation sets and future NLU reports are documented as required artifacts but still need to be filled with final defense data.

## Recommended Server Use

Cheap CPU server:

- use `demo` for UI demonstration;
- use `light` for constrained open-source inference;
- avoid Ollama.

Stronger CPU server:

- use `diploma`;
- expect noticeable delay;
- keep listener delay and phrase aggregation enabled.

GPU server:

- can reduce STT/MT latency;
- not required for the current free/open-source diploma setup.
