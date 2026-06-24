import { act, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminView } from './AdminView';
import {
  fetchAdminRooms,
  fetchAdminSystemStatus
} from '../services/adminApi';

vi.mock('../services/adminApi', () => ({
  fetchAdminRooms: vi.fn(),
  fetchAdminRoom: vi.fn(),
  fetchAdminSystemStatus: vi.fn(),
  stopAdminRoom: vi.fn(),
  resetAdminRoomListeners: vi.fn(),
  restartAdminRoom: vi.fn()
}));

const room = {
  id: 'NEMI-1001',
  title: 'Комната NEMI-1001',
  sourceLanguage: { code: 'en-US', name: 'English' },
  targetLanguage: { code: 'ru-RU', name: 'Russian' },
  status: 'live' as const,
  listenersCount: 2,
  latency: 410,
  startedAt: Date.parse('2026-06-24T10:00:00.000Z'),
  updatedAt: Date.parse('2026-06-24T10:01:00.000Z')
};

const systemStatus = {
  stt: 'ok',
  translate: 'ok',
  tts: 'ok',
  profile: 'demo',
  sttProvider: 'fake',
  sttModel: 'fake',
  mtProvider: 'fake',
  mtModel: 'fake',
  ollamaBaseUrl: '',
  ollamaModel: '',
  ttsProvider: 'fake',
  fakeTranscripts: true,
  fakeTranslations: true,
  listenerDelayMs: 0,
  sttSegmentMaxMs: 1000,
  sttSegmentMinMs: 200,
  vadPaddingMs: 300,
  translationContextSegments: 2,
  phraseMinChars: 20,
  phraseMaxChars: 200,
  phraseTimeoutMs: 1000
};

const roomsResponse = { total: 1, live: 1, listeners: 2, rooms: [room] };

const renderDashboard = () =>
  render(
    <MemoryRouter future={{ v7_startTransition: true, v7_relativeSplatPath: true }}>
      <AdminView />
    </MemoryRouter>
  );

const flushPromises = async () => {
  await act(async () => {
    await Promise.resolve();
    await Promise.resolve();
  });
};

describe('AdminView dashboard', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(fetchAdminRooms).mockResolvedValue(roomsResponse);
    vi.mocked(fetchAdminSystemStatus).mockResolvedValue(systemStatus);
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('refreshes real rooms every two seconds without navigation', async () => {
    renderDashboard();
    await flushPromises();

    expect(screen.getByText('Комната NEMI-1001')).toBeInTheDocument();
    expect(fetchAdminRooms).toHaveBeenCalledTimes(1);

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2000);
    });

    expect(fetchAdminRooms).toHaveBeenCalledTimes(2);
  });

  it('keeps rooms visible when system status cannot be loaded', async () => {
    vi.mocked(fetchAdminSystemStatus).mockRejectedValue(new Error('status offline'));
    renderDashboard();
    await flushPromises();

    expect(screen.getByText('Комната NEMI-1001')).toBeInTheDocument();
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось загрузить статус системы');
  });
});
