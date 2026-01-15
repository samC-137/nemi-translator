import {
  RoomErrorPayload,
  RoomListenerCountPayload,
  RoomStatusPayload,
  StreamTranscriptionPayload,
  StreamTranslationPayload,
  StreamTtsPayload
} from './realtimeContracts';
import { Language } from '../types';

export type RealtimeClientOptions = {
  baseUrl?: string;
  roomId: string;
  role: 'lecturer' | 'listener' | 'admin';
  sourceLanguage?: Language;
  targetLanguage?: Language;
  onStatus?: (payload: RoomStatusPayload) => void;
  onError?: (payload: RoomErrorPayload) => void;
  onListenerCount?: (payload: RoomListenerCountPayload) => void;
  onTranscription?: (payload: StreamTranscriptionPayload) => void;
  onTranslation?: (payload: StreamTranslationPayload) => void;
  onTts?: (payload: StreamTtsPayload) => void;
};

const resolveWsUrl = (baseUrl?: string, path = '/ws') => {
  const envBase = (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
  const rawBase = (baseUrl || envBase || 'http://localhost:8000').replace(/\/$/, '');
  const wsBase = rawBase.startsWith('ws') ? rawBase : rawBase.replace(/^http/, 'ws');
  return `${wsBase}${path}`;
};

export class RealtimeClient {
  private options: RealtimeClientOptions;
  private ws: WebSocket | null = null;

  constructor(options: RealtimeClientOptions) {
    this.options = options;
  }

  connect() {
    if (this.ws && this.ws.readyState === WebSocket.OPEN) return;
    const url = resolveWsUrl(this.options.baseUrl, '/ws');
    const ws = new WebSocket(url);
    this.ws = ws;

    ws.onopen = () => {
      this.send('room:join', {
        roomId: this.options.roomId,
        role: this.options.role,
        sourceLanguage: this.options.sourceLanguage,
        targetLanguage: this.options.targetLanguage
      });
    };

    ws.onmessage = (event) => {
      if (typeof event.data !== 'string') return;
      let parsed: any;
      try {
        parsed = JSON.parse(event.data);
      } catch {
        return;
      }
      const eventName = parsed?.event;
      const payload = parsed?.payload;
      if (!eventName || !payload) return;

      if (eventName === 'room:status') this.options.onStatus?.(payload);
      if (eventName === 'room:error') this.options.onError?.(payload);
      if (eventName === 'room:listenerCount') this.options.onListenerCount?.(payload);
      if (eventName === 'stream:transcription') this.options.onTranscription?.(payload);
      if (eventName === 'stream:translation') this.options.onTranslation?.(payload);
      if (eventName === 'stream:tts') this.options.onTts?.(payload);
    };

    ws.onclose = () => {
      this.ws = null;
    };
  }

  reconnect() {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.send('room:reconnect', {
      roomId: this.options.roomId,
      role: this.options.role
    });
  }

  disconnect(reason: 'user' | 'network' | 'kicked' | 'error' = 'user') {
    if (!this.ws) return;
    if (this.ws.readyState === WebSocket.OPEN) {
      this.send('room:leave', {
        roomId: this.options.roomId,
        role: this.options.role,
        reason
      });
    }
    this.ws.close();
    this.ws = null;
  }

  private send(event: string, payload: Record<string, unknown>) {
    if (!this.ws || this.ws.readyState !== WebSocket.OPEN) return;
    this.ws.send(JSON.stringify({ event, payload }));
  }
}
