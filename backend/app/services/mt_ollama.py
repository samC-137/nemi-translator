import json
import logging
from typing import Optional
from urllib.error import URLError
from urllib.request import Request, urlopen

from app.services.translation_quality import (
    TranslationGlossary,
    build_context_prompt,
    normalize_translation_text,
    parse_ollama_response,
)

logger = logging.getLogger("nemi")


class OllamaTranslator:
    def __init__(
        self,
        base_url: str,
        model: str,
        timeout_seconds: int,
        glossary: TranslationGlossary,
    ) -> None:
        self._base_url = base_url.rstrip("/")
        self._model = model
        self._timeout_seconds = max(1, timeout_seconds)
        self._glossary = glossary

    @property
    def model_name(self) -> str:
        return self._model

    def translate(
        self,
        text: str,
        source_lang: str,
        target_lang: str,
        context_segments: Optional[list[str]] = None,
    ) -> Optional[str]:
        if not text:
            return None
        prompt = build_context_prompt(
            current_text=text,
            source_language=source_lang,
            target_language=target_lang,
            context_segments=context_segments or [],
            glossary=self._glossary,
        )
        payload = {
            "model": self._model,
            "prompt": prompt,
            "stream": False,
            "options": {
                "temperature": 0.1,
                "top_p": 0.9,
                "num_predict": 256,
            },
        }
        request = Request(
            f"{self._base_url}/api/generate",
            data=json.dumps(payload).encode("utf-8"),
            headers={"Content-Type": "application/json"},
            method="POST",
        )
        try:
            with urlopen(request, timeout=self._timeout_seconds) as response:
                response_payload = json.loads(response.read().decode("utf-8"))
        except URLError as exc:
            raise RuntimeError(
                f"Ollama is unavailable at {self._base_url}; start Ollama and pull {self._model}."
            ) from exc
        except TimeoutError as exc:
            raise RuntimeError(
                f"Ollama translation timed out after {self._timeout_seconds}s."
            ) from exc
        except Exception:
            logger.exception("Ollama translation request failed")
            raise

        translated = normalize_translation_text(parse_ollama_response(response_payload))
        if not translated:
            return None
        return self._glossary.enforce(text, translated, target_lang)
