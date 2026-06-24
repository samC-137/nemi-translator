import asyncio
import base64
import json
import os
import sys
import time
from pathlib import Path
from urllib.request import Request, urlopen

import numpy as np
import websockets

sys.path.append(str(Path(__file__).resolve().parents[2]))

from app.services.tts_piper import PiperTTS


BASE_HTTP_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:8000"
BASE_WS_URL = BASE_HTTP_URL.replace("http://", "ws://").replace("https://", "wss://")


def post(path: str, payload: dict):
    req = Request(
        f"{BASE_HTTP_URL}{path}",
        data=json.dumps(payload).encode("utf-8"),
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    with urlopen(req, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def get(path: str, token: str | None = None):
    headers = {}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(f"{BASE_HTTP_URL}{path}", headers=headers, method="GET")
    with urlopen(req, timeout=10) as response:
        return json.loads(response.read().decode("utf-8"))


def resample_pcm16(raw: bytes, in_rate: int, out_rate: int = 16000) -> bytes:
    audio = np.frombuffer(raw, dtype=np.int16).astype(np.float32)
    duration = len(audio) / in_rate
    src_x = np.linspace(0, duration, num=len(audio), endpoint=False)
    dst_len = int(duration * out_rate)
    dst_x = np.linspace(0, duration, num=dst_len, endpoint=False)
    resampled = np.interp(dst_x, src_x, audio)
    return np.clip(resampled, -32768, 32767).astype(np.int16).tobytes()


def make_test_audio() -> bytes:
    model_path = os.getenv("SMOKE_TTS_MODEL") or os.getenv("TTS_MODEL_PATH")
    if not model_path:
        sample_rate = 16000
        seconds = 2
        samples = np.zeros(sample_rate * seconds, dtype=np.int16)
        samples[::2] = 1200
        return samples.tobytes()
    tts = PiperTTS(model_path)
    raw = tts._synthesize_sync("Hello world. This is a short test lecture.")
    speech = resample_pcm16(raw, tts.sample_rate, 16000)
    silence = np.zeros(16000, dtype=np.int16).tobytes()
    return speech + silence


async def recv_until(listener, expected: set[str], timeout: int = 90) -> dict[str, dict]:
    found: dict[str, dict] = {}
    end_at = asyncio.get_running_loop().time() + timeout
    while expected - set(found):
        remaining = max(1, end_at - asyncio.get_running_loop().time())
        event = json.loads(await asyncio.wait_for(listener.recv(), timeout=remaining))
        event_name = event.get("event")
        if event_name in expected:
            found[event_name] = event
    return found


async def main() -> None:
    room = post(
        "/rooms",
        {"sourceLanguage": {"code": "en-US", "name": "English"}},
    )
    room_id = room["roomId"]
    audio = make_test_audio()
    admin = post("/admin/login", {"username": "admin", "password": "admin"})
    admin_token = admin["token"]

    async with websockets.connect(f"{BASE_WS_URL}/ws") as lecturer:
        await lecturer.send(
            json.dumps(
                {
                    "event": "room:join",
                    "payload": {
                        "roomId": room_id,
                        "role": "lecturer",
                        "sourceLanguage": {"code": "en-US", "name": "English"},
                    },
                }
            )
        )
        async with websockets.connect(f"{BASE_WS_URL}/ws") as listener:
            await listener.send(
                json.dumps(
                    {
                        "event": "room:join",
                        "payload": {
                            "roomId": room_id,
                            "role": "listener",
                            "targetLanguage": {"code": "ru-RU", "name": "Russian"},
                        },
                    }
                )
            )
            async with websockets.connect(f"{BASE_WS_URL}/ws/rooms/{room_id}/audio") as audio_ws:
                started_at = time.monotonic()
                chunk_size = 4096
                for start in range(0, len(audio), chunk_size):
                    await audio_ws.send(audio[start : start + chunk_size])
                    await asyncio.sleep(0.01)
                await asyncio.sleep(1.1)

            events = await recv_until(
                listener,
                {"stream:transcription", "stream:translation", "stream:tts"},
            )
            elapsed_ms = int((time.monotonic() - started_at) * 1000)

    transcription_event = events["stream:transcription"]
    translation_event = events["stream:translation"]
    tts_event = events["stream:tts"]
    transcription = transcription_event["payload"]["packet"]["text"]
    translation = translation_event["payload"]["packet"]["text"]
    tts_payload = tts_event["payload"]
    tts_audio = tts_payload["audio"]
    tts_sample_rate = tts_payload["sampleRate"]
    tts_target_language = tts_payload["targetLanguage"]["code"]
    tts_audio_bytes = base64.b64decode(tts_audio)
    detail = get(f"/admin/rooms/{room_id}", admin_token)
    latency_ms = detail["latency"]
    assert transcription
    assert translation
    assert tts_audio
    assert len(tts_audio_bytes) >= 1024
    assert isinstance(tts_sample_rate, int) and tts_sample_rate > 0
    assert tts_target_language == "ru-RU"
    assert isinstance(latency_ms, int)
    print(
        json.dumps(
            {
                "status": "ok",
                "roomId": room_id,
                "events": sorted(events),
                "transcription": transcription,
                "translation": translation,
                "ttsBytesBase64": len(tts_audio),
                "ttsBytesRaw": len(tts_audio_bytes),
                "ttsSampleRate": tts_sample_rate,
                "ttsTargetLanguage": tts_target_language,
                "elapsedMs": elapsed_ms,
                "backendLatencyMs": latency_ms,
            },
            ensure_ascii=False,
        )
    )


if __name__ == "__main__":
    asyncio.run(main())
