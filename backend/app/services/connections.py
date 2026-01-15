from typing import Dict, Set

from fastapi import WebSocket


class ConnectionManager:
    def __init__(self) -> None:
        self._rooms: Dict[str, Set[WebSocket]] = {}

    async def add(self, room_id: str, websocket: WebSocket) -> None:
        connections = self._rooms.setdefault(room_id, set())
        connections.add(websocket)

    def remove(self, room_id: str, websocket: WebSocket) -> None:
        connections = self._rooms.get(room_id)
        if not connections:
            return
        connections.discard(websocket)
        if not connections:
            self._rooms.pop(room_id, None)

    async def broadcast(self, room_id: str, message: dict) -> None:
        connections = list(self._rooms.get(room_id, set()))
        for websocket in connections:
            try:
                await websocket.send_json(message)
            except RuntimeError:
                self.remove(room_id, websocket)
