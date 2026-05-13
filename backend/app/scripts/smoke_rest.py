import json
import sys
from urllib.error import HTTPError
from urllib.request import Request, urlopen


BASE_URL = sys.argv[1].rstrip("/") if len(sys.argv) > 1 else "http://127.0.0.1:8000"


def request(path: str, method: str = "GET", payload: dict | None = None, token: str | None = None):
    data = json.dumps(payload).encode("utf-8") if payload is not None else None
    headers = {"Content-Type": "application/json"}
    if token:
        headers["Authorization"] = f"Bearer {token}"
    req = Request(f"{BASE_URL}{path}", data=data, headers=headers, method=method)
    with urlopen(req, timeout=10) as response:
        body = response.read().decode("utf-8")
        return response.status, json.loads(body) if body else {}


def expect_http_error(path: str, expected_status: int) -> None:
    try:
        request(path)
    except HTTPError as exc:
        if exc.code == expected_status:
            return
        raise AssertionError(f"{path}: expected {expected_status}, got {exc.code}") from exc
    raise AssertionError(f"{path}: expected {expected_status}, got success")


def main() -> None:
    status, health = request("/health")
    assert status == 200 and health["status"] == "ok", health

    expect_http_error("/admin/rooms", 401)

    _, login = request(
        "/admin/login",
        method="POST",
        payload={"username": "admin", "password": "admin"},
    )
    token = login["token"]

    _, room = request(
        "/rooms",
        method="POST",
        payload={"sourceLanguage": {"code": "en-US", "name": "English"}},
    )
    room_id = room["roomId"]
    assert room["role"] == "lecturer"

    _, joined = request(
        f"/rooms/{room_id}/join",
        method="POST",
        payload={"targetLanguage": {"code": "ru-RU", "name": "Russian"}},
    )
    assert joined["role"] == "listener"
    assert joined["sourceLanguage"] == "en-US"

    _, rooms = request("/admin/rooms", token=token)
    assert any(item["roomId"] == room_id for item in rooms["rooms"]), rooms

    _, detail = request(f"/admin/rooms/{room_id}", token=token)
    assert detail["roomId"] == room_id
    assert detail["listenersCount"] == 0

    print(json.dumps({"status": "ok", "roomId": room_id}, ensure_ascii=False))


if __name__ == "__main__":
    main()
