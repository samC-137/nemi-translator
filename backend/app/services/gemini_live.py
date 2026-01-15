import asyncio
import logging
from typing import Awaitable, Callable, Optional

from google import genai
from google.genai import types


logger = logging.getLogger("nemi")
TranscriptionCallback = Callable[[str], Awaitable[None]]
ErrorCallback = Callable[[Exception], Awaitable[None]]


class GeminiLiveSession:
    def __init__(self, api_key: str, model: str) -> None:
        if not api_key:
            raise ValueError("LLM_API_KEY is required for Gemini Live")
        self._client = genai.Client(api_key=api_key)
        self._model = model
        self._queue: asyncio.Queue[Optional[bytes]] = asyncio.Queue()
        self._task: Optional[asyncio.Task] = None
        self._stop = asyncio.Event()

    async def start(
        self,
        on_transcription: TranscriptionCallback,
        on_error: Optional[ErrorCallback] = None,
    ) -> None:
        if self._task:
            return
        self._task = asyncio.create_task(self._run(on_transcription, on_error))

    async def send_audio(self, frame: bytes) -> None:
        await self._queue.put(frame)

    async def close(self) -> None:
        self._stop.set()
        await self._queue.put(None)
        if self._task:
            await self._task
            self._task = None

    async def _run(
        self,
        on_transcription: TranscriptionCallback,
        on_error: Optional[ErrorCallback],
    ) -> None:
        config = types.LiveConnectConfig(
            response_modalities=["TEXT"],
            input_audio_transcription={"enabled": True},
        )
        try:
            async with self._client.aio.live.connect(
                model=self._model,
                config=config,
            ) as session:
                sender = asyncio.create_task(self._send_loop(session))
                receiver = asyncio.create_task(
                    self._receive_loop(session, on_transcription, on_error)
                )
                done, pending = await asyncio.wait(
                    [sender, receiver],
                    return_when=asyncio.FIRST_COMPLETED,
                )
                for task in pending:
                    task.cancel()
                for task in done:
                    if task.exception():
                        raise task.exception()
        except Exception as exc:
            logger.exception("Gemini Live session error")
            if on_error:
                await on_error(exc)

    async def _send_loop(self, session: any) -> None:
        while not self._stop.is_set():
            frame = await self._queue.get()
            if frame is None:
                break
            await self._send_realtime_input(session, frame)

    async def _send_realtime_input(self, session: any, frame: bytes) -> None:
        if hasattr(session, "send_realtime_input"):
            await session.send_realtime_input(audio=frame)
            return
        await session.send(realtime_input={"audio": frame})

    async def _receive_loop(
        self,
        session: any,
        on_transcription: TranscriptionCallback,
        on_error: Optional[ErrorCallback],
    ) -> None:
        async for response in session.receive():
            text = _extract_text(response)
            if text:
                await on_transcription(text)


def _extract_text(response: any) -> Optional[str]:
    server_content = getattr(response, "server_content", None)
    if not server_content:
        return None
    for attr in ("input_transcription", "output_transcription"):
        transcription = getattr(server_content, attr, None)
        text = getattr(transcription, "text", None)
        if text:
            return text
    model_turn = getattr(server_content, "model_turn", None)
    parts = getattr(model_turn, "parts", None) if model_turn else None
    if parts:
        for part in parts:
            text = getattr(part, "text", None)
            if text:
                return text
    return None
