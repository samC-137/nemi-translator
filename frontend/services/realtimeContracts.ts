import { Language, RoomStatus, StreamPacket } from '../types';

export type Role = 'lecturer' | 'listener' | 'admin';

export type RoomJoinPayload = {
  roomId: string;
  role: Role;
  sourceLanguage?: Language;
  targetLanguage?: Language;
  clientId?: string;
};

export type RoomLeavePayload = {
  roomId: string;
  role: Role;
  reason?: 'user' | 'network' | 'kicked' | 'error';
};

export type RoomReconnectPayload = {
  roomId: string;
  role: Role;
};

export type StreamTranscriptionPayload = {
  roomId: string;
  packet: StreamPacket;
};

export type StreamTranslationPayload = {
  roomId: string;
  targetLanguage: Language;
  packet: StreamPacket;
};


export type StreamTtsPayload = {
  roomId: string;
  audio: string;
  sampleRate: number;
  targetLanguage: Language;
};

export type RoomStatusPayload = {
  roomId: string;
  status: RoomStatus;
  message?: string;
  sourceLanguage?: string;
  targetLanguage?: string;
};

export type RoomErrorPayload = {
  roomId: string;
  code: string;
  message: string;
  fatal?: boolean;
};

export type RoomListenerCountPayload = {
  roomId: string;
  count: number;
};

export type ClientToServerEvents = {
  'room:join': RoomJoinPayload;
  'room:leave': RoomLeavePayload;
  'room:reconnect': RoomReconnectPayload;
};

export type ServerToClientEvents = {
  'room:status': RoomStatusPayload;
  'room:error': RoomErrorPayload;
  'room:listenerCount': RoomListenerCountPayload;
  'stream:transcription': StreamTranscriptionPayload;
  'stream:translation': StreamTranslationPayload;
  'stream:tts': StreamTtsPayload;
};

export type EventMap = Record<string, unknown>;
export type EventName<T extends EventMap> = keyof T;
export type EventPayload<T extends EventMap, K extends EventName<T>> = T[K];
