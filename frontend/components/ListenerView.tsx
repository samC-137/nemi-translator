
import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { Language, LANGUAGES, RoomSession, RoomStatus } from '../types';
import { Play, Settings, ChevronDown } from 'lucide-react';
import { RealtimeClient } from '../services/realtimeClient';
import {
  fetchSupportedLanguages,
  filterTargetLanguages,
  resolveLanguageByCode,
  SupportedLanguages
} from '../services/supportedLanguages';
import { getListenerDelayMs } from '../services/uiConfig';

interface ListenerViewProps {
  session: RoomSession;
  onExit: () => void;
}

type PendingTranslation = {
  text: string;
  timeoutId: number;
};

type ListenerAudioStatus =
  | 'disabled'
  | 'needs-unlock'
  | 'ready'
  | 'queued'
  | 'playing'
  | 'suspended'
  | 'error';

export const ListenerView: React.FC<ListenerViewProps> = ({ session, onExit }) => {
  const textDelayMs = getListenerDelayMs();
  const [transcription, setTranscription] = useState("");
  const [translation, setTranslation] = useState("");
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);
  const [showSettings, setShowSettings] = useState(false);
  const [isActive, setIsActive] = useState(true);
  const [isAudioEnabled, setIsAudioEnabled] = useState(true);
  const [showOriginal, setShowOriginal] = useState(true);
  const [status, setStatus] = useState<RoomStatus>('connecting');
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [audioStatus, setAudioStatus] = useState<ListenerAudioStatus>('needs-unlock');
  const [audioError, setAudioError] = useState<string | null>(null);
  const [queuedAudioCount, setQueuedAudioCount] = useState(0);
  const [downloaded, setDownloaded] = useState(false);
  const [supported, setSupported] = useState<SupportedLanguages>({
    limited: false,
    sources: [],
    targetsBySource: {}
  });
  const [sourceLang, setSourceLang] = useState<Language>(
    session.sourceLanguage || LANGUAGES[0]
  );
  // Default target language from session or browser locale
  const [targetLang, setTargetLang] = useState<Language>(session.targetLanguage || LANGUAGES[0]);
  const clientRef = useRef<RealtimeClient | null>(null);
  const transcriptionTimerRef = useRef<number | null>(null);
  const pendingTranscriptionRef = useRef<string[]>([]);
  const pendingTranslationRef = useRef<PendingTranslation[]>([]);
  const pendingAudioStartsRef = useRef<number[]>([]);
  const translationTimeoutsRef = useRef<number[]>([]);
  const audioContextRef = useRef<AudioContext | null>(null);
  const nextAudioTimeRef = useRef(0);
  const pendingAudioRef = useRef<Array<{ audio: string; sampleRate: number }>>([]);
  const isAudioEnabledRef = useRef(isAudioEnabled);

  const getAudioStatusFromContext = useCallback((audioContext: AudioContext | null) => {
    if (!isAudioEnabledRef.current) return 'disabled';
    if (!audioContext || audioContext.state === 'closed') return 'needs-unlock';
    if (pendingAudioRef.current.length > 0) return 'queued';
    if (audioContext.state === 'running') return 'ready';
    if (audioContext.state === 'suspended') return 'suspended';
    return 'needs-unlock';
  }, []);

  const syncQueuedAudioCount = useCallback(() => {
    setQueuedAudioCount(pendingAudioRef.current.length);
  }, []);

  const updateAudioStatus = useCallback((audioContext = audioContextRef.current) => {
    setAudioStatus(getAudioStatusFromContext(audioContext));
    syncQueuedAudioCount();
  }, [getAudioStatusFromContext, syncQueuedAudioCount]);

  const ensureAudioContext = useCallback(() => {
    if (!audioContextRef.current) {
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      audioContext.onstatechange = () => {
        updateAudioStatus(audioContext);
      };
      audioContextRef.current = audioContext;
    }
    updateAudioStatus(audioContextRef.current);
    return audioContextRef.current;
  }, [updateAudioStatus]);

  const resetAudioQueue = () => {
    nextAudioTimeRef.current = 0;
    pendingAudioRef.current = [];
    pendingAudioStartsRef.current = [];
    syncQueuedAudioCount();
    if (audioContextRef.current) {
      void audioContextRef.current.close();
      audioContextRef.current = null;
    }
    setAudioStatus(isAudioEnabledRef.current ? 'needs-unlock' : 'disabled');
  };

  const scheduleTextUpdate = (
    timerRef: React.MutableRefObject<number | null>,
    pendingRef: React.MutableRefObject<string[]>,
    setter: React.Dispatch<React.SetStateAction<string>>,
    text: string
  ) => {
    const nextText = text.trim();
    if (!nextText) return;
    pendingRef.current.push(nextText);
    if (timerRef.current) return;
    timerRef.current = window.setTimeout(() => {
      const chunk = pendingRef.current.join(' ');
      pendingRef.current = [];
      if (!chunk) {
        timerRef.current = null;
        return;
      }
      setter((prev) => {
        if (!prev) return chunk;
        const needsSpace = !prev.endsWith(' ') && !chunk.startsWith(' ');
        return `${prev}${needsSpace ? ' ' : ''}${chunk}`;
      });
      timerRef.current = null;
    }, textDelayMs);
  };

  const appendTranslationText = (text: string) => {
    const nextText = text.trim();
    if (!nextText) return;
    setTranslation((prev) => {
      if (!prev) return nextText;
      const needsSpace = !prev.endsWith(' ') && !nextText.startsWith(' ');
      return `${prev}${needsSpace ? ' ' : ''}${nextText}`;
    });
  };

  const dropTranslationTimeout = (timeoutId: number) => {
    translationTimeoutsRef.current = translationTimeoutsRef.current.filter((id) => id !== timeoutId);
  };

  const scheduleTranslationAt = (text: string, startAt: number) => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;
    const delayMs = Math.max(0, (startAt - audioContext.currentTime) * 1000);
    const timeoutId = window.setTimeout(() => {
      dropTranslationTimeout(timeoutId);
      appendTranslationText(text);
    }, delayMs);
    translationTimeoutsRef.current.push(timeoutId);
  };

  const syncTranslationWithAudio = () => {
    const audioContext = audioContextRef.current;
    if (!audioContext) return;
    while (
      pendingTranslationRef.current.length > 0 &&
      pendingAudioStartsRef.current.length > 0
    ) {
      const translation = pendingTranslationRef.current.shift();
      const startAt = pendingAudioStartsRef.current.shift();
      if (!translation || startAt === undefined) break;
      window.clearTimeout(translation.timeoutId);
      dropTranslationTimeout(translation.timeoutId);
      scheduleTranslationAt(translation.text, startAt);
    }
  };

  const enqueueTranslation = (text: string) => {
    const nextText = text.trim();
    if (!nextText) return;
    const fallbackDelayMs = Math.max(textDelayMs * 2, 1200);
    const timeoutId = window.setTimeout(() => {
      dropTranslationTimeout(timeoutId);
      const pending = pendingTranslationRef.current;
      const index = pending.findIndex((item) => item.timeoutId === timeoutId);
      if (index === -1) return;
      pending.splice(index, 1);
      appendTranslationText(nextText);
    }, fallbackDelayMs);
    translationTimeoutsRef.current.push(timeoutId);
    pendingTranslationRef.current.push({ text: nextText, timeoutId });
    syncTranslationWithAudio();
  };

  const flushPendingAudio = () => {
    const audioContext = audioContextRef.current;
    if (!audioContext || audioContext.state !== 'running') {
      updateAudioStatus(audioContext);
      return;
    }
    const pending = pendingAudioRef.current;
    if (!pending.length) return;
    pendingAudioRef.current = [];
    syncQueuedAudioCount();
    for (const item of pending) {
      const startAt = scheduleAudioPlayback(item.audio, item.sampleRate);
      if (startAt !== null) {
        pendingAudioStartsRef.current.push(startAt);
        syncTranslationWithAudio();
      }
    }
    updateAudioStatus(audioContext);
  };

  const scheduleAudioPlayback = (audioBase64: string, sampleRate: number) => {
    if (!audioBase64 || !sampleRate) return null;
    const audioContext = ensureAudioContext();
    if (audioContext.state !== 'running') {
      pendingAudioRef.current.push({ audio: audioBase64, sampleRate });
      setAudioStatus('queued');
      setAudioError(null);
      syncQueuedAudioCount();
      void audioContext.resume()
        .then(() => flushPendingAudio())
        .catch(() => {
          setAudioStatus('needs-unlock');
          setAudioError('Браузер заблокировал автозапуск. Нажмите "Включить озвучку".');
        });
      return null;
    }
    try {
      const binary = atob(audioBase64);
      const bytes = new Uint8Array(binary.length);
      for (let i = 0; i < binary.length; i += 1) {
        bytes[i] = binary.charCodeAt(i);
      }
      const pcm = new Int16Array(bytes.buffer);
      const floats = new Float32Array(pcm.length);
      for (let i = 0; i < pcm.length; i += 1) {
        floats[i] = pcm[i] / 32768;
      }
      const buffer = audioContext.createBuffer(1, floats.length, sampleRate);
      buffer.copyToChannel(floats, 0);

      const source = audioContext.createBufferSource();
      source.buffer = buffer;
      source.connect(audioContext.destination);
      source.onended = () => {
        updateAudioStatus(audioContext);
      };
      const delaySeconds = textDelayMs / 1000;
      const now = audioContext.currentTime;
      const startAt = Math.max(now + delaySeconds, nextAudioTimeRef.current);
      source.start(startAt);
      nextAudioTimeRef.current = startAt + buffer.duration;
      setAudioStatus('playing');
      setAudioError(null);
      return startAt;
    } catch (error) {
      setAudioStatus('error');
      setAudioError(error instanceof Error ? error.message : 'Не удалось подготовить аудио.');
      return null;
    }
  };

  const unlockAudioPlayback = useCallback(async () => {
    try {
      if (!isAudioEnabledRef.current) {
        isAudioEnabledRef.current = true;
        setIsAudioEnabled(true);
      }
      setAudioError(null);
      const audioContext = ensureAudioContext();
      if (audioContext.state !== 'running') {
        await audioContext.resume();
      }
      if (audioContext.state !== 'running') {
        setAudioStatus('needs-unlock');
        return;
      }
      flushPendingAudio();
      updateAudioStatus(audioContext);
    } catch (error) {
      setAudioStatus('error');
      setAudioError(
        error instanceof Error
          ? error.message
          : 'Браузер не разрешил включить озвучку. Повторите действие вручную.'
      );
    }
  }, [ensureAudioContext, updateAudioStatus]);

  useEffect(() => {
    isAudioEnabledRef.current = isAudioEnabled;
    updateAudioStatus();
  }, [isAudioEnabled]);

  useEffect(() => {
    const handleAudioRestore = () => {
      if (!isAudioEnabledRef.current) return;
      const audioContext = audioContextRef.current;
      if (!audioContext) {
        updateAudioStatus(null);
        return;
      }
      if (audioContext.state === 'running') {
        flushPendingAudio();
        updateAudioStatus(audioContext);
        return;
      }
      void audioContext.resume()
        .then(() => {
          flushPendingAudio();
          updateAudioStatus(audioContext);
        })
        .catch(() => {
          setAudioStatus(pendingAudioRef.current.length > 0 ? 'queued' : 'suspended');
          setAudioError('Озвучка приостановлена браузером. Нажмите "Включить озвучку".');
        });
    };
    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        handleAudioRestore();
      } else if (isAudioEnabledRef.current && audioContextRef.current?.state !== 'running') {
        setAudioStatus(pendingAudioRef.current.length > 0 ? 'queued' : 'suspended');
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('focus', handleAudioRestore);
    window.addEventListener('pageshow', handleAudioRestore);
    return () => {
      document.removeEventListener('visibilitychange', handleVisibilityChange);
      window.removeEventListener('focus', handleAudioRestore);
      window.removeEventListener('pageshow', handleAudioRestore);
    };
  }, [updateAudioStatus]);

  useEffect(() => {
    setSourceLang(session.sourceLanguage || LANGUAGES[0]);
    setTargetLang(session.targetLanguage || LANGUAGES[0]);
  }, [session.id]);

  useEffect(() => {
    let active = true;
    fetchSupportedLanguages().then((data) => {
      if (active) setSupported(data);
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => {
    if (isAudioEnabled) return;
    pendingAudioRef.current = [];
    pendingAudioStartsRef.current = [];
    resetAudioQueue();
  }, [isAudioEnabled]);

  const availableTargets = filterTargetLanguages(sourceLang.code, supported, LANGUAGES);
  const fallbackTarget = availableTargets[0] ?? LANGUAGES[0];

  useEffect(() => {
    if (!availableTargets.find((lang) => lang.code === targetLang.code)) {
      setTargetLang(fallbackTarget);
    }
  }, [availableTargets, fallbackTarget.code, targetLang.code]);

  useEffect(() => {
    return () => {
      clientRef.current?.disconnect();
      if (transcriptionTimerRef.current) {
        window.clearTimeout(transcriptionTimerRef.current);
      }
      pendingTranscriptionRef.current = [];
      pendingTranslationRef.current = [];
      translationTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      translationTimeoutsRef.current = [];
      resetAudioQueue();
    };
  }, []);

  useEffect(() => {
    if (!isActive) {
      clientRef.current?.disconnect();
      setStatus('stopped');
      pendingTranscriptionRef.current = [];
      pendingTranslationRef.current = [];
      translationTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
      translationTimeoutsRef.current = [];
      resetAudioQueue();
      return;
    }

    setTranscription('');
    setTranslation('');
    setErrorMessage(null);
    pendingTranscriptionRef.current = [];
    pendingTranslationRef.current = [];
    translationTimeoutsRef.current.forEach((id) => window.clearTimeout(id));
    translationTimeoutsRef.current = [];
    clientRef.current?.disconnect();
    clientRef.current = new RealtimeClient({
      roomId: session.id,
      role: 'listener',
      targetLanguage: targetLang,
      onTranscription: (payload) => {
        scheduleTextUpdate(
          transcriptionTimerRef,
          pendingTranscriptionRef,
          setTranscription,
          payload.packet.text
        );
        setErrorMessage(null);
        setStatus('live');
      },
      onTranslation: (payload) =>
        payload.targetLanguage?.code === targetLang.code
          ? enqueueTranslation(payload.packet.text)
          : undefined,
      onTts: (payload) => {
        if (!isActive || !isAudioEnabledRef.current) return;
        if (payload.targetLanguage?.code !== targetLang.code) return;
        const startAt = scheduleAudioPlayback(payload.audio, payload.sampleRate);
        if (startAt !== null) {
          pendingAudioStartsRef.current.push(startAt);
          syncTranslationWithAudio();
        }
      },
      onStatus: (payload) => {
        if (payload.sourceLanguage) {
          const resolved = resolveLanguageByCode(payload.sourceLanguage);
          if (resolved) setSourceLang(resolved);
        }
        setStatus(payload.status);
        if (payload.status === 'live' || payload.status === 'connecting') {
          setErrorMessage(null);
        }
      },
      onError: (payload) => {
        setErrorMessage(payload.message);
        setStatus('stopped');
        setIsActive(false);
      },
      onDisconnect: () => {
        if (isActive) {
          setErrorMessage('Соединение с комнатой закрыто. Нажмите старт, чтобы подключиться снова.');
          setStatus('stopped');
          setIsActive(false);
        }
      }
    });
    clientRef.current.connect();
  }, [isActive, session.id, targetLang.code]);

  const handleToggleActive = () => {
    if (!isActive && isAudioEnabled) {
      void unlockAudioPlayback();
    }
    setIsActive((prev) => !prev);
  };

  const handleDownload = () => {
    const content = [
      `Оригинал (${sourceLang.name})`,
      transcription,
      '',
      `Перевод (${targetLang.name})`,
      translation
    ].join('\n');
    if (!content.trim()) return;
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${session.id}-${targetLang.code}.txt`;
    link.click();
    URL.revokeObjectURL(url);
    setDownloaded(true);
    window.setTimeout(() => setDownloaded(false), 2000);
  };

  const statusLabel =
    status === 'live'
      ? 'Подключено'
      : status === 'reconnecting'
        ? 'Переподключение...'
        : status === 'disconnected'
          ? 'Лектор отключился'
          : status === 'connecting'
            ? 'Подключение...'
            : 'Не подключено';
  const statusDotClass =
    status === 'live'
      ? 'bg-[#34C759]'
      : status === 'reconnecting'
        ? 'bg-yellow-400'
        : status === 'disconnected'
          ? 'bg-orange-500'
          : status === 'connecting'
            ? 'bg-yellow-400'
            : 'bg-[#FF3B30]';
  const audioStatusLabel =
    audioStatus === 'disabled'
      ? 'Выключена'
      : audioStatus === 'ready'
        ? 'Готова'
        : audioStatus === 'playing'
          ? 'Воспроизведение'
          : audioStatus === 'queued'
            ? 'В очереди'
            : audioStatus === 'suspended'
              ? 'Пауза браузера'
              : audioStatus === 'error'
                ? 'Ошибка'
                : 'Нужно включить';
  const audioStatusDotClass =
    audioStatus === 'ready' || audioStatus === 'playing'
      ? 'bg-[#34C759]'
      : audioStatus === 'queued'
        ? 'bg-[#00A3FF]'
        : audioStatus === 'disabled'
          ? 'bg-gray-500'
          : 'bg-yellow-400';
  const audioActionLabel =
    audioStatus === 'error'
      ? 'Повторить озвучку'
      : audioStatus === 'disabled'
        ? 'Включить озвучку'
        : audioStatus === 'ready' || audioStatus === 'playing'
          ? 'Проверить'
          : 'Включить озвучку';

  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center pt-10 sm:pt-16 px-4 sm:px-8 relative">
      {/* Logo */}
      <div className="mb-14">
        <Logo size="md" />
      </div>

      {/* Control Toolbar */}
      <div className="flex flex-col lg:flex-row items-center gap-6 lg:gap-10 mb-12 lg:mb-20 relative z-50 w-full">
        
        {/* Start Button */}
        <div className="flex flex-col items-center gap-2">
          <button
            onClick={handleToggleActive}
            aria-label={isActive ? 'Остановить прием' : 'Начать прием'}
            className="w-16 h-16 bg-white rounded-full flex items-center justify-center hover:bg-gray-200 transition-all shadow-xl group"
          >
            <Play className="w-7 h-7 text-black fill-current group-hover:scale-110 transition-transform" />
          </button>
          <span className="text-[10px] text-gray-500 uppercase tracking-widest font-bold">
            {isActive ? 'Стоп' : 'Старт'}
          </span>
        </div>

        {/* Joined Language Selector */}
        <div className="flex flex-col items-center gap-2 w-full">
          <div className="flex flex-col sm:flex-row sm:items-center w-full justify-center">
            {/* Source Language - Left Pill (Automatic from Session) */}
            <div className="h-14 sm:h-16 w-full sm:w-[200px] bg-white rounded-full flex items-center justify-center text-black font-semibold text-lg sm:text-xl shadow-lg relative z-10 mb-3 sm:mb-0 sm:-mr-6 border border-black/5">
              {sourceLang.name}
            </div>
            
            {/* Target Language - Right Pill */}
            <div className="relative w-full sm:w-auto">
              <button 
                onClick={() => setIsDropdownOpen(!isDropdownOpen)}
                className="h-14 sm:h-16 w-full sm:w-[240px] pl-6 sm:pl-10 pr-6 sm:pr-8 bg-[#00A3FF] rounded-full flex items-center justify-between text-white font-semibold text-lg sm:text-xl shadow-lg shadow-blue-500/30 hover:bg-[#0092E6] transition-colors"
              >
                <span className="flex-1 text-center">{targetLang.name}</span>
                <ChevronDown className={`w-6 h-6 transition-transform ${isDropdownOpen ? 'rotate-180' : ''}`} />
              </button>

              {/* Dropdown Menu */}
              {isDropdownOpen && (
                <div className="absolute top-16 sm:top-20 left-0 w-full bg-white rounded-3xl py-3 shadow-2xl animate-in fade-in zoom-in-95 duration-200 overflow-hidden border border-gray-100 z-[100]">
                  {availableTargets.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => {
                        setTargetLang(lang);
                        setIsDropdownOpen(false);
                      }}
                      className={`w-full px-8 py-3 text-left text-base font-medium transition-colors ${
                        targetLang.code === lang.code 
                          ? 'bg-blue-500 text-white' 
                          : 'text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {lang.name}
                    </button>
                  ))}
                </div>
              )}
            </div>
          </div>
          
          {/* Labels - Corrected as per screenshot: left=SPEAKS, right=LISTENS */}
          <div className="flex w-full px-2 justify-between text-center">
            <div className="flex-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-bold">speaks</span>
            </div>
            <div className="flex-1">
              <span className="text-[10px] text-gray-500 uppercase tracking-[0.2em] font-bold">listens</span>
            </div>
          </div>
        </div>

        {/* Settings Icon */}
        <div className="relative flex flex-col items-center gap-2 px-2">
          <button
            onClick={() => setShowSettings((prev) => !prev)}
            aria-label="Настройки слушателя"
            className="w-16 h-16 flex items-center justify-center text-gray-500 hover:text-white transition-colors"
          >
            <Settings className="w-8 h-8" />
          </button>
          <div className="h-4" />
          {showSettings && (
            <div className="absolute top-16 right-0 z-[90] w-72 rounded-3xl border border-white/10 bg-[#0A0A0A]/95 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.4)] p-4 text-sm text-gray-200">
              <div className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">Настройки слушателя</div>
              <label className="flex items-center justify-between gap-3 py-1">
                <span>Озвучка перевода</span>
                <input
                  type="checkbox"
                  checked={isAudioEnabled}
                  onChange={(e) => {
                    const next = e.target.checked;
                    setIsAudioEnabled(next);
                    if (next && isActive) {
                      void unlockAudioPlayback();
                    }
                  }}
                  className="accent-[#00A3FF]"
                />
              </label>
              <label className="flex items-center justify-between gap-3 py-1">
                <span>Показывать оригинал</span>
                <input
                  type="checkbox"
                  checked={showOriginal}
                  onChange={(e) => setShowOriginal(e.target.checked)}
                  className="accent-[#00A3FF]"
                />
              </label>
            </div>
          )}
        </div>

        {/* Connection Status */}
        <div className="flex flex-col items-center gap-2">
          <div className="flex items-center gap-3 px-6 sm:px-8 py-4 bg-[#0D0D0D] border border-white/10 rounded-full shadow-inner w-full sm:w-auto justify-center">
             <div className={`w-3 h-3 rounded-full ${statusDotClass} shadow-[0_0_10px_rgba(52,199,89,0.5)]`} />
             <span className="text-sm font-medium text-gray-300">{statusLabel}</span>
          </div>
          <div className="h-4" />
        </div>
      </div>

      {errorMessage && (
        <div className="-mt-6 mb-10 w-full max-w-3xl rounded-2xl border border-rose-400/40 bg-rose-500/10 px-5 py-4 text-center text-sm text-rose-100">
          {errorMessage}
        </div>
      )}

      <div className="-mt-6 mb-10 w-full max-w-3xl rounded-2xl border border-white/10 bg-[#0A0A0A]/80 px-5 py-4 shadow-[0_0_40px_rgba(0,163,255,0.08)]">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div className="min-w-0">
            <div className="flex items-center gap-3">
              <div className={`w-3 h-3 rounded-full ${audioStatusDotClass}`} />
              <span className="text-sm font-semibold text-gray-100">
                Озвучка: {audioStatusLabel}
              </span>
              {queuedAudioCount > 0 && (
                <span className="rounded-full border border-[#00A3FF]/40 bg-[#00A3FF]/10 px-3 py-1 text-xs font-semibold text-blue-100">
                  очередь {queuedAudioCount}
                </span>
              )}
            </div>
            {audioError && (
              <p className="mt-2 text-xs leading-relaxed text-yellow-100">
                {audioError}
              </p>
            )}
          </div>
          <button
            onClick={() => void unlockAudioPlayback()}
            className="shrink-0 rounded-full bg-white px-5 py-3 text-sm font-bold text-black transition-colors hover:bg-gray-200"
          >
            {audioActionLabel}
          </button>
        </div>
      </div>

      {/* Main Content Side-by-Side Boxes */}
      <div
        className={`w-full max-w-[1200px] grid grid-cols-1 ${
          showOriginal ? 'md:grid-cols-2' : 'md:grid-cols-1'
        } gap-10 pb-20`}
      >
        {/* Left Box (Original) */}
        {showOriginal && (
          <div className="relative md:h-[450px] bg-[#0A0A0A] border border-white/10 rounded-[50px] p-8 sm:p-12 lg:p-16 max-h-[60vh] md:max-h-[450px] overflow-y-auto flex items-start justify-center text-center shadow-[0_0_80px_rgba(255,255,255,0.05)]">
            <p className="text-white text-lg sm:text-xl lg:text-2xl leading-relaxed font-light tracking-wide max-w-md text-reveal">
              {transcription}
            </p>
          </div>
        )}

        {/* Right Box (Translation) */}
        <div className="relative md:h-[450px] bg-[#050505] border border-[#00A3FF]/40 rounded-[50px] p-8 sm:p-12 lg:p-16 max-h-[60vh] md:max-h-[450px] overflow-y-auto flex items-start justify-center text-center shadow-[0_0_80px_rgba(0,163,255,0.2)]">
           <div className="absolute inset-0 rounded-[50px] bg-gradient-to-b from-[#00A3FF]/5 to-transparent pointer-events-none" />
           <p className="text-blue-50 text-lg sm:text-xl lg:text-2xl leading-relaxed font-light tracking-wide max-w-md italic opacity-50 text-reveal relative z-10">
             {translation || "Перевод появится здесь..."}
           </p>
        </div>
      </div>

      {/* Exit Button */}
      <button 
        onClick={onExit}
        className="fixed bottom-6 right-6 sm:bottom-10 sm:right-10 text-gray-600 hover:text-white text-xs uppercase tracking-[0.2em] font-bold transition-all hover:tracking-[0.3em]"
      >
        Выйти из комнаты
      </button>
      <button
        onClick={handleDownload}
        className="fixed bottom-6 left-6 sm:bottom-10 sm:left-10 text-gray-600 hover:text-white text-xs uppercase tracking-[0.2em] font-bold transition-all hover:tracking-[0.3em]"
      >
        {downloaded ? 'Сохранено' : 'Скачать текст'}
      </button>
    </div>
  );
};
