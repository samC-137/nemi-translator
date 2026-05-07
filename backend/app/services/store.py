from dataclasses import replace
from datetime import datetime
from typing import Dict, List, Optional

from app.models import Participant, Room, StreamState


class InMemoryStore:
    def __init__(self) -> None:
        self._rooms: Dict[str, Room] = {}
        self._participants: Dict[str, Participant] = {}
        self._stream_states: Dict[str, StreamState] = {}
        self._admin_actions: List[dict] = []
        self._transcription_history: Dict[str, str] = {}
        self._translation_history: Dict[str, Dict[str, str]] = {}
        self._max_history_chars = 20000

    def create_room(
        self,
        room_id: str,
        source_language: str,
        target_language: Optional[str],
        status: str,
    ) -> Room:
        now = datetime.utcnow()
        room = Room(
            id=room_id,
            status=status,
            source_language=source_language,
            target_language=target_language,
            created_at=now,
            updated_at=now,
        )
        self._rooms[room_id] = room
        return room

    def get_room(self, room_id: str) -> Optional[Room]:
        return self._rooms.get(room_id)

    def update_room_status(self, room_id: str, status: str) -> Optional[Room]:
        room = self._rooms.get(room_id)
        if not room:
            return None
        updated = replace(room, status=status, updated_at=datetime.utcnow())
        self._rooms[room_id] = updated
        return updated

    def update_room_source_language(self, room_id: str, source_language: str) -> Optional[Room]:
        room = self._rooms.get(room_id)
        if not room:
            return None
        updated = replace(room, source_language=source_language, updated_at=datetime.utcnow())
        self._rooms[room_id] = updated
        return updated

    def list_rooms(self) -> List[Room]:
        return list(self._rooms.values())

    def add_participant(
        self,
        participant_id: str,
        room_id: str,
        role: str,
        target_language: Optional[str],
    ) -> Participant:
        participant = Participant(
            id=participant_id,
            room_id=room_id,
            role=role,
            target_language=target_language,
            connected_at=datetime.utcnow(),
        )
        self._participants[participant_id] = participant
        return participant

    def update_participant_language(
        self, participant_id: str, target_language: Optional[str]
    ) -> Optional[Participant]:
        participant = self._participants.get(participant_id)
        if not participant:
            return None
        updated = replace(participant, target_language=target_language)
        self._participants[participant_id] = updated
        return updated

    def remove_participant(self, participant_id: str) -> Optional[Participant]:
        return self._participants.pop(participant_id, None)

    def list_participants(self, room_id: Optional[str] = None) -> List[Participant]:
        if room_id is None:
            return list(self._participants.values())
        return [p for p in self._participants.values() if p.room_id == room_id]

    def list_listeners(self, room_id: str) -> List[Participant]:
        return [
            p
            for p in self._participants.values()
            if p.room_id == room_id and p.role == "listener"
        ]

    def list_listener_languages(self, room_id: str) -> List[str]:
        languages = []
        for participant in self.list_listeners(room_id):
            if participant.target_language:
                languages.append(participant.target_language)
        return languages

    def set_stream_state(
        self, room_id: str, latency_ms: int, listeners_count: int, status: str
    ) -> StreamState:
        state = StreamState(
            room_id=room_id,
            latency_ms=latency_ms,
            listeners_count=listeners_count,
            status=status,
        )
        self._stream_states[room_id] = state
        return state

    def update_stream_state(
        self,
        room_id: str,
        latency_ms: Optional[int] = None,
        listeners_count: Optional[int] = None,
        status: Optional[str] = None,
    ) -> StreamState:
        current = self._stream_states.get(room_id)
        state = StreamState(
            room_id=room_id,
            latency_ms=latency_ms if latency_ms is not None else (current.latency_ms if current else 0),
            listeners_count=(
                listeners_count
                if listeners_count is not None
                else (current.listeners_count if current else 0)
            ),
            status=status if status is not None else (current.status if current else "connecting"),
        )
        self._stream_states[room_id] = state
        return state

    def get_stream_state(self, room_id: str) -> Optional[StreamState]:
        return self._stream_states.get(room_id)

    def get_participant_count(self, room_id: str) -> int:
        return len([p for p in self._participants.values() if p.room_id == room_id])

    def get_role_count(self, room_id: str, role: str) -> int:
        return len(
            [
                p
                for p in self._participants.values()
                if p.room_id == room_id and p.role == role
            ]
        )

    def has_role(self, room_id: str, role: str) -> bool:
        return self.get_role_count(room_id, role) > 0

    def get_listener_count(self, room_id: str) -> int:
        return len(self.list_listeners(room_id))

    def log_admin_action(self, room_id: str, action: str) -> None:
        self._admin_actions.append(
            {
                "roomId": room_id,
                "action": action,
                "ts": datetime.utcnow().isoformat(),
            }
        )

    def list_admin_actions(self) -> List[dict]:
        return list(self._admin_actions)

    def append_transcription(self, room_id: str, text: str) -> None:
        if not text:
            return
        current = self._transcription_history.get(room_id, "")
        self._transcription_history[room_id] = self._append_text(current, text)

    def append_translation(self, room_id: str, target_language: str, text: str) -> None:
        if not text or not target_language:
            return
        room_history = self._translation_history.setdefault(room_id, {})
        current = room_history.get(target_language, "")
        room_history[target_language] = self._append_text(current, text)

    def get_transcription_history(self, room_id: str) -> str:
        return self._transcription_history.get(room_id, "")

    def get_translation_history(self, room_id: str, target_language: str) -> str:
        if not target_language:
            return ""
        return self._translation_history.get(room_id, {}).get(target_language, "")

    def _append_text(self, current: str, addition: str) -> str:
        cleaned = addition.strip()
        if not cleaned:
            return current
        if not current:
            merged = cleaned
        else:
            needs_space = not current.endswith(" ") and not cleaned.startswith(" ")
            merged = f"{current}{' ' if needs_space else ''}{cleaned}"
        if len(merged) <= self._max_history_chars:
            return merged
        return merged[-self._max_history_chars :]
