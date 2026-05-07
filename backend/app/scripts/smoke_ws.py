import asyncio
import json
import sys
from urllib.request import Request, urlopen

import websockets


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


async def recv_events(ws, count: int) -> list[dict]:
    events = []
    for _ in range(count):
        events.append(json.loads(await asyncio.wait_for(ws.recv(), timeout=5)))
    return events


async def main() -> None:
    room = post(
        "/rooms",
        {"sourceLanguage": {"code": "en-US", "name": "English"}},
    )
    room_id = room["roomId"]

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
        lecturer_events = await recv_events(lecturer, 2)
        assert {event["event"] for event in lecturer_events} == {
            "room:status",
            "room:listenerCount",
        }
        listener_count = next(
            event["payload"]["count"]
            for event in lecturer_events
            if event["event"] == "room:listenerCount"
        )
        assert listener_count == 0

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
            listener_events = await recv_events(listener, 2)
            assert "room:listenerCount" in {event["event"] for event in listener_events}

            await lecturer.send(
                json.dumps(
                    {
                        "event": "room:leave",
                        "payload": {
                            "roomId": room_id,
                            "role": "lecturer",
                            "reason": "user",
                        },
                    }
                )
            )
            lecturer_left_events = await recv_events(listener, 3)
            status_event = next(
                event
                for event in lecturer_left_events
                if event["event"] == "room:status"
            )
            assert status_event["payload"]["status"] == "disconnected"
            assert "room:error" in {event["event"] for event in lecturer_left_events}

    print(json.dumps({"status": "ok", "roomId": room_id}, ensure_ascii=False))


if __name__ == "__main__":
    asyncio.run(main())
