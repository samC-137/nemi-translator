import logging

from app.core.config import load_settings
from app.services.connections import ConnectionManager
from app.services.store import InMemoryStore
from app.services.stt_faster_whisper import FasterWhisperSTT
from app.services.transcriber import LLMTranscriber, LatencyTracker
from app.services.mt_marian import MarianTranslator
from app.services.translator import LLMTranslator
from app.services.tts_piper import PiperTTS

settings = load_settings()
logger = logging.getLogger("nemi")


def _parse_model_map(raw: str) -> dict:
    mapping = {}
    if not raw:
        return mapping
    for entry in raw.split(","):
        item = entry.strip()
        if not item:
            continue
        if "=" not in item:
            continue
        pair, model = item.split("=", 1)
        key = pair.strip()
        model_name = model.strip()
        if key and model_name:
            mapping[key] = model_name
    return mapping

store = InMemoryStore()
connections = ConnectionManager()
transcriber = LLMTranscriber(
    provider=settings.llm_provider,
    api_key=settings.llm_api_key,
    fake_transcripts=settings.llm_fake_transcripts,
)
latency_tracker = LatencyTracker()
translator = LLMTranslator(
    provider=settings.llm_provider,
    api_key=settings.llm_api_key,
    fake_translations=settings.llm_fake_translations,
)
marian_translator = (
    MarianTranslator(_parse_model_map(settings.mt_models))
    if settings.mt_provider == "marian"
    else None
)
tts_engine = (
    PiperTTS(
        model_path=settings.tts_model_path,
        sample_rate=settings.tts_sample_rate,
    )
    if settings.tts_provider == "piper" and settings.tts_model_path
    else None
)
tts_engines = {}
if settings.tts_provider == "piper" and settings.tts_models:
    for language, model_path in _parse_model_map(settings.tts_models).items():
        if model_path:
            tts_engines[language] = PiperTTS(
                model_path=model_path,
                sample_rate=settings.tts_sample_rate,
            )
def _init_stt_engine() -> FasterWhisperSTT | None:
    if settings.stt_provider != "faster-whisper":
        return None
    try:
        return FasterWhisperSTT(
            model_name=settings.stt_model,
            device=settings.stt_device,
            compute_type=settings.stt_compute_type,
            language=settings.stt_language,
        )
    except Exception:
        logger.exception(
            "Failed to initialize faster-whisper STT; falling back to LLM transcriber."
        )
        return None


stt_engine = _init_stt_engine()
