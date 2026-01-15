import { Language, LANGUAGES, RoomStatus } from '../types';

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

const now = Date.now();

export const ADMIN_ROOMS: AdminRoom[] = [
  {
    id: 'NEMI-4821',
    title: 'История искусства: модернизм',
    sourceLanguage: LANGUAGES[1],
    targetLanguage: LANGUAGES[0],
    status: 'live',
    listenersCount: 128,
    latency: 74,
    startedAt: now - 1000 * 60 * 42,
    updatedAt: now - 1000 * 25
  },
  {
    id: 'NEMI-9073',
    title: 'Физика: электромагнетизм',
    sourceLanguage: LANGUAGES[0],
    targetLanguage: LANGUAGES[1],
    status: 'connecting',
    listenersCount: 56,
    latency: 140,
    startedAt: now - 1000 * 60 * 12,
    updatedAt: now - 1000 * 10
  },
  {
    id: 'NEMI-3345',
    title: 'Data Science 101',
    sourceLanguage: LANGUAGES[0],
    targetLanguage: LANGUAGES[4],
    status: 'live',
    listenersCount: 214,
    latency: 63,
    startedAt: now - 1000 * 60 * 75,
    updatedAt: now - 1000 * 40
  },
  {
    id: 'NEMI-1190',
    title: 'Биология: клетки и ткани',
    sourceLanguage: LANGUAGES[1],
    targetLanguage: LANGUAGES[2],
    status: 'stopped',
    listenersCount: 0,
    latency: 0,
    startedAt: now - 1000 * 60 * 180,
    updatedAt: now - 1000 * 60 * 45
  },
  {
    id: 'NEMI-6502',
    title: 'Японский язык: практика',
    sourceLanguage: LANGUAGES[3],
    targetLanguage: LANGUAGES[0],
    status: 'live',
    listenersCount: 87,
    latency: 92,
    startedAt: now - 1000 * 60 * 28,
    updatedAt: now - 1000 * 15
  }
];

export const getAdminRoomById = (roomId: string) =>
  ADMIN_ROOMS.find((room) => room.id === roomId);

export const getStatusLabel = (status: RoomStatus) => {
  if (status === 'live') return 'Live';
  if (status === 'connecting') return 'Connecting';
  return 'Stopped';
};
