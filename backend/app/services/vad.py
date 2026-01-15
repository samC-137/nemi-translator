from collections import deque
from typing import Deque, List

import webrtcvad


class VADSegmenter:
    def __init__(
        self,
        sample_rate: int = 16000,
        frame_ms: int = 20,
        padding_ms: int = 160,
        max_segment_ms: int = 2000,
        min_segment_ms: int = 0,
        pre_speech_ms: int = 120,
        carryover_ms: int = 40,
        aggressiveness: int = 2,
    ) -> None:
        if frame_ms not in (10, 20, 30):
            raise ValueError("frame_ms must be 10, 20, or 30")
        if padding_ms <= 0:
            raise ValueError("padding_ms must be positive")
        if max_segment_ms <= 0:
            raise ValueError("max_segment_ms must be positive")
        self._sample_rate = sample_rate
        self._frame_ms = frame_ms
        self._padding_ms = padding_ms
        self._max_segment_ms = max_segment_ms
        self._min_segment_ms = min_segment_ms
        self._frame_bytes = int(sample_rate * frame_ms / 1000) * 2
        self._vad = webrtcvad.Vad(aggressiveness)
        self._buffer = bytearray()
        self._segment_frames: List[bytes] = []
        self._pre_speech: Deque[bytes] = deque(
            maxlen=self._frames_for_ms(pre_speech_ms) if pre_speech_ms > 0 else 0
        )
        self._padding_frames = self._frames_for_ms(padding_ms)
        self._max_segment_frames = self._frames_for_ms(max_segment_ms)
        self._min_segment_frames = (
            self._frames_for_ms(min_segment_ms) if min_segment_ms > 0 else 0
        )
        self._carryover_frames = (
            self._frames_for_ms(carryover_ms) if carryover_ms > 0 else 0
        )
        if self._carryover_frames >= self._max_segment_frames:
            self._carryover_frames = max(0, self._max_segment_frames - 1)
        self._silence_frames = 0
        self._in_speech = False

    def push(self, chunk: bytes) -> List[bytes]:
        if chunk:
            self._buffer.extend(chunk)
        segments: List[bytes] = []
        while len(self._buffer) >= self._frame_bytes:
            frame = bytes(self._buffer[: self._frame_bytes])
            del self._buffer[: self._frame_bytes]
            is_speech = self._vad.is_speech(frame, self._sample_rate)
            if self._in_speech:
                self._segment_frames.append(frame)
                if is_speech:
                    self._silence_frames = 0
                else:
                    self._silence_frames += 1
                    if self._silence_frames >= self._padding_frames:
                        self._emit_segment(segments, self._segment_without_silence())
                        self._reset_segment()
                        continue

                if len(self._segment_frames) >= self._max_segment_frames:
                    if self._silence_frames:
                        self._emit_segment(segments, self._segment_without_silence())
                        self._reset_segment()
                        continue
                    split_index = len(self._segment_frames) - self._carryover_frames
                    if split_index <= 0:
                        split_index = len(self._segment_frames)
                    self._emit_segment(segments, self._segment_frames[:split_index])
                    self._segment_frames = self._segment_frames[split_index:]
                    self._silence_frames = 0
                continue

            if is_speech:
                self._in_speech = True
                if self._pre_speech:
                    self._segment_frames = list(self._pre_speech)
                    self._pre_speech.clear()
                else:
                    self._segment_frames = []
                self._segment_frames.append(frame)
                self._silence_frames = 0
            elif self._pre_speech.maxlen:
                self._pre_speech.append(frame)
        return segments

    def flush(self) -> List[bytes]:
        segments: List[bytes] = []
        if self._segment_frames:
            self._emit_segment(segments, self._segment_without_silence())
        self._segment_frames = []
        self._buffer = bytearray()
        self._pre_speech.clear()
        self._silence_frames = 0
        self._in_speech = False
        return segments

    def _segment_without_silence(self) -> List[bytes]:
        if self._silence_frames <= 0:
            return self._segment_frames
        end_index = len(self._segment_frames) - self._silence_frames
        if end_index <= 0:
            return []
        return self._segment_frames[:end_index]

    def _emit_segment(self, segments: List[bytes], frames: List[bytes]) -> None:
        if not frames:
            return
        if self._min_segment_frames and len(frames) < self._min_segment_frames:
            return
        segments.append(b"".join(frames))

    def _reset_segment(self) -> None:
        self._segment_frames = []
        self._silence_frames = 0
        self._in_speech = False

    def _frames_for_ms(self, value_ms: int) -> int:
        return max(1, (value_ms + self._frame_ms - 1) // self._frame_ms)
