import { Language, LANGUAGES, RoomStatus } from '../types';
import { getAdminToken, invalidateAdminSession } from './adminAuth';

export type AdminRoom = {
  id: string;
  title: string;
  sourceLanguage: Language;
  targetLanguage: Language;
  status: RoomStatus;
  listenersCount: number;
  latency: number;
  startedAt: number;
  updatedAt: number;
};

type AdminRoomResponse = {
  roomId: string;
  status: RoomStatus;
  sourceLanguage: string;
  targetLanguage?: string | null;
  listenersCount: number;
  latency?: number;
  createdAt?: string;
  updatedAt?: string;
};

type AdminRoomsResponse = {
  total: number;
  live: number;
  listeners: number;
  rooms: AdminRoomResponse[];
};

export type AdminSystemStatus = {
  stt: string;
  translate: string;
  tts: string;
  profile: string;
  sttProvider: string;
  sttModel: string;
  mtProvider: string;
  mtModel: string;
  ollamaBaseUrl: string;
  ollamaModel: string;
  ttsProvider: string;
  fakeTranscripts: boolean;
  fakeTranslations: boolean;
  listenerDelayMs: number;
  sttSegmentMaxMs: number;
  sttSegmentMinMs: number;
  vadPaddingMs: number;
  translationContextSegments: number;
  phraseMinChars: number;
  phraseMaxChars: number;
  phraseTimeoutMs: number;
};

const resolveBaseUrl = () => {
  const envBase = (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
  return (envBase || 'http://localhost:8000').replace(/\/$/, '');
};

const resolveLanguageByCode = (code?: string | null, fallback = LANGUAGES[0]): Language => {
  if (!code) return fallback;
  return LANGUAGES.find((lang) => lang.code === code) ?? { code, name: code };
};

const parseTimestamp = (value?: string) => {
  if (!value) return Date.now();
  const parsed = Date.parse(value);
  return Number.isNaN(parsed) ? Date.now() : parsed;
};

const toAdminRoom = (room: AdminRoomResponse): AdminRoom => {
  const sourceLanguage = resolveLanguageByCode(room.sourceLanguage, LANGUAGES[0]);
  const targetLanguage = resolveLanguageByCode(
    room.targetLanguage,
    LANGUAGES.find((lang) => lang.code !== sourceLanguage.code) ?? LANGUAGES[0]
  );

  return {
    id: room.roomId,
    title: `Комната ${room.roomId}`,
    sourceLanguage,
    targetLanguage,
    status: room.status,
    listenersCount: room.listenersCount,
    latency: room.latency ?? 0,
    startedAt: parseTimestamp(room.createdAt),
    updatedAt: parseTimestamp(room.updatedAt)
  };
};

const requestJson = async <T>(path: string, init: RequestInit = {}): Promise<T> => {
  const token = getAdminToken();
  const response = await fetch(`${resolveBaseUrl()}${path}`, {
    ...init,
    headers: {
      'Content-Type': 'application/json',
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
      ...(init.headers ?? {})
    }
  });

  if (!response.ok) {
    if (response.status === 401 || response.status === 403) {
      invalidateAdminSession();
      throw new Error('Требуется повторный вход администратора');
    }
    if (response.status === 404) {
      throw new Error('Комната не найдена');
    }
    throw new Error('Не удалось получить данные администратора');
  }

  return (await response.json()) as T;
};

export const fetchAdminRooms = async () => {
  const data = await requestJson<AdminRoomsResponse>('/admin/rooms');
  return {
    total: data.total,
    live: data.live,
    listeners: data.listeners,
    rooms: data.rooms.map(toAdminRoom)
  };
};

export const fetchAdminRoom = async (roomId: string) => {
  const data = await requestJson<AdminRoomResponse>(
    `/admin/rooms/${encodeURIComponent(roomId)}`
  );
  return toAdminRoom(data);
};

export const fetchAdminSystemStatus = () =>
  requestJson<AdminSystemStatus>('/admin/system/status');

export const stopAdminRoom = (roomId: string) =>
  requestJson<{ roomId: string; status: RoomStatus }>(
    `/admin/rooms/${encodeURIComponent(roomId)}/stop`,
    { method: 'POST' }
  );

export const resetAdminRoomListeners = (roomId: string) =>
  requestJson<{ roomId: string; removed: number }>(
    `/admin/rooms/${encodeURIComponent(roomId)}/reset-listeners`,
    { method: 'POST' }
  );

export const restartAdminRoom = (roomId: string) =>
  requestJson<{ roomId: string; status: RoomStatus }>(
    `/admin/rooms/${encodeURIComponent(roomId)}/restart`,
    { method: 'POST' }
  );
