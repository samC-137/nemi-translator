import { Language, LANGUAGES, RoomSession, RoomStatus } from '../types';

type RoomApiResponse = {
  roomId: string;
  token: string;
  role: 'lecturer' | 'listener';
  status?: RoomStatus;
  sourceLanguage?: string;
  targetLanguage?: string | null;
};

const resolveBaseUrl = () => {
  const envBase = (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
  return (envBase || 'http://localhost:8000').replace(/\/$/, '');
};

const resolveLanguageByCode = (code?: string | null, fallback = LANGUAGES[0]): Language => {
  if (!code) return fallback;
  return LANGUAGES.find((lang) => lang.code === code) ?? { code, name: code };
};

const requestJson = async <T>(path: string, init: RequestInit): Promise<T> => {
  const response = await fetch(`${resolveBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    const message = response.status === 404 ? 'Комната не найдена' : 'Сервер недоступен';
    throw new Error(message);
  }

  return (await response.json()) as T;
};

export const createRoom = async (sourceLanguage: Language) => {
  const data = await requestJson<RoomApiResponse>('/rooms', {
    method: 'POST',
    body: JSON.stringify({ sourceLanguage })
  });

  const session: RoomSession = {
    id: data.roomId,
    sourceLanguage: resolveLanguageByCode(data.sourceLanguage, sourceLanguage),
    targetLanguage: resolveLanguageByCode(data.targetLanguage, LANGUAGES[0]),
    status: data.status ?? 'connecting',
    token: data.token,
    role: data.role
  };

  return session;
};

export const joinRoom = async (roomId: string, targetLanguage: Language) => {
  const data = await requestJson<RoomApiResponse>(`/rooms/${encodeURIComponent(roomId)}/join`, {
    method: 'POST',
    body: JSON.stringify({ targetLanguage })
  });

  const sourceLanguage = resolveLanguageByCode(data.sourceLanguage, LANGUAGES[0]);
  const resolvedTarget =
    resolveLanguageByCode(data.targetLanguage, targetLanguage).code === sourceLanguage.code
      ? LANGUAGES.find((lang) => lang.code !== sourceLanguage.code) ?? targetLanguage
      : resolveLanguageByCode(data.targetLanguage, targetLanguage);

  const session: RoomSession = {
    id: data.roomId,
    sourceLanguage,
    targetLanguage: resolvedTarget,
    status: data.status ?? 'connecting',
    token: data.token,
    role: data.role
  };

  return session;
};
