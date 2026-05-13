
export type Language = {
  code: string;
  name: string;
};

export type RoomStatus = 'connecting' | 'reconnecting' | 'live' | 'disconnected' | 'stopped';

export const LANGUAGES: Language[] = [
  { code: 'en-US', name: 'English' },
  { code: 'ru-RU', name: 'Russian' },
  { code: 'zh-CN', name: 'Chinese' },
  { code: 'ja-JP', name: 'Japanese' },
  { code: 'fr-FR', name: 'French' },
  { code: 'de-DE', name: 'German' },
  { code: 'es-ES', name: 'Spanish' },
  { code: 'it-IT', name: 'Italian' },
  { code: 'pt-BR', name: 'Portuguese (BR)' },
  { code: 'nl-NL', name: 'Dutch' },
  { code: 'pl-PL', name: 'Polish' },
  { code: 'tr-TR', name: 'Turkish' },
  { code: 'uk-UA', name: 'Ukrainian' },
  { code: 'ko-KR', name: 'Korean' },
];

export interface RoomSession {
  id: string;
  sourceLanguage: Language;
  targetLanguage: Language;
  status: RoomStatus;
  token?: string;
  role?: 'lecturer' | 'listener' | 'admin';
}

export interface StreamPacket {
  id: string;
  text: string;
  ts: number;
}

export interface RoomStats {
  latency: number;
  listenersCount: number;
}
