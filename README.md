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

## Env templates
- Backend: `backend/.env.example`
- Frontend: `frontend/.env.example`

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
- `MT_MODELS` (default: empty)
- `TTS_PROVIDER` (default: `none`)
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
For local demos without real STT/translation, set:
- `LLM_FAKE_TRANSCRIPTS=true`
- `LLM_FAKE_TRANSLATIONS=true`

## Gemini Live setup
1) Set `LLM_PROVIDER=gemini` and `LLM_API_KEY` in backend env.
2) Choose model via `LLM_MODEL` (default: `gemini-2.0-flash-exp`).
3) Restart backend and open the lecturer view to stream microphone audio.
4) Ensure the browser allows microphone access.

Limitations:
- The backend currently emits translations using the local translator stub; Gemini is used only for transcription.
- Translation fan-out remains best-effort per listener language.

## Self-hosted setup (faster-whisper + MarianMT + Piper)
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
