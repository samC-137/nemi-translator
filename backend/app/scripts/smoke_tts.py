import asyncio
import base64
import json
import sys
import time
from pathlib import Path

sys.path.append(str(Path(__file__).resolve().parents[2]))

from app.core.config import load_settings
from app.services.tts_fake import FakeTTS
from app.services.tts_piper import PiperTTS


SMOKE_TEXT = sys.argv[1] if len(sys.argv) > 1 else "Привет, это короткая проверка синтеза речи."
MIN_AUDIO_BYTES = 1024


def parse_model_map(raw: str) -> dict[str, str]:
    mapping = {}
    for entry in raw.split(","):
        item = entry.strip()
        if not item or "=" not in item:
            continue
        language, model = item.split("=", 1)
        if language.strip() and model.strip():
            mapping[language.strip()] = model.strip()
    return mapping


def build_engines() -> dict[str, object]:
    settings = load_settings()
    if settings.tts_provider == "fake":
        return {"fake": FakeTTS(sample_rate=settings.tts_sample_rate)}
    if settings.tts_provider != "piper":
        raise AssertionError(
            f"TTS_PROVIDER must be fake or piper, got {settings.tts_provider!r}"
        )

    engines: dict[str, object] = {}
    if settings.tts_model_path:
        engines["default"] = PiperTTS(
            model_path=settings.tts_model_path,
            sample_rate=settings.tts_sample_rate,
        )
    for language, model_path in parse_model_map(settings.tts_models).items():
        engines[language] = PiperTTS(
            model_path=model_path,
            sample_rate=settings.tts_sample_rate,
        )
    if not engines:
        raise AssertionError("Piper TTS is enabled but TTS_MODEL_PATH/TTS_MODELS is empty")
    return engines


async def main() -> None:
    settings = load_settings()
    engines = build_engines()
    results = []

    for name, engine in engines.items():
        started_at = time.monotonic()
        audio = await engine.synthesize(SMOKE_TEXT)
        elapsed_ms = int((time.monotonic() - started_at) * 1000)
        assert audio, f"{name}: TTS returned empty audio"
        assert len(audio) >= MIN_AUDIO_BYTES, (
            f"{name}: expected at least {MIN_AUDIO_BYTES} bytes, got {len(audio)}"
        )
        sample_rate = getattr(engine, "sample_rate", settings.tts_sample_rate)
        assert isinstance(sample_rate, int) and sample_rate > 0, (
            f"{name}: invalid sample_rate={sample_rate!r}"
        )
        results.append(
            {
                "engine": name,
                "provider": settings.tts_provider,
                "sampleRate": sample_rate,
                "audioBytes": len(audio),
                "audioBase64Bytes": len(base64.b64encode(audio)),
                "elapsedMs": elapsed_ms,
            }
        )

    print(
        json.dumps(
            {
                "status": "ok",
                "textChars": len(SMOKE_TEXT),
                "engines": results,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    asyncio.run(main())
