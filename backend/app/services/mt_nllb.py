import logging
import os
from typing import Optional

from transformers import AutoModelForSeq2SeqLM, AutoTokenizer

logger = logging.getLogger("nemi")

NLLB_LANGUAGE_CODES = {
    "en": "eng_Latn",
    "en-US": "eng_Latn",
    "english": "eng_Latn",
    "ru": "rus_Cyrl",
    "ru-RU": "rus_Cyrl",
    "russian": "rus_Cyrl",
    "es": "spa_Latn",
    "es-ES": "spa_Latn",
    "spanish": "spa_Latn",
}


def _ensure_hf_env() -> None:
    os.environ.setdefault("HF_HUB_READ_TIMEOUT", "30")
    os.environ.setdefault("HF_HUB_CONNECT_TIMEOUT", "10")


class NllbTranslator:
    def __init__(self, model_name: str) -> None:
        self._model_name = model_name
        self._tokenizer = None
        self._model = None

    @staticmethod
    def normalize_language(language: str) -> Optional[str]:
        if not language:
            return None
        normalized = language.strip()
        if normalized in NLLB_LANGUAGE_CODES:
            return NLLB_LANGUAGE_CODES[normalized]
        lower = normalized.lower()
        if lower in NLLB_LANGUAGE_CODES:
            return NLLB_LANGUAGE_CODES[lower]
        if "-" in normalized:
            return NLLB_LANGUAGE_CODES.get(normalized.split("-", 1)[0].lower())
        return None

    @classmethod
    def supported_app_languages(cls) -> list[str]:
        return ["en-US", "ru-RU", "es-ES"]

    def _load(self):
        if self._tokenizer is not None and self._model is not None:
            return self._tokenizer, self._model
        _ensure_hf_env()
        offline = os.getenv("TRANSFORMERS_OFFLINE") == "1" or os.getenv("HF_HUB_OFFLINE") == "1"
        try:
            self._tokenizer = AutoTokenizer.from_pretrained(
                self._model_name,
                local_files_only=offline,
            )
            self._model = AutoModelForSeq2SeqLM.from_pretrained(
                self._model_name,
                local_files_only=offline,
            )
        except Exception:
            logger.exception("Failed to load NLLB model: %s", self._model_name)
            return None
        return self._tokenizer, self._model

    def translate(self, text: str, source_lang: str, target_lang: str) -> Optional[str]:
        if not text:
            return None
        source_code = self.normalize_language(source_lang)
        target_code = self.normalize_language(target_lang)
        if not source_code or not target_code:
            logger.warning(
                "Unsupported NLLB language pair: source=%s target=%s",
                source_lang,
                target_lang,
            )
            return None
        pair = self._load()
        if not pair:
            return None
        tokenizer, model = pair
        tokenizer.src_lang = source_code
        inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True)
        forced_bos_token_id = tokenizer.convert_tokens_to_ids(target_code)
        outputs = model.generate(
            **inputs,
            forced_bos_token_id=forced_bos_token_id,
            max_new_tokens=256,
        )
        return tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]
