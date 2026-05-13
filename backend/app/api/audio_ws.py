import asyncio
import base64
import logging
import time
from typing import Optional

from fastapi import APIRouter, WebSocket, WebSocketDisconnect

from app.api.ws import (
    _broadcast_room_error,
    _broadcast_room_status,
    _broadcast_transcription,
    _broadcast_translation,
    _broadcast_tts,
)
from app.services.audio_buffer import AudioBuffer
from app.services.gemini_live import GeminiLiveSession
from app.services.runtime import (
    latency_tracker,
    marian_translator,
    nllb_translator,
    ollama_translator,
    settings,
    store,
    stt_engine,
    transcriber,
    tts_engine,
    tts_engines,
    translator,
    translation_glossary,
)
from app.services.translation_quality import PhraseAggregator, normalize_translation_text
from app.services.vad import VADSegmenter

router = APIRouter()
logger = logging.getLogger("nemi")


@router.websocket("/ws/rooms/{room_id}/audio")
async def audio_stream(room_id: str, websocket: WebSocket):
    await websocket.accept()
    room = store.get_room(room_id)
    if not room or room.status == "stopped":
        await websocket.close(code=1008)
        return
    store.update_room_status(room_id, "live")
    store.update_stream_state(
        room_id=room_id,
        listeners_count=store.get_listener_count(room_id),
        status="live",
    )
    await _broadcast_room_status(room_id, message="audio_connected")
    buffer = AudioBuffer()
    vad_segmenter = (
        VADSegmenter(
            padding_ms=settings.vad_padding_ms,
            max_segment_ms=settings.stt_segment_max_ms,
            min_segment_ms=settings.stt_segment_min_ms,
        )
        if stt_engine
        else None
    )
    gemini_session: Optional[GeminiLiveSession] = None
    translation_queue: asyncio.Queue[Optional[tuple[str, int]]] = asyncio.Queue()
    phrase_aggregator = PhraseAggregator(
        min_chars=settings.phrase_min_chars,
        max_chars=settings.phrase_max_chars,
        timeout_ms=settings.phrase_timeout_ms,
    )
    phrase_flush_task: Optional[asyncio.Task] = None
    listener_delay_ms = max(0, settings.listener_delay_ms)

    async def enqueue_translation_phrase(text: str, enqueued_ms: Optional[int] = None) -> None:
        phrase = normalize_translation_text(text)
        if not phrase:
            return
        await translation_queue.put((phrase, enqueued_ms or int(time.time() * 1000)))

    async def flush_phrase_after_timeout() -> None:
        while True:
            await asyncio.sleep(max(0, settings.phrase_timeout_ms) / 1000)
            phrase = phrase_aggregator.flush_due()
            if phrase:
                await enqueue_translation_phrase(phrase)
                return
            if not phrase_aggregator.has_pending():
                return

    def schedule_phrase_flush() -> None:
        nonlocal phrase_flush_task
        if settings.phrase_timeout_ms <= 0:
            return
        if phrase_flush_task and not phrase_flush_task.done():
            return
        phrase_flush_task = asyncio.create_task(flush_phrase_after_timeout())

    async def handle_transcription(text: str) -> None:
        if not text:
            return
        logger.info("Transcription received: room=%s text=%s", room_id, text)
        store.append_transcription(room_id, text)
        await _broadcast_transcription(room_id, text)
        phrase = phrase_aggregator.push(text)
        if phrase:
            if phrase_flush_task and not phrase_flush_task.done():
                phrase_flush_task.cancel()
            await enqueue_translation_phrase(phrase)
        else:
            schedule_phrase_flush()
        latency_ms = latency_tracker.sample(room_id)
        if latency_ms is not None:
            store.set_stream_state(
                room_id=room_id,
                latency_ms=latency_ms,
                listeners_count=store.get_listener_count(room_id),
                status="live",
            )

    async def process_translations(text: str, enqueued_ms: int) -> None:
        listener_languages = store.list_listener_languages(room_id)
        if not listener_languages:
            return
        source_lang = store.get_room(room_id).source_language if store.get_room(room_id) else ""
        delivery_delay_applied = False
        for language in listener_languages:
            try:
                translated = None
                context_segments = store.get_recent_transcription_segments(
                    room_id,
                    settings.translation_context_segments,
                )
                if marian_translator and settings.mt_provider == "marian":
                    translated = await asyncio.to_thread(
                        marian_translator.translate,
                        text,
                        source_lang,
                        language,
                    )
                elif nllb_translator and settings.mt_provider == "nllb":
                    translated = await asyncio.to_thread(
                        nllb_translator.translate,
                        text,
                        source_lang,
                        language,
                    )
                elif ollama_translator and settings.mt_provider == "ollama":
                    translated = await asyncio.to_thread(
                        ollama_translator.translate,
                        text,
                        source_lang,
                        language,
                        context_segments[:-1],
                    )
                else:
                    translated = await translator.translate(room_id, text, language)
                if not translated:
                    continue
                translated = translation_glossary.enforce(
                    text,
                    normalize_translation_text(translated),
                    language,
                )
                if not delivery_delay_applied:
                    remaining_ms = (enqueued_ms + listener_delay_ms) - int(time.time() * 1000)
                    if remaining_ms > 0:
                        await asyncio.sleep(remaining_ms / 1000)
                    delivery_delay_applied = True
                store.append_translation(room_id, language, translated)
                await _broadcast_translation(room_id, translated, language)
                logger.info(
                    "Translation broadcast: room=%s target=%s chars=%s",
                    room_id,
                    language,
                    len(translated),
                )
                if tts_engine or tts_engines:
                    engine = tts_engines.get(language) or tts_engine
                    if engine:
                        audio = await engine.synthesize(translated)
                        if audio:
                            await _broadcast_tts(
                                room_id,
                                base64.b64encode(audio).decode("utf-8"),
                                engine.sample_rate,
                                language,
                            )
                            logger.info(
                                "TTS broadcast: room=%s target=%s bytes=%s",
                                room_id,
                                language,
                                len(audio),
                            )
                        else:
                            logger.warning(
                                "TTS returned empty audio: room=%s target=%s",
                                room_id,
                                language,
                            )
            except Exception as exc:
                logger.exception("Translation error: room=%s", room_id)
                await _broadcast_room_error(
                    room_id=room_id,
                    code="translation_error",
                    message=str(exc),
                    fatal=False,
                )

    async def translation_worker() -> None:
        while True:
            item = await translation_queue.get()
            if item is None:
                translation_queue.task_done()
                break
            text, enqueued_ms = item
            try:
                await process_translations(text, enqueued_ms)
            except Exception:
                logger.exception("Translation worker error: room=%s", room_id)
            finally:
                translation_queue.task_done()

    async def handle_gemini_error(exc: Exception) -> None:
        await _broadcast_room_error(
            room_id=room_id,
            code="gemini_error",
            message=str(exc),
            fatal=True,
        )

    translation_task = asyncio.create_task(translation_worker())
    try:
        room = store.get_room(room_id)
        stt_language = room.source_language if room else None
        use_gemini = (
            settings.llm_provider == "gemini"
            and settings.llm_api_key
            and not settings.llm_fake_transcripts
        )
        if use_gemini:
            gemini_session = GeminiLiveSession(
                api_key=settings.llm_api_key,
                model=settings.llm_model,
            )
            await gemini_session.start(
                on_transcription=handle_transcription,
                on_error=handle_gemini_error,
            )
        while True:
            chunk = await websocket.receive_bytes()
            latency_tracker.start(room_id)
            frames, overflowed = buffer.add(chunk)
            if overflowed:
                logger.warning("Audio buffer overflow: room=%s", room_id)
            for frame in frames:
                logger.debug("Audio frame ready: room=%s bytes=%s", room_id, len(frame))
                if gemini_session:
                    await gemini_session.send_audio(frame)
                    continue
                if stt_engine and vad_segmenter:
                    segments = vad_segmenter.push(frame)
                    for segment in segments:
                        text = await stt_engine.transcribe(segment, language=stt_language)
                        if text:
                            await handle_transcription(text)
                    continue
                transcript = await transcriber.handle_frame(room_id, frame)
                if transcript:
                    await handle_transcription(transcript)
    except WebSocketDisconnect:
        logger.info("Audio stream disconnected: room=%s", room_id)
    finally:
        if gemini_session:
            await gemini_session.close()
        if stt_engine and vad_segmenter:
            for segment in vad_segmenter.flush():
                text = await stt_engine.transcribe(segment, language=stt_language)
                if text:
                    await handle_transcription(text)
        final_phrase = phrase_aggregator.flush()
        if final_phrase:
            await enqueue_translation_phrase(final_phrase)
        if phrase_flush_task and not phrase_flush_task.done():
            phrase_flush_task.cancel()
        await translation_queue.put(None)
        await translation_task
        room = store.get_room(room_id)
        if room and room.status == "live":
            store.update_room_status(room_id, "connecting")
            store.update_stream_state(
                room_id=room_id,
                listeners_count=store.get_listener_count(room_id),
                status="connecting",
            )
            await _broadcast_room_status(room_id, message="audio_disconnected")
