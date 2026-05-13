
import React, { useEffect, useState } from 'react';
import { Logo } from './Logo';
import { LANGUAGES, Language } from '../types';
import { Plus, Users, ArrowRight } from 'lucide-react';
import {
  fetchSupportedLanguages,
  filterSourceLanguages,
  SupportedLanguages
} from '../services/supportedLanguages';

interface LobbyProps {
  error?: string | null;
  isSubmitting?: boolean;
  onCreateRoom: (lang: Language) => void | Promise<void>;
  onJoinRoom: (roomId: string, targetLang: Language) => void | Promise<void>;
}

export const Lobby: React.FC<LobbyProps> = ({
  error,
  isSubmitting = false,
  onCreateRoom,
  onJoinRoom
}) => {
  const [mode, setMode] = useState<'initial' | 'create' | 'join'>('initial');
  const [roomId, setRoomId] = useState('');
  const [roomIdError, setRoomIdError] = useState<string | null>(null);
  const [selectedLang, setSelectedLang] = useState<Language>(LANGUAGES[0]);
  const [selectedTargetLang, setSelectedTargetLang] = useState<Language>(LANGUAGES[1] ?? LANGUAGES[0]);
  const [supported, setSupported] = useState<SupportedLanguages>({
    limited: false,
    sources: [],
    targetsBySource: {}
  });

  useEffect(() => {
    let active = true;
    fetchSupportedLanguages().then((data) => {
      if (active) setSupported(data);
    });
    return () => {
      active = false;
    };
  }, []);

  const availableSources = filterSourceLanguages(supported, LANGUAGES);
  const fallbackSource = availableSources[0] ?? LANGUAGES[0];
  const normalizedRoomId = roomId.trim().toUpperCase();
  const isRoomIdValid = /^NEMI-\d{4}$/.test(normalizedRoomId);
  const targetCodes = new Set(
    Object.values(supported.targetsBySource).flat()
  );
  const availableJoinTargets =
    supported.limited && targetCodes.size > 0
      ? LANGUAGES.filter((lang) => targetCodes.has(lang.code))
      : LANGUAGES;
  const fallbackTarget = availableJoinTargets[0] ?? LANGUAGES[0];

  useEffect(() => {
    if (!availableSources.find((lang) => lang.code === selectedLang.code)) {
      setSelectedLang(fallbackSource);
    }
  }, [availableSources, fallbackSource.code, selectedLang.code]);

  useEffect(() => {
    if (!availableJoinTargets.find((lang) => lang.code === selectedTargetLang.code)) {
      setSelectedTargetLang(fallbackTarget);
    }
  }, [availableJoinTargets, fallbackTarget.code, selectedTargetLang.code]);

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      <div className="mb-12 animate-pulse">
        <Logo size="lg" />
      </div>

      <div className="w-full max-w-md space-y-6">
        {error && (
          <div className="rounded-2xl border border-rose-400/40 bg-rose-500/10 px-4 py-3 text-sm text-rose-100">
            {error}
          </div>
        )}

        {mode === 'initial' && (
          <div className="flex flex-col gap-4">
            <button
              onClick={() => setMode('create')}
              className="flex items-center justify-between p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 hover:border-blue-500/50 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-blue-500/10 rounded-xl group-hover:bg-blue-500/20">
                  <Plus className="w-6 h-6 text-blue-400" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-semibold">Create Room</h3>
                  <p className="text-sm text-gray-400">Start a new lecture as speaker</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-500" />
            </button>

            <button
              onClick={() => setMode('join')}
              className="flex items-center justify-between p-6 bg-white/5 border border-white/10 rounded-2xl hover:bg-white/10 hover:border-blue-500/50 transition-all group"
            >
              <div className="flex items-center gap-4">
                <div className="p-3 bg-purple-500/10 rounded-xl group-hover:bg-purple-500/20">
                  <Users className="w-6 h-6 text-purple-400" />
                </div>
                <div className="text-left">
                  <h3 className="text-lg font-semibold">Join Room</h3>
                  <p className="text-sm text-gray-400">Listen to a live translation</p>
                </div>
              </div>
              <ArrowRight className="w-5 h-5 text-gray-500" />
            </button>
          </div>
        )}

        {mode === 'create' && (
          <div className="bg-white/5 border border-white/10 p-8 rounded-3xl glow-white space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h3 className="text-xl font-bold text-center">Setup your Lecture</h3>
            <div className="space-y-4">
              <label className="block text-sm text-gray-400 px-1">Source Language</label>
              <div className="grid grid-cols-2 gap-2">
                {availableSources.map(lang => (
                  <button
                    key={lang.code}
                    onClick={() => setSelectedLang(lang)}
                    className={`px-4 py-2 rounded-lg text-sm border transition-all ${
                      selectedLang.code === lang.code 
                        ? 'bg-blue-600 border-blue-400 text-white' 
                        : 'bg-black/40 border-white/10 text-gray-400 hover:border-white/30'
                    }`}
                  >
                    {lang.name}
                  </button>
                ))}
              </div>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setMode('initial')}
                className="flex-1 px-6 py-3 rounded-xl border border-white/10 text-gray-400 hover:bg-white/5"
              >
                Back
              </button>
              <button 
                disabled={isSubmitting}
                onClick={() => onCreateRoom(selectedLang)}
                className="flex-[2] px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed text-white font-semibold transition-all shadow-lg shadow-blue-500/20"
              >
                {isSubmitting ? 'Creating...' : 'Create Room'}
              </button>
            </div>
          </div>
        )}

        {mode === 'join' && (
          <div className="bg-white/5 border border-white/10 p-8 rounded-3xl glow-white space-y-6 animate-in fade-in slide-in-from-bottom-4 duration-300">
            <h3 className="text-xl font-bold text-center">Enter Room ID</h3>
            <div className="space-y-4">
              <input 
                type="text"
                placeholder="e.g. NEMI-4293"
                value={roomId}
                onChange={(e) => {
                  setRoomId(e.target.value.toUpperCase());
                  setRoomIdError(null);
                }}
                className="w-full bg-black/40 border border-white/10 rounded-xl px-4 py-4 text-center text-2xl font-mono tracking-widest focus:outline-none focus:border-blue-500/50 transition-all"
              />
              {roomIdError && (
                <p className="text-center text-sm text-rose-200">{roomIdError}</p>
              )}
              <div className="space-y-3">
                <label className="block text-sm text-gray-400 px-1">Target Language</label>
                <div className="grid grid-cols-2 gap-2">
                  {availableJoinTargets.map((lang) => (
                    <button
                      key={lang.code}
                      onClick={() => setSelectedTargetLang(lang)}
                      className={`px-4 py-2 rounded-lg text-sm border transition-all ${
                        selectedTargetLang.code === lang.code
                          ? 'bg-blue-600 border-blue-400 text-white'
                          : 'bg-black/40 border-white/10 text-gray-400 hover:border-white/30'
                      }`}
                    >
                      {lang.name}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="flex gap-3">
              <button 
                onClick={() => setMode('initial')}
                className="flex-1 px-6 py-3 rounded-xl border border-white/10 text-gray-400 hover:bg-white/5"
              >
                Back
              </button>
              <button 
                disabled={!roomId || isSubmitting}
                onClick={() => {
                  if (!isRoomIdValid) {
                    setRoomIdError('Введите код комнаты в формате NEMI-1234');
                    return;
                  }
                  onJoinRoom(normalizedRoomId, selectedTargetLang);
                }}
                className="flex-[2] px-6 py-3 rounded-xl bg-blue-600 hover:bg-blue-500 disabled:opacity-50 disabled:cursor-not-allowed text-white font-semibold transition-all shadow-lg shadow-blue-500/20"
              >
                {isSubmitting ? 'Joining...' : 'Join Room'}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
