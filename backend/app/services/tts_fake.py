import math


class FakeTTS:
    def __init__(self, sample_rate: int = 16000) -> None:
        self.sample_rate = sample_rate or 16000

    async def synthesize(self, text: str) -> bytes:
        duration_seconds = min(2.0, max(0.4, len(text) / 40))
        total_samples = int(self.sample_rate * duration_seconds)
        amplitude = 0.18 * 32767
        frequency = 440
        samples = bytearray()
        for i in range(total_samples):
            value = int(amplitude * math.sin(2 * math.pi * frequency * (i / self.sample_rate)))
            samples.extend(value.to_bytes(2, byteorder="little", signed=True))
        return bytes(samples)
