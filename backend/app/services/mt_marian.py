import logging
import os
from typing import Dict, Optional

from transformers import MarianMTModel, MarianTokenizer

logger = logging.getLogger("nemi")

DEFAULT_HF_HUB_READ_TIMEOUT = "30"
DEFAULT_HF_HUB_CONNECT_TIMEOUT = "10"


def _ensure_hf_env() -> None:
    os.environ.setdefault("HF_HUB_READ_TIMEOUT", DEFAULT_HF_HUB_READ_TIMEOUT)
    os.environ.setdefault("HF_HUB_CONNECT_TIMEOUT", DEFAULT_HF_HUB_CONNECT_TIMEOUT)


class MarianTranslator:
    def __init__(self, model_map: Dict[str, str]) -> None:
        self._model_map = model_map
        self._cache: Dict[str, tuple[MarianTokenizer, MarianMTModel]] = {}

    def _get_model(self, source_lang: str, target_lang: str):
        key = f"{source_lang}->{target_lang}"
        model_name = self._model_map.get(key)
        if not model_name:
            return None
        _ensure_hf_env()
        if model_name in self._cache:
            return self._cache[model_name]
        offline = os.getenv("TRANSFORMERS_OFFLINE") == "1" or os.getenv("HF_HUB_OFFLINE") == "1"
        try:
            tokenizer = MarianTokenizer.from_pretrained(
                model_name,
                local_files_only=offline,
            )
            model = MarianMTModel.from_pretrained(
                model_name,
                local_files_only=offline,
            )
        except Exception:
            logger.exception("Failed to load Marian model: %s", model_name)
            return None
        self._cache[model_name] = (tokenizer, model)
        return tokenizer, model

    def translate(self, text: str, source_lang: str, target_lang: str) -> Optional[str]:
        if not text:
            return None
        pair = self._get_model(source_lang, target_lang)
        if not pair:
            return None
        tokenizer, model = pair
        inputs = tokenizer(text, return_tensors="pt", padding=True, truncation=True)
        outputs = model.generate(**inputs)
        return tokenizer.batch_decode(outputs, skip_special_tokens=True)[0]
