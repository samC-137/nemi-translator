import { act, fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminRoomView, AdminView } from './AdminView';
import {
  fetchAdminRoom,
  fetchAdminRooms,
  fetchAdminSystemStatus,
  resetAdminRoomListeners,
  restartAdminRoom,
  stopAdminRoom
} from '../services/adminApi';

const realtimeState = vi.hoisted(() => ({ options: null as Record<string, any> | null }));

vi.mock('../services/realtimeClient', () => ({
  RealtimeClient: class {
    constructor(options: Record<string, any>) {
      realtimeState.options = options;
    }
    connect() {}
    disconnect() {}
  }
}));

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

const renderRoomDetails = () =>
  render(
    <MemoryRouter
      initialEntries={['/admin/room/NEMI-1001']}
      future={{ v7_startTransition: true, v7_relativeSplatPath: true }}
    >
      <Routes>
        <Route path="/admin/room/:id" element={<AdminRoomView />} />
      </Routes>
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
    vi.mocked(fetchAdminRoom).mockResolvedValue(room);
    vi.mocked(stopAdminRoom).mockResolvedValue({ roomId: room.id, status: 'stopped' });
    vi.mocked(resetAdminRoomListeners).mockResolvedValue({ roomId: room.id, removed: 2 });
    vi.mocked(restartAdminRoom).mockResolvedValue({ roomId: room.id, status: 'connecting' });
    realtimeState.options = null;
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

  it('stops a room from the dashboard and refreshes backend data', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(stopAdminRoom).mockResolvedValue({ roomId: room.id, status: 'stopped' });
    renderDashboard();
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: 'Стоп' }));
    await flushPromises();

    expect(stopAdminRoom).toHaveBeenCalledWith('NEMI-1001');
    expect(fetchAdminRooms).toHaveBeenCalledTimes(2);
  });

  it('does not stop a room when confirmation is cancelled', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderDashboard();
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: 'Стоп' }));

    expect(stopAdminRoom).not.toHaveBeenCalled();
  });

  it('disables the room stop button while the request is pending', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(stopAdminRoom).mockReturnValue(new Promise(() => undefined));
    renderDashboard();
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: 'Стоп' }));

    expect(screen.getByRole('button', { name: 'Останавливаем...' })).toBeDisabled();
  });
});

describe('AdminRoomView', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    vi.mocked(fetchAdminRoom).mockResolvedValue(room);
    vi.mocked(stopAdminRoom).mockResolvedValue({ roomId: room.id, status: 'stopped' });
    vi.mocked(resetAdminRoomListeners).mockResolvedValue({ roomId: room.id, removed: 2 });
    vi.mocked(restartAdminRoom).mockResolvedValue({ roomId: room.id, status: 'connecting' });
    realtimeState.options = null;
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.clearAllMocks();
  });

  it('updates listener count and room status from realtime events', async () => {
    renderRoomDetails();
    await flushPromises();

    act(() => {
      realtimeState.options?.onListenerCount({ roomId: room.id, count: 7 });
      realtimeState.options?.onStatus({ roomId: room.id, status: 'reconnecting' });
    });

    expect(screen.getByText('Слушателей').parentElement).toHaveTextContent('7');
    expect(screen.getAllByText('Reconnecting').length).toBeGreaterThan(0);
  });

  it('requires confirmation before a destructive room action', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(false);
    renderRoomDetails();
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: 'Остановить комнату' }));

    expect(stopAdminRoom).not.toHaveBeenCalled();
  });

  it('runs and refreshes all room lifecycle actions', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    renderRoomDetails();
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: 'Сброс слушателей' }));
    await flushPromises();
    fireEvent.click(screen.getByRole('button', { name: 'Перезапустить поток' }));
    await flushPromises();
    fireEvent.click(screen.getByRole('button', { name: 'Остановить комнату' }));
    await flushPromises();

    expect(resetAdminRoomListeners).toHaveBeenCalledWith(room.id);
    expect(restartAdminRoom).toHaveBeenCalledWith(room.id);
    expect(stopAdminRoom).toHaveBeenCalledWith(room.id);
    expect(fetchAdminRoom).toHaveBeenCalledTimes(4);
  });

  it('disables room actions while an operation is pending', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true);
    vi.mocked(restartAdminRoom).mockReturnValue(new Promise(() => undefined));
    renderRoomDetails();
    await flushPromises();

    fireEvent.click(screen.getByRole('button', { name: 'Перезапустить поток' }));

    expect(screen.getByRole('button', { name: 'Перезапуск...' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Остановить комнату' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Сброс слушателей' })).toBeDisabled();
  });
});
