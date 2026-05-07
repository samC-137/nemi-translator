# NEMI Realtime Translation

NEMI is a realtime lecture translation demo with three roles (Lecturer, Listener, Admin).
Frontend: React + Vite + Tailwind. Backend: FastAPI with WS + REST.
Realtime payload contracts live in `frontend/services/realtimeContracts.ts`.

## Quick start (Docker)
```bash
docker compose up --build
```
- Frontend: http://localhost:4173
- Backend: http://localhost:8000

Light open-source profile:
```bash
docker compose -f docker-compose.yml -f docker-compose.light.yml up --build
```

Demo fake profile without model downloads:
```bash
docker compose -f docker-compose.yml -f docker-compose.demo.yml up --build
```

Diploma open-source profile:
```bash
docker compose -f docker-compose.yml -f docker-compose.diploma.yml up --build
```

## Env templates
- Backend: `backend/.env.example`
- Backend light profile: `backend/.env.light.example`
- Backend diploma profile: `backend/.env.diploma.example`
- Frontend: `frontend/.env.example`
- Sprint ML profile notes: `DOCS/sprint/ml_profiles_2026-05-07.md`

## Local development
### Backend
```bash
cd backend
python3 -m venv .venv
source .venv/bin/activate
pip install -r requirements.txt
uvicorn app.main:app --reload
```

### Frontend
```bash
cd frontend
npm install
npm run dev
```

## Environment variables
### Backend
- `APP_NAME` (default: `NEMI Backend`)
- `APP_ENV` (default: `development`)
- `JWT_SECRET` (default: `dev-change-me`)
- `JWT_ALG` (default: `HS256`)
- `JWT_EXPIRES_MINUTES` (default: `60`)
- `REDIS_URL` (default: `redis://localhost:6379/0`)
- `STT_PROVIDER` (default: `llm`)
- `STT_MODEL` (default: `base`)
- `STT_LANGUAGE` (default: empty)
- `STT_DEVICE` (default: `cpu`)
- `STT_COMPUTE_TYPE` (default: `int8`)
- `MT_PROVIDER` (default: `llm`)
- `MT_MODEL` (default: `facebook/nllb-200-distilled-600M`)
- `MT_MODELS` (default: empty)
- `TTS_PROVIDER` (default: `none`)
- `TTS_MODELS` (default: empty)
- `TTS_MODEL_PATH` (default: empty)
- `TTS_SAMPLE_RATE` (default: `22050`)
- `LLM_PROVIDER` (default: `gemini`)
- `LLM_MODEL` (default: `gemini-2.0-flash-exp`)
- `LLM_API_KEY` (default: empty)
- `LLM_FAKE_TRANSCRIPTS` (default: `false`)
- `LLM_FAKE_TRANSLATIONS` (default: `false`)
- `ADMIN_USER` (default: `admin`)
- `ADMIN_PASSWORD` (default: `admin`)

### Frontend
- `VITE_BACKEND_URL` (default: `http://localhost:8000`)

## Demo mode
For local demos without real STT/translation/TTS models:

```bash
docker compose -f docker-compose.yml -f docker-compose.demo.yml up --build
```

Or set:
- `STT_PROVIDER=llm`
- `MT_PROVIDER=llm`
- `TTS_PROVIDER=fake`
- `LLM_FAKE_TRANSCRIPTS=true`
- `LLM_FAKE_TRANSLATIONS=true`

## Quality buffer

For CPU-only deployments, the app can intentionally delay listener output to improve STT/translation/TTS quality.

Key backend env variables:

```text
STT_SEGMENT_MAX_MS=7000
STT_SEGMENT_MIN_MS=2500
VAD_PADDING_MS=650
LISTENER_DELAY_MS=5000
```

Details are documented in:

```text
DOCS/sprint/quality_buffer_design_2026-05-07.md
```

## Gemini Live setup
1) Set `LLM_PROVIDER=gemini` and `LLM_API_KEY` in backend env.
2) Choose model via `LLM_MODEL` (default: `gemini-2.0-flash-exp`).
3) Restart backend and open the lecturer view to stream microphone audio.
4) Ensure the browser allows microphone access.

Limitations:
- The backend currently emits translations using the local translator stub; Gemini is used only for transcription.
- Translation fan-out remains best-effort per listener language.

## Self-hosted setup (faster-whisper + MarianMT + Piper)
Target free/open profiles:

- Light: `faster-whisper small int8` + MarianMT en/ru/es + Piper low en/ru/es.
- Diploma: `faster-whisper medium int8` + NLLB-200 distilled 600M en/ru/es + Piper medium en/ru/es.

### STT (faster-whisper)
Example env:
```
STT_PROVIDER=faster-whisper
STT_MODEL=base
STT_LANGUAGE=ru
STT_DEVICE=cpu
STT_COMPUTE_TYPE=int8
```

### MT (MarianMT)
Set translation pairs via `MT_MODELS`:
```
MT_PROVIDER=marian
MT_MODELS=en-US->ru-RU=Helsinki-NLP/opus-mt-en-ru,ru-RU->en-US=Helsinki-NLP/opus-mt-ru-en
```

### MT (NLLB)
Use the diploma translation profile:
```
MT_PROVIDER=nllb
MT_MODEL=facebook/nllb-200-distilled-600M
```

### TTS (Piper)
Download a Piper model and set its path:
```
TTS_PROVIDER=piper
TTS_MODEL_PATH=/path/to/voice.onnx
TTS_SAMPLE_RATE=22050
```

Notes:
- Piper requires the `piper` CLI available in PATH.
- `stream:tts` emits base64 PCM; you can add playback on the frontend later if needed.

## Model preinstall (offline)
Prefetch models so the first run does not download anything.

### STT (faster-whisper)
```bash
mkdir -p models/faster-whisper-base
python - <<'PY'
from huggingface_hub import snapshot_download

snapshot_download(
    repo_id="Systran/faster-whisper-base",
    local_dir="models/faster-whisper-base",
    local_dir_use_symlinks=False,
)
PY
```
Set `STT_MODEL=./models/faster-whisper-base`.

### MT (MarianMT)
```bash
mkdir -p models/hf
export HF_HOME="$(pwd)/models/hf"
export TRANSFORMERS_CACHE="$(pwd)/models/hf"
python - <<'PY'
from huggingface_hub import snapshot_download

snapshot_download(repo_id="Helsinki-NLP/opus-mt-ru-en", cache_dir="models/hf")
snapshot_download(repo_id="Helsinki-NLP/opus-mt-en-ru", cache_dir="models/hf")
PY
```

### TTS (Piper)
```bash
mkdir -p models/piper
PIPER_BASE="https://huggingface.co/rhasspy/piper-voices/resolve/main"
curl -L "$PIPER_BASE/en/en_US/lessac/low/en_US-lessac-low.onnx" -o models/piper/en_US-lessac-low.onnx
curl -L "$PIPER_BASE/en/en_US/lessac/low/en_US-lessac-low.onnx.json" -o models/piper/en_US-lessac-low.onnx.json
curl -L "$PIPER_BASE/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx" -o models/piper/ru_RU-irina-medium.onnx
curl -L "$PIPER_BASE/ru/ru_RU/irina/medium/ru_RU-irina-medium.onnx.json" -o models/piper/ru_RU-irina-medium.onnx.json
curl -L "$PIPER_BASE/es/es_ES/mls_9972/low/es_ES-mls_9972-low.onnx" -o models/piper/es_ES-mls_9972-low.onnx
curl -L "$PIPER_BASE/es/es_ES/mls_9972/low/es_ES-mls_9972-low.onnx.json" -o models/piper/es_ES-mls_9972-low.onnx.json
```
Set `TTS_MODEL_PATH` to one of the downloaded `.onnx` files.

## Smoke tests
After Docker is running:
```bash
docker compose exec backend python app/scripts/smoke_rest.py http://127.0.0.1:8000
docker compose exec backend python app/scripts/smoke_ws.py http://127.0.0.1:8000
docker compose exec backend python app/scripts/smoke_audio_pipeline.py http://127.0.0.1:8000
```

Browser microphone smoke with Chrome fake media:
```bash
cd frontend
npm run smoke:mic
```
