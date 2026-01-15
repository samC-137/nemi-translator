from dataclasses import dataclass
import os
from typing import Optional


def _get_env(key: str, default: Optional[str] = None) -> Optional[str]:
    value = os.getenv(key)
    if value is None or value == "":
        return default
    return value


def _get_int(key: str, default: int) -> int:
    value = os.getenv(key)
    if value is None or value == "":
        return default
    try:
        return int(value)
    except ValueError:
        return default


def _get_bool(key: str, default: bool) -> bool:
    value = os.getenv(key)
    if value is None or value == "":
        return default
    return value.strip().lower() in {"1", "true", "yes", "on"}


@dataclass(frozen=True)
class Settings:
    app_name: str
    environment: str
    jwt_secret: str
    jwt_algorithm: str
    jwt_expires_minutes: int
    redis_url: str
    stt_provider: str
    stt_model: str
    stt_language: str
    stt_device: str
    stt_compute_type: str
    mt_provider: str
    mt_models: str
    tts_provider: str
    tts_models: str
    tts_model_path: str
    tts_sample_rate: int
    listener_delay_ms: int
    llm_provider: str
    llm_model: str
    llm_api_key: str
    llm_fake_transcripts: bool
    llm_fake_translations: bool
    admin_user: str
    admin_password: str


def load_settings() -> Settings:
    return Settings(
        app_name=_get_env("APP_NAME", "NEMI Backend") or "NEMI Backend",
        environment=_get_env("APP_ENV", "development") or "development",
        jwt_secret=_get_env("JWT_SECRET", "dev-change-me") or "dev-change-me",
        jwt_algorithm=_get_env("JWT_ALG", "HS256") or "HS256",
        jwt_expires_minutes=_get_int("JWT_EXPIRES_MINUTES", 60),
        redis_url=_get_env("REDIS_URL", "redis://localhost:6379/0")
        or "redis://localhost:6379/0",
        stt_provider=_get_env("STT_PROVIDER", "llm") or "llm",
        stt_model=_get_env("STT_MODEL", "base") or "base",
        stt_language=_get_env("STT_LANGUAGE", "") or "",
        stt_device=_get_env("STT_DEVICE", "cpu") or "cpu",
        stt_compute_type=_get_env("STT_COMPUTE_TYPE", "int8") or "int8",
        mt_provider=_get_env("MT_PROVIDER", "llm") or "llm",
        mt_models=_get_env("MT_MODELS", "") or "",
        tts_provider=_get_env("TTS_PROVIDER", "none") or "none",
        tts_models=_get_env("TTS_MODELS", "") or "",
        tts_model_path=_get_env("TTS_MODEL_PATH", "") or "",
        tts_sample_rate=_get_int("TTS_SAMPLE_RATE", 22050),
        listener_delay_ms=_get_int("LISTENER_DELAY_MS", 700),
        llm_provider=_get_env("LLM_PROVIDER", "gemini") or "gemini",
        llm_model=_get_env("LLM_MODEL", "gemini-2.0-flash-exp") or "gemini-2.0-flash-exp",
        llm_api_key=_get_env("LLM_API_KEY", "") or "",
        llm_fake_transcripts=_get_bool("LLM_FAKE_TRANSCRIPTS", False),
        llm_fake_translations=_get_bool("LLM_FAKE_TRANSLATIONS", False),
        admin_user=_get_env("ADMIN_USER", "admin") or "admin",
        admin_password=_get_env("ADMIN_PASSWORD", "admin") or "admin",
    )
