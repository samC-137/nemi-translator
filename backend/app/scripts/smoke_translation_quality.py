import json
import threading
from http.server import BaseHTTPRequestHandler, HTTPServer

from app.services.mt_ollama import OllamaTranslator
from app.services.translation_quality import (
    GlossaryEntry,
    PhraseAggregator,
    TranslationGlossary,
    build_context_prompt,
    normalize_translation_text,
)


class _OllamaHandler(BaseHTTPRequestHandler):
    def do_POST(self) -> None:
        length = int(self.headers.get("Content-Length", "0"))
        body = json.loads(self.rfile.read(length).decode("utf-8"))
        assert body["model"] == "test-model"
        assert "CURRENT SEGMENT" in body["prompt"]
        response = {"response": "задержка важна для слушателя"}
        payload = json.dumps(response).encode("utf-8")
        self.send_response(200)
        self.send_header("Content-Type", "application/json")
        self.send_header("Content-Length", str(len(payload)))
        self.end_headers()
        self.wfile.write(payload)

    def log_message(self, *_args) -> None:
        return


def test_phrase_aggregation() -> None:
    aggregator = PhraseAggregator(min_chars=20, max_chars=80, timeout_ms=1000)
    assert aggregator.push("Speech", now_ms=0) is None
    assert aggregator.push("recognition latency matters.", now_ms=200) == (
        "Speech recognition latency matters."
    )
    assert aggregator.push("short", now_ms=1000) is None
    assert aggregator.flush_due(now_ms=2100) == "short"


def test_context_prompt_and_glossary() -> None:
    glossary = TranslationGlossary(
        [
            GlossaryEntry(
                source="speech recognition",
                translations={"ru-RU": "распознавание речи"},
            )
        ]
    )
    prompt = build_context_prompt(
        current_text="Speech recognition improves the demo.",
        source_language="en-US",
        target_language="ru-RU",
        context_segments=["The lecturer explains latency."],
        glossary=glossary,
    )
    assert "The lecturer explains latency." in prompt
    assert "Speech recognition improves the demo." in prompt
    assert "speech recognition => распознавание речи" in prompt
    assert "Translate only the CURRENT SEGMENT" in prompt
    enforced = glossary.enforce(
        "Speech recognition improves the demo.",
        "Демо становится лучше.",
        "ru-RU",
    )
    assert "распознавание речи" in enforced


def test_postprocessing() -> None:
    assert normalize_translation_text("Hello   world!!") == "Hello world!"
    assert normalize_translation_text("repeat once repeat once") == "repeat once"


def test_ollama_translator() -> None:
    server = HTTPServer(("127.0.0.1", 0), _OllamaHandler)
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        translator = OllamaTranslator(
            base_url=f"http://127.0.0.1:{server.server_port}",
            model="test-model",
            timeout_seconds=3,
            glossary=TranslationGlossary([]),
        )
        translated = translator.translate(
            "Latency matters for the listener.",
            "en-US",
            "ru-RU",
            ["The lecturer explains delayed streaming."],
        )
        assert translated == "задержка важна для слушателя"
    finally:
        server.shutdown()
        server.server_close()


def main() -> None:
    test_phrase_aggregation()
    test_context_prompt_and_glossary()
    test_postprocessing()
    test_ollama_translator()
    print(json.dumps({"status": "ok", "tests": 4}, ensure_ascii=False))


if __name__ == "__main__":
    main()
