
import React, { useEffect, useRef, useState } from 'react';
import { Logo } from './Logo';
import { Language, RoomSession, RoomStatus } from '../types';
import { Mic, MicOff, Settings, Link, Check, LogOut, Play, Square } from 'lucide-react';
import { RealtimeClient } from '../services/realtimeClient';
import { AudioProcessingOptions, AudioSender } from '../services/audioSender';

interface LecturerViewProps {
  session: RoomSession;
  onStop: () => void;
  onUpdateLanguage: (lang: Language) => void;
}

export const LecturerView: React.FC<LecturerViewProps> = ({ session, onStop, onUpdateLanguage }) => {
  const [isSessionActive, setIsSessionActive] = useState(false);
  const [isMicOn, setIsMicOn] = useState(false);
  const [transcription, setTranscription] = useState("");
  const [status, setStatus] = useState<RoomStatus>('stopped');
  const [copied, setCopied] = useState(false);
  const [showMicSettings, setShowMicSettings] = useState(false);
  const [showExitConfirm, setShowExitConfirm] = useState(false);
  const [audioSettings, setAudioSettings] = useState<AudioProcessingOptions>({
    echoCancellation: true,
    noiseSuppression: true,
    autoGainControl: true,
    highPassFilter: true,
    noiseGateThreshold: 0.015,
    gain: 1
  });
  const clientRef = useRef<RealtimeClient | null>(null);
  const audioRef = useRef<AudioSender | null>(null);
  const isSessionActiveRef = useRef(isSessionActive);
  const isMicOnRef = useRef(isMicOn);

  useEffect(() => {
    return () => {
      audioRef.current?.stop();
      clientRef.current?.disconnect();
    };
  }, []);

  useEffect(() => {
    isSessionActiveRef.current = isSessionActive;
  }, [isSessionActive]);

  useEffect(() => {
    isMicOnRef.current = isMicOn;
  }, [isMicOn]);

  useEffect(() => {
    clientRef.current?.disconnect();
    clientRef.current = new RealtimeClient({
      roomId: session.id,
      role: 'lecturer',
      sourceLanguage: session.sourceLanguage,
      targetLanguage: session.targetLanguage,
      onTranscription: (payload) => {
        setTranscription(payload.packet.text);
        setStatus('live');
      },
      onStatus: (payload) => setStatus(payload.status),
      onError: () => setStatus('stopped')
    });
    if (isSessionActiveRef.current) {
      setStatus('connecting');
      setTranscription('');
      clientRef.current?.connect();
    }
  }, [session.id, session.sourceLanguage.code, session.targetLanguage.code]);

  useEffect(() => {
    audioRef.current?.stop();
    audioRef.current = new AudioSender({
      roomId: session.id,
      processing: audioSettings
    });
    if (isSessionActiveRef.current && isMicOnRef.current) {
      audioRef.current.start();
    }
  }, [session.id, audioSettings]);

  useEffect(() => {
    if (!isSessionActive) {
      clientRef.current?.disconnect();
      audioRef.current?.stop();
      setStatus('stopped');
      setTranscription('');
      return;
    }
    setStatus('connecting');
    setTranscription('');
    clientRef.current?.connect();
  }, [isSessionActive]);

  useEffect(() => {
    if (!isSessionActive) {
      audioRef.current?.stop();
      return;
    }
    if (isMicOn) {
      audioRef.current?.start();
    } else {
      audioRef.current?.stop();
    }
  }, [isMicOn, isSessionActive]);

  const handleCopyLink = () => {
    const url = `${window.location.origin}/room/${session.id}/listener`;
    navigator.clipboard.writeText(url).then(() => {
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    });
  };

  const handleExit = () => {
    setShowExitConfirm(true);
  };

  const handleConfirmExit = () => {
    audioRef.current?.stop();
    clientRef.current?.disconnect();
    setIsSessionActive(false);
    setShowExitConfirm(false);
    onStop();
  };

  const updateAudioSettings = (next: Partial<AudioProcessingOptions>) => {
    setAudioSettings((prev) => ({ ...prev, ...next }));
  };

  const statusLabel =
    !isSessionActive
      ? 'Сессия выключена'
      : status === 'live'
        ? 'Подключено'
        : status === 'connecting'
          ? 'Подключение...'
          : 'Не подключено';
  const statusDotClass =
    !isSessionActive
      ? 'bg-[#FF3B30]'
      : status === 'live'
        ? 'bg-green-500'
        : status === 'connecting'
          ? 'bg-yellow-400'
          : 'bg-[#FF3B30]';

  return (
    <div className="min-h-screen bg-transparent flex flex-col items-center relative overflow-hidden">
      {/* Top Right Header Actions */}
      <div className="w-full px-4 pt-6 flex flex-col items-center gap-3 md:px-0 md:pt-0 md:flex-row md:gap-4 md:absolute md:top-6 md:right-10 md:w-auto">
        <button
          onClick={handleCopyLink}
          className="flex items-center gap-2 px-4 py-2 bg-[#00A3FF]/10 border border-[#00A3FF]/30 rounded-full hover:bg-[#00A3FF]/20 transition-all group"
        >
          {copied ? (
            <>
              <Check className="text-green-400 w-4 h-4" />
              <span className="text-green-400 text-sm font-medium">Ссылка скопирована</span>
            </>
          ) : (
            <>
              <Link className="text-[#40A9FF] w-4 h-4 group-hover:scale-110 transition-transform" />
              <span className="text-[#40A9FF] text-sm font-medium">Копировать ссылку</span>
            </>
          )}
        </button>

        <button
          onClick={handleExit}
          className="flex items-center gap-2 px-4 py-2 bg-white/5 border border-white/10 rounded-full hover:bg-white/10 transition-all group"
        >
          <LogOut className="text-gray-400 w-4 h-4 group-hover:text-white transition-colors" />
          <span className="text-gray-400 group-hover:text-white text-sm font-medium">Выйти</span>
        </button>
      </div>

      <div className="flex-1 w-full flex flex-col items-center justify-start pt-6 md:pt-16">
        {/* Logo Section */}
        <div className="mb-14">
          <Logo size="md" />
        </div>

        {/* Action Toolbar */}
        <div className="flex flex-col md:flex-row items-center gap-6 md:gap-10 mb-10 md:mb-16 px-4 md:px-0 relative z-[60] w-full md:w-auto">
          {/* Stop Button - REMOVED AS PER SCREENSHOT */}

          {/* Language Display (Static Pill) - UPDATED AS PER SCREENSHOT */}
          <div className="flex flex-col items-center gap-2 w-full md:w-auto">
            <div className="h-14 md:h-16 px-6 md:px-12 bg-[#00A3FF] rounded-3xl text-white font-semibold text-lg md:text-xl shadow-lg shadow-blue-500/30 flex items-center justify-center w-full md:w-auto md:min-w-[180px]">
              {session.sourceLanguage.name}
            </div>
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-[0.2em]">ГОВОРИТ</span>
          </div>

          {/* Mic Toggle */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setIsMicOn(!isMicOn)}
              aria-label={isMicOn ? 'Выключить микрофон' : 'Включить микрофон'}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${isMicOn ? 'bg-[#00A3FF] text-white' : 'bg-[#404040] text-gray-400'}`}
            >
              {isMicOn ? <Mic className="w-7 h-7" /> : <MicOff className="w-7 h-7" />}
            </button>
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{isMicOn ? 'вкл.' : 'выкл.'}</span>
          </div>

          {/* Session Toggle */}
          <div className="flex flex-col items-center gap-2">
            <button
              onClick={() => setIsSessionActive((prev) => !prev)}
              aria-label={isSessionActive ? 'Остановить сессию' : 'Запустить сессию'}
              className={`w-16 h-16 rounded-full flex items-center justify-center transition-all ${
                isSessionActive
                  ? 'bg-[#FF3B30] text-white shadow-[0_0_25px_rgba(255,59,48,0.35)]'
                  : 'bg-[#34C759] text-black shadow-[0_0_25px_rgba(52,199,89,0.35)]'
              }`}
            >
              {isSessionActive ? <Square className="w-6 h-6" /> : <Play className="w-6 h-6 fill-current" />}
            </button>
            <span className="text-[10px] text-gray-500 font-bold uppercase tracking-widest">{isSessionActive ? 'стоп' : 'старт'}</span>
          </div>

          {/* Settings */}
          <div className="relative flex flex-col items-center gap-2 px-2">
            <button
              onClick={() => setShowMicSettings((prev) => !prev)}
              className="text-gray-500 hover:text-white transition-colors"
              aria-label="Настройки микрофона"
            >
              <Settings className="w-8 h-8" />
            </button>
            <div className="h-4" /> 
            {showMicSettings && (
              <div className="absolute top-16 right-0 z-[90] w-72 rounded-3xl border border-white/10 bg-[#0A0A0A]/95 backdrop-blur-xl shadow-[0_0_40px_rgba(0,0,0,0.4)] p-4 text-sm text-gray-200">
                <div className="text-xs uppercase tracking-[0.2em] text-gray-500 mb-3">Микрофон</div>
                <label className="flex items-center justify-between gap-3 py-1">
                  <span>Шумодав (WebRTC)</span>
                  <input
                    type="checkbox"
                    checked={audioSettings.noiseSuppression}
                    onChange={(e) => updateAudioSettings({ noiseSuppression: e.target.checked })}
                    className="accent-[#00A3FF]"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 py-1">
                  <span>Эхоподавление</span>
                  <input
                    type="checkbox"
                    checked={audioSettings.echoCancellation}
                    onChange={(e) => updateAudioSettings({ echoCancellation: e.target.checked })}
                    className="accent-[#00A3FF]"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 py-1">
                  <span>Автогейн</span>
                  <input
                    type="checkbox"
                    checked={audioSettings.autoGainControl}
                    onChange={(e) => updateAudioSettings({ autoGainControl: e.target.checked })}
                    className="accent-[#00A3FF]"
                  />
                </label>
                <label className="flex items-center justify-between gap-3 py-1">
                  <span>Фильтр НЧ</span>
                  <input
                    type="checkbox"
                    checked={audioSettings.highPassFilter}
                    onChange={(e) => updateAudioSettings({ highPassFilter: e.target.checked })}
                    className="accent-[#00A3FF]"
                  />
                </label>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>Порог шумодава</span>
                    <span>{audioSettings.noiseGateThreshold.toFixed(3)}</span>
                  </div>
                  <input
                    type="range"
                    min={0}
                    max={0.06}
                    step={0.005}
                    value={audioSettings.noiseGateThreshold}
                    onChange={(e) =>
                      updateAudioSettings({ noiseGateThreshold: Number(e.target.value) })
                    }
                    className="w-full accent-[#00A3FF]"
                  />
                </div>
                <div className="mt-3">
                  <div className="flex items-center justify-between text-xs text-gray-400 mb-1">
                    <span>Усиление</span>
                    <span>{audioSettings.gain.toFixed(2)}x</span>
                  </div>
                  <input
                    type="range"
                    min={0.6}
                    max={1.6}
                    step={0.05}
                    value={audioSettings.gain}
                    onChange={(e) => updateAudioSettings({ gain: Number(e.target.value) })}
                    className="w-full accent-[#00A3FF]"
                  />
                </div>
              </div>
            )}
          </div>

          {/* Status Indicator */}
          <div className="flex flex-col items-center gap-2">
            <div className="flex items-center gap-3 px-4 md:px-6 py-3 border border-white/20 rounded-full bg-black/40 backdrop-blur-md w-full md:w-auto justify-center">
              <div className={`w-2.5 h-2.5 rounded-full ${statusDotClass}`} />
              <span className="text-sm font-medium text-gray-300 whitespace-nowrap">
                {statusLabel}
              </span>
            </div>
            <div className="h-4" />
          </div>
        </div>

        {/* Transcription Box */}
        <div className="w-full max-w-4xl px-4">
          <div className="relative group">
            <div className="absolute -inset-0.5 bg-gradient-to-r from-blue-500/20 to-blue-500/10 blur-xl opacity-30"></div>
            <div className="relative bg-[#0A0A0A]/90 backdrop-blur-xl border border-blue-500/30 rounded-[50px] p-8 sm:p-12 lg:p-16 min-h-[260px] sm:min-h-[340px] max-h-[60vh] sm:max-h-[420px] overflow-y-auto flex items-start justify-center text-center shadow-[inset_0_0_100px_rgba(0,163,255,0.05)]">
              <p className="text-white text-xl sm:text-2xl lg:text-3xl leading-relaxed font-light tracking-wide max-w-2xl opacity-90 text-reveal">
                {transcription || "Начните говорить..."}
              </p>
            </div>
          </div>
        </div>
      </div>

      {showExitConfirm && (
        <div
          className="fixed inset-0 z-[200] flex items-center justify-center bg-black/70 px-4 backdrop-blur-sm"
          role="dialog"
          aria-modal="true"
          aria-labelledby="lecturer-exit-title"
        >
          <div className="w-full max-w-md rounded-3xl border border-white/10 bg-[#0A0A0A]/95 p-6 text-gray-200 shadow-[0_0_50px_rgba(0,0,0,0.6)]">
            <h2 id="lecturer-exit-title" className="text-lg font-semibold text-white">
              Выйти из сессии?
            </h2>
            <p className="mt-2 text-sm text-gray-400">
              Перевод будет остановлен для всех слушателей.
            </p>
            <div className="mt-6 flex items-center justify-end gap-3">
              <button
                onClick={() => setShowExitConfirm(false)}
                className="rounded-full border border-white/10 px-4 py-2 text-sm text-gray-300 hover:bg-white/10 transition-colors"
              >
                Отмена
              </button>
              <button
                onClick={handleConfirmExit}
                className="rounded-full bg-[#FF3B30] px-5 py-2 text-sm font-semibold text-white hover:bg-[#E6352C] transition-colors"
              >
                Выйти
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
};
