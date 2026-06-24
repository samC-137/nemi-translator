import { beforeEach, describe, expect, it, vi } from 'vitest';
import { fetchAdminRooms } from './adminApi';
import { setAdminToken } from './adminAuth';

describe('adminApi', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('loads backend rooms with authorization and maps their fields', async () => {
    setAdminToken('admin-token');
    const fetchMock = vi.spyOn(globalThis, 'fetch').mockResolvedValue(
      new Response(
        JSON.stringify({
          total: 1,
          live: 1,
          listeners: 2,
          rooms: [
            {
              roomId: 'NEMI-1001',
              status: 'live',
              sourceLanguage: 'en-US',
              targetLanguage: 'ru-RU',
              listenersCount: 2,
              latency: 410,
              createdAt: '2026-06-24T10:00:00.000Z',
              updatedAt: '2026-06-24T10:01:00.000Z'
            }
          ]
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } }
      )
    );

    const result = await fetchAdminRooms();

    expect(fetchMock).toHaveBeenCalledWith(
      'http://localhost:8000/admin/rooms',
      expect.objectContaining({
        headers: expect.objectContaining({ Authorization: 'Bearer admin-token' })
      })
    );
    expect(result).toEqual({
      total: 1,
      live: 1,
      listeners: 2,
      rooms: [
        expect.objectContaining({
          id: 'NEMI-1001',
          title: 'Комната NEMI-1001',
          sourceLanguage: { code: 'en-US', name: 'English' },
          targetLanguage: { code: 'ru-RU', name: 'Russian' },
          listenersCount: 2,
          latency: 410,
          startedAt: Date.parse('2026-06-24T10:00:00.000Z'),
          updatedAt: Date.parse('2026-06-24T10:01:00.000Z')
        })
      ]
    });
  });
});
