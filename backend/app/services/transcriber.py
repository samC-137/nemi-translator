import logging
import time
from typing import Optional


logger = logging.getLogger("nemi")


class LLMTranscriber:
    def __init__(self, provider: str, api_key: str, fake_transcripts: bool) -> None:
        self._provider = provider
        self._api_key = api_key
        self._fake_transcripts = fake_transcripts
        self._frames = 0
        self._warned_missing = False
        self._warned_unimplemented = False

    async def handle_frame(self, room_id: str, frame: bytes) -> Optional[str]:
        if not self._api_key and not self._fake_transcripts:
            if not self._warned_missing:
                logger.warning("LLM API key missing; STT disabled")
                self._warned_missing = True
            return None

        if self._fake_transcripts:
            self._frames += 1
            if self._frames % 5 == 0:
                return f"[{self._provider}] audio frames: {self._frames}"
            return None

        if not self._warned_unimplemented:
            logger.warning("LLM provider integration not implemented: %s", self._provider)
            self._warned_unimplemented = True
        return None


class LatencyTracker:
    def __init__(self) -> None:
        self._start_ms: dict[str, int] = {}

    def start(self, room_id: str) -> None:
        if room_id not in self._start_ms:
            self._start_ms[room_id] = int(time.time() * 1000)

    def sample(self, room_id: str) -> Optional[int]:
        start_ms = self._start_ms.get(room_id)
        if start_ms is None:
            return None
        return max(0, int(time.time() * 1000) - start_ms)
