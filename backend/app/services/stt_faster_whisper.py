import asyncio
import re
from typing import Optional

import numpy as np
from faster_whisper import WhisperModel


class FasterWhisperSTT:
    _HALLUCINATIONS = [
        (
            "\u0420\u0435\u0434\u0430\u043a\u0442\u043e\u0440 \u0441\u0443\u0431\u0442\u0438\u0442\u0440\u043e\u0432 "
            "\u0418. \u0416\u0443\u043a\u043e\u0432\u0430 \u041a\u043e\u0440\u0440\u0435\u043a\u0442\u043e\u0440 "
            "\u0412. \u0421\u0443\u0445\u0438\u0430\u0448\u0432\u0438\u043b\u0438"
        ),
    ]
    _HALLUCINATION_PATTERNS = [
        r"Редактор\s+субтитров.*?Корректор\s*В\.?\s*Сухиашвили",
        r"Перестанем\s+говорить\s+обо.*",
    ]

    def __init__(
        self,
        model_name: str,
        device: str = "cpu",
        compute_type: str = "int8",
        language: str = "",
    ) -> None:
        self._model = WhisperModel(model_name, device=device, compute_type=compute_type)
        self._language = self._normalize_language(language)

    async def transcribe(self, pcm_bytes: bytes, language: Optional[str] = None) -> Optional[str]:
        if not pcm_bytes:
            return None
        language_hint = self._normalize_language(language) or self._language
        return await asyncio.to_thread(self._transcribe_sync, pcm_bytes, language_hint)

    def _transcribe_sync(self, pcm_bytes: bytes, language: Optional[str]) -> Optional[str]:
        audio = self._pcm16_to_float32(pcm_bytes)
        segments, _ = self._model.transcribe(
            audio,
            language=language,
            beam_size=1,
            vad_filter=False,
        )
        texts = [segment.text.strip() for segment in segments if segment.text]
        merged = " ".join([text for text in texts if text])
        cleaned = self._clean_transcript(merged)
        return cleaned or None

    @classmethod
    def _clean_transcript(cls, text: str) -> str:
        cleaned = text
        for phrase in cls._HALLUCINATIONS:
            cleaned = re.sub(re.escape(phrase), "", cleaned, flags=re.IGNORECASE)
        for pattern in cls._HALLUCINATION_PATTERNS:
            cleaned = re.sub(pattern, "", cleaned, flags=re.IGNORECASE)
        cleaned = " ".join(cleaned.split()).strip()
        return cls._polish_transcript(cleaned)

    @staticmethod
    def _polish_transcript(text: str) -> str:
        if not text:
            return ""
        cleaned = text.strip()
        if not cleaned:
            return ""
        if cleaned[0].isalpha():
            cleaned = cleaned[0].upper() + cleaned[1:]
        if cleaned[-1].isalnum():
            cleaned += "."
        return cleaned

    @staticmethod
    def _pcm16_to_float32(pcm_bytes: bytes) -> np.ndarray:
        audio = np.frombuffer(pcm_bytes, dtype=np.int16).astype(np.float32)
        return audio / 32768.0

    @staticmethod
    def _normalize_language(language: Optional[str]) -> Optional[str]:
        if not language:
            return None
        normalized = language.strip().lower()
        if not normalized:
            return None
        aliases = {
            "english": "en",
            "russian": "ru",
            "chinese": "zh",
            "japanese": "ja",
            "french": "fr",
            "german": "de",
            "spanish": "es",
            "italian": "it",
            "portuguese": "pt",
            "dutch": "nl",
            "polish": "pl",
            "turkish": "tr",
            "ukrainian": "uk",
            "korean": "ko",
        }
        normalized = normalized.replace("(", " ").replace(")", " ").replace("/", " ").strip()
        if normalized in aliases:
            return aliases[normalized]
        for sep in ("-", "_"):
            if sep in normalized:
                normalized = normalized.split(sep, 1)[0]
                break
        if " " in normalized:
            normalized = normalized.split(" ", 1)[0]
        if normalized in aliases:
            return aliases[normalized]
        if not normalized.isalpha() or len(normalized) > 3:
            return None
        return normalized
