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
    stt_segment_max_ms: int
    stt_segment_min_ms: int
    vad_padding_ms: int
    mt_provider: str
    mt_model: str
    mt_models: str
    ollama_base_url: str
    ollama_model: str
    ollama_timeout_seconds: int
    translation_context_segments: int
    translation_glossary_path: str
    phrase_min_chars: int
    phrase_max_chars: int
    phrase_timeout_ms: int
    phrase_max_sentences: int
    phrase_inactivity_ms: int
    phrase_max_age_ms: int
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
        stt_segment_max_ms=_get_int("STT_SEGMENT_MAX_MS", 2000),
        stt_segment_min_ms=_get_int("STT_SEGMENT_MIN_MS", 0),
        vad_padding_ms=_get_int("VAD_PADDING_MS", 160),
        mt_provider=_get_env("MT_PROVIDER", "llm") or "llm",
        mt_model=_get_env("MT_MODEL", "facebook/nllb-200-distilled-600M")
        or "facebook/nllb-200-distilled-600M",
        mt_models=_get_env("MT_MODELS", "") or "",
        ollama_base_url=_get_env("OLLAMA_BASE_URL", "http://host.docker.internal:11434")
        or "http://host.docker.internal:11434",
        ollama_model=_get_env("OLLAMA_MODEL", "qwen2.5:7b-instruct")
        or "qwen2.5:7b-instruct",
        ollama_timeout_seconds=_get_int("OLLAMA_TIMEOUT_SECONDS", 45),
        translation_context_segments=_get_int("TRANSLATION_CONTEXT_SEGMENTS", 4),
        translation_glossary_path=_get_env(
            "TRANSLATION_GLOSSARY_PATH",
            "/app/app/config/glossary.json",
        )
        or "/app/app/config/glossary.json",
        phrase_min_chars=_get_int("PHRASE_MIN_CHARS", 24),
        phrase_max_chars=_get_int("PHRASE_MAX_CHARS", 220),
        phrase_timeout_ms=_get_int("PHRASE_TIMEOUT_MS", 1800),
        phrase_max_sentences=_get_int("PHRASE_MAX_SENTENCES", 2),
        phrase_inactivity_ms=_get_int("PHRASE_INACTIVITY_MS", 800),
        phrase_max_age_ms=_get_int("PHRASE_MAX_AGE_MS", 10_000),
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
