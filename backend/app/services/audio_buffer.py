from typing import List, Tuple


class AudioBuffer:
    def __init__(self, flush_bytes: int = 32000, max_bytes: int = 256000) -> None:
        self._flush_bytes = flush_bytes
        self._max_bytes = max_bytes
        self._buffer = bytearray()

    def add(self, chunk: bytes) -> Tuple[List[bytes], bool]:
        frames: List[bytes] = []
        overflowed = False
        if not chunk:
            return frames, overflowed

        self._buffer.extend(chunk)
        if len(self._buffer) > self._max_bytes:
            self._buffer.clear()
            overflowed = True
            return frames, overflowed

        while len(self._buffer) >= self._flush_bytes:
            frame = bytes(self._buffer[: self._flush_bytes])
            del self._buffer[: self._flush_bytes]
            frames.append(frame)

        return frames, overflowed
