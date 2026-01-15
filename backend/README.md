# Backend (FastAPI)

## Setup
1) Create a virtual environment.
2) Install dependencies:
   - `pip install -r requirements.txt`

## Run (dev)
- `uvicorn app.main:app --reload`

## Environment
Set values in your shell or a local .env file (do not commit secrets).

- `APP_NAME` (default: `NEMI Backend`)
- `APP_ENV` (default: `development`)
- `JWT_SECRET` (default: `dev-change-me`)
- `JWT_ALG` (default: `HS256`)
- `JWT_EXPIRES_MINUTES` (default: `60`)
- `REDIS_URL` (default: `redis://localhost:6379/0`)
- `LLM_PROVIDER` (default: `gemini`)
- `LLM_API_KEY` (default: empty)
- `LLM_FAKE_TRANSCRIPTS` (default: `false`)
- `LLM_FAKE_TRANSLATIONS` (default: `false`)
- `ADMIN_USER` (default: `admin`)
- `ADMIN_PASSWORD` (default: `admin`)

Note: Health endpoints and logging are added in later tasks.
