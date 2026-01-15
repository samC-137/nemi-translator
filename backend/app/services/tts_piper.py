import asyncio
import json
import logging
import subprocess
from pathlib import Path
from typing import Optional

logger = logging.getLogger("nemi")


class PiperTTS:
    def __init__(self, model_path: str, sample_rate: Optional[int] = None) -> None:
        self._model_path = model_path
        self._config_path = self._resolve_config_path()
        self._sample_rate = self._resolve_sample_rate(sample_rate)

    @property
    def sample_rate(self) -> int:
        return self._sample_rate

    async def synthesize(self, text: str) -> Optional[bytes]:
        if not text:
            return None
        return await asyncio.to_thread(self._synthesize_sync, text)

    def _synthesize_sync(self, text: str) -> Optional[bytes]:
        command = ["piper", "--model", self._model_path, "--output-raw"]
        if self._config_path:
            command.extend(["--config", self._config_path])
        process = subprocess.Popen(
            command,
            stdin=subprocess.PIPE,
            stdout=subprocess.PIPE,
            stderr=subprocess.PIPE,
        )
        stdout, stderr = process.communicate(input=text.encode("utf-8"))
        if process.returncode != 0:
            logger.warning(
                "Piper TTS failed: model=%s stderr=%s",
                self._model_path,
                stderr.decode("utf-8", errors="replace").strip(),
            )
            return None
        return stdout

    def _resolve_sample_rate(self, fallback: Optional[int]) -> int:
        if self._config_path:
            try:
                data = json.loads(Path(self._config_path).read_text(encoding="utf-8"))
                rate = data.get("audio", {}).get("sample_rate")
                if isinstance(rate, int) and rate > 0:
                    return rate
            except (OSError, json.JSONDecodeError):
                pass
        if isinstance(fallback, int) and fallback > 0:
            return fallback
        return 22050

    def _resolve_config_path(self) -> Optional[str]:
        config_path = Path(f"{self._model_path}.json")
        if config_path.exists():
            return str(config_path)
        return None
