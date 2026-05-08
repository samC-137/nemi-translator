import json
import re
import time
from dataclasses import dataclass
from pathlib import Path
from typing import Any, Optional


LANGUAGE_NAMES = {
    "en-US": "English",
    "ru-RU": "Russian",
    "es-ES": "Spanish",
}


@dataclass(frozen=True)
class GlossaryEntry:
    source: str
    translations: dict[str, str]


class TranslationGlossary:
    def __init__(self, entries: list[GlossaryEntry]) -> None:
        self._entries = entries

    @classmethod
    def from_path(cls, path: str) -> "TranslationGlossary":
        if not path:
            return cls([])
        glossary_path = Path(path)
        if not glossary_path.exists():
            return cls([])
        with glossary_path.open("r", encoding="utf-8") as file:
            raw = json.load(file)
        entries: list[GlossaryEntry] = []
        for item in raw.get("terms", []):
            source = str(item.get("source", "")).strip()
            translations = item.get("translations", {})
            if source and isinstance(translations, dict):
                entries.append(
                    GlossaryEntry(
                        source=source,
                        translations={
                            str(language): str(term).strip()
                            for language, term in translations.items()
                            if str(term).strip()
                        },
                    )
                )
        return cls(entries)

    def prompt_lines(self, source_text: str, target_language: str) -> list[str]:
        lines = []
        lowered = source_text.lower()
        for entry in self._entries:
            target_term = entry.translations.get(target_language)
            if target_term and entry.source.lower() in lowered:
                lines.append(f"{entry.source} => {target_term}")
        return lines

    def enforce(self, source_text: str, translated_text: str, target_language: str) -> str:
        result = translated_text
        lowered_source = source_text.lower()
        lowered_result = result.lower()
        for entry in self._entries:
            target_term = entry.translations.get(target_language)
            if not target_term:
                continue
            if entry.source.lower() not in lowered_source:
                continue
            if target_term.lower() in lowered_result:
                continue
            # Do not rewrite the sentence structure for deterministic MT; append
            # the preferred term once so the listener sees the expected domain term.
            result = f"{result} ({target_term})"
            lowered_result = result.lower()
        return result


def normalize_translation_text(text: str) -> str:
    cleaned = re.sub(r"\s+", " ", text or "").strip()
    cleaned = re.sub(r"([.!?,;:])\1+", r"\1", cleaned)
    cleaned = re.sub(r"\s+([.!?,;:])", r"\1", cleaned)
    words = cleaned.split()
    if len(words) >= 2 and len(words) % 2 == 0:
        midpoint = len(words) // 2
        if words[:midpoint] == words[midpoint:]:
            cleaned = " ".join(words[:midpoint])
    return cleaned


class PhraseAggregator:
    def __init__(
        self,
        min_chars: int,
        max_chars: int,
        timeout_ms: int,
    ) -> None:
        self._min_chars = max(1, min_chars)
        self._max_chars = max(self._min_chars, max_chars)
        self._timeout_ms = max(0, timeout_ms)
        self._parts: list[str] = []
        self._first_seen_ms: Optional[int] = None

    def push(self, text: str, now_ms: Optional[int] = None) -> Optional[str]:
        cleaned = normalize_translation_text(text)
        if not cleaned:
            return None
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        if self._first_seen_ms is None:
            self._first_seen_ms = now
        self._parts.append(cleaned)
        phrase = self._current_phrase()
        if self._should_flush(phrase, now):
            return self.flush()
        return None

    def flush_due(self, now_ms: Optional[int] = None) -> Optional[str]:
        if not self._parts or self._first_seen_ms is None:
            return None
        now = now_ms if now_ms is not None else int(time.time() * 1000)
        if self._timeout_ms and now - self._first_seen_ms >= self._timeout_ms:
            return self.flush()
        return None

    def flush(self) -> Optional[str]:
        phrase = self._current_phrase()
        self._parts = []
        self._first_seen_ms = None
        return phrase or None

    def has_pending(self) -> bool:
        return bool(self._parts)

    def _current_phrase(self) -> str:
        return normalize_translation_text(" ".join(self._parts))

    def _should_flush(self, phrase: str, now_ms: int) -> bool:
        if not phrase:
            return False
        if len(phrase) >= self._max_chars:
            return True
        if len(phrase) >= self._min_chars and phrase[-1] in ".!?;:":
            return True
        if (
            self._first_seen_ms is not None
            and self._timeout_ms
            and now_ms - self._first_seen_ms >= self._timeout_ms
        ):
            return True
        return False


def build_context_prompt(
    current_text: str,
    source_language: str,
    target_language: str,
    context_segments: list[str],
    glossary: TranslationGlossary,
) -> str:
    source_name = LANGUAGE_NAMES.get(source_language, source_language or "source language")
    target_name = LANGUAGE_NAMES.get(target_language, target_language or "target language")
    context = "\n".join(f"- {segment}" for segment in context_segments if segment.strip())
    glossary_lines = glossary.prompt_lines(
        " ".join([*context_segments, current_text]),
        target_language,
    )
    glossary_text = "\n".join(f"- {line}" for line in glossary_lines)
    return (
        "You are a lecture translation engine. Translate only the CURRENT SEGMENT.\n"
        f"Source language: {source_name}.\n"
        f"Target language: {target_name}.\n"
        "Use the previous context only to resolve meaning. Do not translate or repeat it.\n"
        "Return only the translated current segment, without explanations.\n\n"
        f"PREVIOUS CONTEXT:\n{context or '- none'}\n\n"
        f"GLOSSARY:\n{glossary_text or '- none'}\n\n"
        f"CURRENT SEGMENT:\n{current_text}"
    )


def parse_ollama_response(payload: dict[str, Any]) -> str:
    if isinstance(payload.get("response"), str):
        return payload["response"]
    message = payload.get("message")
    if isinstance(message, dict) and isinstance(message.get("content"), str):
        return message["content"]
    return ""
