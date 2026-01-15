import json
import logging
import time
from typing import Any, Dict, Optional
from uuid import uuid4

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.services.runtime import connections, store

router = APIRouter()
logger = logging.getLogger("nemi")


def _parse_event(raw: str) -> Optional[Dict[str, Any]]:
    try:
        data = json.loads(raw)
    except json.JSONDecodeError:
        return None
    if not isinstance(data, dict):
        return None
    return data


def _validate_room_join(payload: Dict[str, Any]) -> bool:
    room_id = payload.get("roomId")
    role = payload.get("role")
    return isinstance(room_id, str) and room_id != "" and isinstance(role, str) and role != ""


def _validate_room_leave(payload: Dict[str, Any]) -> bool:
    room_id = payload.get("roomId")
    role = payload.get("role")
    return isinstance(room_id, str) and room_id != "" and isinstance(role, str) and role != ""


def _normalize_language(value: Any) -> Optional[str]:
    if isinstance(value, str) and value:
        return value
    if isinstance(value, dict):
        code = value.get("code")
        name = value.get("name")
        if isinstance(code, str) and code:
            return code
        if isinstance(name, str) and name:
            return name
    return None


async def _handle_room_join(payload: Dict[str, Any]) -> Optional[str]:
    room_id = payload.get("roomId")
    role = payload.get("role")
    if not isinstance(room_id, str) or not room_id:
        return None
    if not isinstance(role, str) or not role:
        return None

    source_language = _normalize_language(payload.get("sourceLanguage")) or "unknown"
    target_language = _normalize_language(payload.get("targetLanguage"))
    client_id = payload.get("clientId")
    participant_id = client_id if isinstance(client_id, str) and client_id else str(uuid4())

    room = store.get_room(room_id)
    if room is None:
        store.create_room(
            room_id=room_id,
            source_language=source_language,
            target_language=target_language,
            status="connecting",
        )
    elif role == "lecturer" and source_language != "unknown":
        store.update_room_source_language(room_id, source_language)

    store.add_participant(
        participant_id=participant_id,
        room_id=room_id,
        role=role,
        target_language=target_language,
    )
    room = store.get_room(room_id)
    if room:
        store.update_stream_state(
            room_id=room_id,
            listeners_count=store.get_listener_count(room_id),
            status=room.status,
        )
    return participant_id


async def _broadcast_room_status(room_id: str, message: Optional[str] = None) -> None:
    room = store.get_room(room_id)
    if not room:
        return
    payload = {
        "roomId": room_id,
        "status": room.status,
        "sourceLanguage": room.source_language,
    }
    if room.target_language:
        payload["targetLanguage"] = room.target_language
    if message:
        payload["message"] = message
    await connections.broadcast(
        room_id,
        {
            "event": "room:status",
            "payload": payload,
        },
    )


async def _broadcast_listener_count(room_id: str) -> None:
    count = store.get_listener_count(room_id)
    await connections.broadcast(
        room_id,
        {
            "event": "room:listenerCount",
            "payload": {"roomId": room_id, "count": count},
        },
    )


async def _broadcast_room_error(room_id: str, code: str, message: str, fatal: bool) -> None:
    await connections.broadcast(
        room_id,
        {
            "event": "room:error",
            "payload": {
                "roomId": room_id,
                "code": code,
                "message": message,
                "fatal": fatal,
            },
        },
    )


async def _broadcast_transcription(room_id: str, text: str) -> None:
    await connections.broadcast(
        room_id,
        {
            "event": "stream:transcription",
            "payload": {
                "roomId": room_id,
                "packet": {
                    "id": f"pkt-{uuid4().hex[:8]}",
                    "text": text,
                    "ts": int(time.time() * 1000),
                },
            },
        },
    )


async def _broadcast_translation(room_id: str, text: str, target_language: str) -> None:
    await connections.broadcast(
        room_id,
        {
            "event": "stream:translation",
            "payload": {
                "roomId": room_id,
                "targetLanguage": {"code": target_language, "name": target_language},
                "packet": {
                    "id": f"pkt-{uuid4().hex[:8]}",
                    "text": text,
                    "ts": int(time.time() * 1000),
                },
            },
        },
    )


async def _broadcast_tts(
    room_id: str, audio_b64: str, sample_rate: int, target_language: str
) -> None:
    await connections.broadcast(
        room_id,
        {
            "event": "stream:tts",
            "payload": {
                "roomId": room_id,
                "audio": audio_b64,
                "sampleRate": sample_rate,
                "targetLanguage": {
                    "code": target_language,
                    "name": target_language,
                },
            },
        },
    )


async def _send_history(
    websocket: WebSocket, room_id: str, target_language: Optional[str]
) -> None:
    transcript = store.get_transcription_history(room_id)
    if transcript:
        await websocket.send_json(
            {
                "event": "stream:transcription",
                "payload": {
                    "roomId": room_id,
                    "packet": {
                        "id": "history-transcription",
                        "text": transcript,
                        "ts": int(time.time() * 1000),
                    },
                },
            }
        )
    if target_language:
        translation = store.get_translation_history(room_id, target_language)
        if translation:
            await websocket.send_json(
                {
                    "event": "stream:translation",
                    "payload": {
                        "roomId": room_id,
                        "targetLanguage": {
                            "code": target_language,
                            "name": target_language,
                        },
                        "packet": {
                            "id": "history-translation",
                            "text": translation,
                            "ts": int(time.time() * 1000),
                        },
                    },
                }
            )


@router.websocket("/ws")
async def websocket_endpoint(websocket: WebSocket):
    await websocket.accept()
    participant_id: Optional[str] = None
    room_id: Optional[str] = None
    try:
        while True:
            raw = await websocket.receive_text()
            message = _parse_event(raw)
            if not message:
                continue
            event = message.get("event")
            payload = message.get("payload")
            if event not in {"room:join", "room:leave", "room:reconnect"}:
                if room_id:
                    await _broadcast_room_error(
                        room_id=room_id,
                        code="unknown_event",
                        message=f"Unsupported event: {event}",
                        fatal=False,
                    )
                continue
            if event == "room:join" and isinstance(payload, dict):
                if not _validate_room_join(payload):
                    await websocket.close(code=1008)
                    return
                participant_id = await _handle_room_join(payload)
                if participant_id is None:
                    await websocket.close(code=1008)
                    return
                room_id_value = payload.get("roomId")
                if isinstance(room_id_value, str) and room_id_value:
                    room_id = room_id_value
                    await connections.add(room_id, websocket)
                    await _broadcast_room_status(room_id)
                    await _broadcast_listener_count(room_id)
                    target_language = _normalize_language(payload.get("targetLanguage"))
                    if payload.get("role") in {"listener", "admin"}:
                        await _send_history(websocket, room_id, target_language)
                continue
            if event == "room:join":
                await websocket.close(code=1008)
                return
            if event == "room:reconnect" and isinstance(payload, dict):
                reconnect_room = payload.get("roomId")
                if not isinstance(reconnect_room, str) or not reconnect_room:
                    await websocket.close(code=1008)
                    return
                room_id = reconnect_room
                if not store.get_room(room_id):
                    await websocket.close(code=1008)
                    return
                store.update_room_status(room_id, "connecting")
                store.update_stream_state(
                    room_id=room_id,
                    listeners_count=store.get_listener_count(room_id),
                    status="connecting",
                )
                await connections.add(room_id, websocket)
                await _broadcast_room_status(room_id, message="reconnecting")
                await _broadcast_listener_count(room_id)
                continue
            if event == "room:leave" and isinstance(payload, dict):
                if not _validate_room_leave(payload):
                    await websocket.close(code=1008)
                    return
                leave_room = payload.get("roomId")
                if not isinstance(leave_room, str) or not leave_room:
                    await websocket.close(code=1008)
                    return
                if participant_id:
                    store.remove_participant(participant_id)
                if room_id:
                    connections.remove(room_id, websocket)
                    if store.get_listener_count(room_id) == 0:
                        store.update_room_status(room_id, "stopped")
                        await _broadcast_room_status(room_id, message="shutdown")
                    room = store.get_room(room_id)
                    if room:
                        store.update_stream_state(
                            room_id=room_id,
                            listeners_count=store.get_listener_count(room_id),
                            status=room.status,
                        )
                    if store.get_listener_count(room_id) != 0:
                        await _broadcast_room_status(room_id)
                    await _broadcast_listener_count(room_id)
                await websocket.close(code=1000)
                return
            if event == "room:leave":
                await websocket.close(code=1008)
                return
    except WebSocketDisconnect:
        logger.info("WebSocket disconnected")
        if participant_id:
            store.remove_participant(participant_id)
        if room_id:
            connections.remove(room_id, websocket)
            if store.get_listener_count(room_id) == 0:
                store.update_room_status(room_id, "stopped")
                await _broadcast_room_status(room_id, message="shutdown")
            room = store.get_room(room_id)
            if room:
                store.update_stream_state(
                    room_id=room_id,
                    listeners_count=store.get_listener_count(room_id),
                    status=room.status,
                )
            if store.get_listener_count(room_id) != 0:
                await _broadcast_room_status(room_id)
            await _broadcast_listener_count(room_id)
    except Exception as exc:
        logger.exception("WebSocket error")
        if room_id:
            await _broadcast_room_error(
                room_id=room_id,
                code="ws_error",
                message=str(exc),
                fatal=True,
            )
        await websocket.close(code=1011)
