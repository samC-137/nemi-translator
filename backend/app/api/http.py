from typing import Any, Optional
from uuid import uuid4

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.core.config import load_settings
from app.services.auth import create_token
from app.services.runtime import store

router = APIRouter()
settings = load_settings()


class CreateRoomRequest(BaseModel):
    sourceLanguage: Optional[Any] = Field(default=None, alias="sourceLanguage")
    targetLanguage: Optional[Any] = Field(default=None, alias="targetLanguage")


class CreateRoomResponse(BaseModel):
    roomId: str
    token: str
    role: str


class JoinRoomRequest(BaseModel):
    targetLanguage: Optional[Any] = Field(default=None, alias="targetLanguage")


class JoinRoomResponse(BaseModel):
    roomId: str
    token: str
    role: str


class RoomSummary(BaseModel):
    roomId: str
    status: str
    sourceLanguage: str
    targetLanguage: Optional[str]
    listenersCount: int


class RoomListResponse(BaseModel):
    total: int
    live: int
    listeners: int
    rooms: list[RoomSummary]


class RoomDetailResponse(BaseModel):
    roomId: str
    status: str
    sourceLanguage: str
    targetLanguage: Optional[str]
    listenersCount: int
    createdAt: str
    updatedAt: str


class AdminLoginRequest(BaseModel):
    username: str
    password: str


class AdminLoginResponse(BaseModel):
    token: str
    role: str


class SystemStatusResponse(BaseModel):
    stt: str
    translate: str
    tts: str


class SupportedLanguagesResponse(BaseModel):
    limited: bool
    sources: list[str]
    targetsBySource: dict[str, list[str]]


def _normalize_language(value: Optional[Any]) -> Optional[str]:
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


def _parse_mt_model_pairs(raw: str) -> list[tuple[str, str]]:
    pairs: list[tuple[str, str]] = []
    if not raw:
        return pairs
    for entry in raw.split(","):
        item = entry.strip()
        if not item or "=" not in item:
            continue
        pair, _model = item.split("=", 1)
        if "->" not in pair:
            continue
        source, target = [part.strip() for part in pair.split("->", 1)]
        if source and target:
            pairs.append((source, target))
    return pairs


def _generate_room_id() -> str:
    return f"NEMI-{str(uuid4().int)[-4:]}"


@router.post("/rooms", response_model=CreateRoomResponse)
async def create_room(payload: CreateRoomRequest) -> CreateRoomResponse:
    room_id = _generate_room_id()
    source_language = _normalize_language(payload.sourceLanguage) or "unknown"
    target_language = _normalize_language(payload.targetLanguage)

    store.create_room(
        room_id=room_id,
        source_language=source_language,
        target_language=target_language,
        status="connecting",
    )

    token = create_token(
        subject=room_id,
        role="lecturer",
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        expires_minutes=settings.jwt_expires_minutes,
        extra_claims={"roomId": room_id},
    )

    return CreateRoomResponse(roomId=room_id, token=token, role="lecturer")


@router.post("/rooms/{room_id}/join", response_model=JoinRoomResponse)
async def join_room(room_id: str, payload: JoinRoomRequest) -> JoinRoomResponse:
    room = store.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="room_not_found")

    target_language = _normalize_language(payload.targetLanguage)

    token = create_token(
        subject=room_id,
        role="listener",
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        expires_minutes=settings.jwt_expires_minutes,
        extra_claims={"roomId": room_id, "targetLanguage": target_language or ""},
    )

    return JoinRoomResponse(roomId=room_id, token=token, role="listener")


@router.get("/admin/rooms", response_model=RoomListResponse)
async def list_rooms() -> RoomListResponse:
    rooms = store.list_rooms()
    summaries: list[RoomSummary] = []
    total_listeners = 0
    live_count = 0
    for room in rooms:
        listeners = store.get_listener_count(room.id)
        total_listeners += listeners
        if room.status == "live":
            live_count += 1
        summaries.append(
            RoomSummary(
                roomId=room.id,
                status=room.status,
                sourceLanguage=room.source_language,
                targetLanguage=room.target_language,
                listenersCount=listeners,
            )
        )

    return RoomListResponse(
        total=len(rooms),
        live=live_count,
        listeners=total_listeners,
        rooms=summaries,
    )


@router.get("/admin/rooms/{room_id}", response_model=RoomDetailResponse)
async def get_room(room_id: str) -> RoomDetailResponse:
    room = store.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="room_not_found")
    listeners = store.get_listener_count(room.id)
    return RoomDetailResponse(
        roomId=room.id,
        status=room.status,
        sourceLanguage=room.source_language,
        targetLanguage=room.target_language,
        listenersCount=listeners,
        createdAt=room.created_at.isoformat(),
        updatedAt=room.updated_at.isoformat(),
    )


@router.post("/admin/rooms/{room_id}/stop")
async def stop_room(room_id: str):
    room = store.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="room_not_found")
    updated = store.update_room_status(room_id, "stopped")
    store.log_admin_action(room_id, "stop")
    return {"roomId": room_id, "status": updated.status if updated else "stopped"}


@router.post("/admin/rooms/{room_id}/reset-listeners")
async def reset_listeners(room_id: str):
    room = store.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="room_not_found")
    participants = store.list_participants(room_id)
    removed = 0
    for participant in participants:
        store.remove_participant(participant.id)
        removed += 1
    store.log_admin_action(room_id, "reset_listeners")
    return {"roomId": room_id, "removed": removed}


@router.post("/admin/rooms/{room_id}/restart")
async def restart_room(room_id: str):
    room = store.get_room(room_id)
    if not room:
        raise HTTPException(status_code=404, detail="room_not_found")
    updated = store.update_room_status(room_id, "connecting")
    store.log_admin_action(room_id, "restart")
    return {"roomId": room_id, "status": updated.status if updated else "connecting"}


@router.post("/admin/login", response_model=AdminLoginResponse)
async def admin_login(payload: AdminLoginRequest) -> AdminLoginResponse:
    if payload.username != settings.admin_user or payload.password != settings.admin_password:
        raise HTTPException(status_code=401, detail="invalid_credentials")

    token = create_token(
        subject=payload.username,
        role="admin",
        secret=settings.jwt_secret,
        algorithm=settings.jwt_algorithm,
        expires_minutes=settings.jwt_expires_minutes,
    )
    return AdminLoginResponse(token=token, role="admin")


@router.get("/admin/system/status", response_model=SystemStatusResponse)
async def system_status() -> SystemStatusResponse:
    return SystemStatusResponse(stt="ok", translate="ok", tts="ok")


@router.get("/supported-languages", response_model=SupportedLanguagesResponse)
async def supported_languages() -> SupportedLanguagesResponse:
    if settings.mt_provider != "marian" or not settings.mt_models:
        return SupportedLanguagesResponse(limited=False, sources=[], targetsBySource={})

    targets_by_source: dict[str, list[str]] = {}
    for source, target in _parse_mt_model_pairs(settings.mt_models):
        targets_by_source.setdefault(source, [])
        if target not in targets_by_source[source]:
            targets_by_source[source].append(target)

    sources = sorted(targets_by_source.keys())
    for source in sources:
        targets_by_source[source] = sorted(targets_by_source[source])

    return SupportedLanguagesResponse(
        limited=True,
        sources=sources,
        targetsBySource=targets_by_source,
    )
