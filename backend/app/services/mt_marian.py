from typing import Dict, Optional

from transformers import MarianMTModel, MarianTokenizer


class MarianTranslator:
    def __init__(self, model_map: Dict[str, str]) -> None:
        self._model_map = model_map
        self._cache: Dict[str, tuple[MarianTokenizer, MarianMTModel]] = {}

    def _get_model(self, source_lang: str, target_lang: str):
        key = f"{source_lang}->{target_lang}"
        model_name = self._model_map.get(key)
        if not model_name:
            return None
        if model_name in self._cache:
            return self._cache[model_name]
        tokenizer = MarianTokenizer.from_pretrained(model_name)
        model = MarianMTModel.from_pretrained(model_name)
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
