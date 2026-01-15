import logging
from typing import Optional


logger = logging.getLogger("nemi")


class LLMTranslator:
    def __init__(self, provider: str, api_key: str, fake_translations: bool) -> None:
        self._provider = provider
        self._api_key = api_key
        self._fake_translations = fake_translations
        self._warned_missing = False
        self._warned_unimplemented = False

    async def translate(
        self, room_id: str, text: str, target_language: str
    ) -> Optional[str]:
        if not text:
            return None
        if not self._api_key and not self._fake_translations:
            if not self._warned_missing:
                logger.warning("LLM API key missing; translation disabled")
                self._warned_missing = True
            return None

        if self._fake_translations:
            return f"[{self._provider}] {text} -> {target_language}"

        if not self._warned_unimplemented:
            logger.warning("LLM translation integration not implemented: %s", self._provider)
            self._warned_unimplemented = True
        return None
