import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Logo } from './Logo';
import { RealtimeClient } from '../services/realtimeClient';
import {
  AdminRoom,
  fetchAdminRoom,
  fetchAdminRooms,
  fetchAdminSystemStatus,
  resetAdminRoomListeners,
  restartAdminRoom,
  stopAdminRoom,
  AdminSystemStatus
} from '../services/adminApi';
import { RoomStatus } from '../types';
import { ArrowLeft, Eye, Filter, Power, Search, Users } from 'lucide-react';
import { clearAdminToken } from '../services/adminAuth';

const statusStyles: Record<RoomStatus, { dot: string; pill: string }> = {
  live: { dot: 'bg-emerald-400', pill: 'border-emerald-400/40 text-emerald-200' },
  connecting: { dot: 'bg-yellow-300', pill: 'border-yellow-300/40 text-yellow-100' },
  reconnecting: { dot: 'bg-yellow-300', pill: 'border-yellow-300/40 text-yellow-100' },
  disconnected: { dot: 'bg-orange-400', pill: 'border-orange-400/40 text-orange-100' },
  stopped: { dot: 'bg-rose-400', pill: 'border-rose-400/40 text-rose-200' }
};

const formatTime = (timestamp: number) =>
  new Date(timestamp).toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' });

const formatAgo = (timestamp: number) => {
  const diff = Date.now() - timestamp;
  const minutes = Math.max(1, Math.round(diff / 60000));
  if (minutes < 60) return `${minutes} мин назад`;
  const hours = Math.round(minutes / 60);
  return `${hours} ч назад`;
};

const getStatusLabel = (status: RoomStatus) => {
  if (status === 'live') return 'Live';
  if (status === 'connecting') return 'Connecting';
  if (status === 'reconnecting') return 'Reconnecting';
  if (status === 'disconnected') return 'Disconnected';
  return 'Stopped';
};

const AdminRoomRow: React.FC<{ room: AdminRoom; onOpen: (id: string) => void }> = ({
  room,
  onOpen
}) => {
  const styles = statusStyles[room.status];

  return (
    <div className="grid grid-cols-1 gap-4 rounded-3xl border border-white/10 bg-white/5 p-5 text-sm text-gray-200 shadow-[0_10px_40px_rgba(0,0,0,0.25)] md:grid-cols-[1.5fr_1fr_1fr_0.8fr_0.8fr_auto] md:items-center">
      <div>
        <p className="text-base font-semibold text-white">{room.title}</p>
        <p className="text-xs uppercase tracking-[0.2em] text-gray-500">{room.id}</p>
      </div>
      <div>
        <p className="text-xs text-gray-500">Языки</p>
        <p className="text-sm text-white">
          {room.sourceLanguage.name} → {room.targetLanguage.name}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <span className={`h-2.5 w-2.5 rounded-full ${styles.dot}`} />
        <span className={`rounded-full border px-3 py-1 text-xs ${styles.pill}`}>
          {getStatusLabel(room.status)}
        </span>
      </div>
      <div className="flex items-center gap-2 text-gray-200">
        <Users className="h-4 w-4 text-gray-500" />
        {room.listenersCount}
      </div>
      <div className="text-gray-200">{room.latency} ms</div>
      <div className="flex flex-wrap gap-2">
        <button
          onClick={() => onOpen(room.id)}
          className="flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-3 py-1.5 text-xs text-white transition hover:border-white/30"
        >
          <Eye className="h-3.5 w-3.5" />
          Открыть
        </button>
        <button
          className="flex items-center gap-2 rounded-full border border-white/10 bg-black/40 px-3 py-1.5 text-xs text-gray-300 transition hover:border-white/30"
        >
          <Power className="h-3.5 w-3.5" />
          Стоп
        </button>
      </div>
    </div>
  );
};

export const AdminView: React.FC = () => {
  const navigate = useNavigate();
  const [query, setQuery] = useState('');
  const [statusFilter, setStatusFilter] = useState<RoomStatus | 'all'>('all');
  const [rooms, setRooms] = useState<AdminRoom[]>([]);
  const [stats, setStats] = useState({ total: 0, live: 0, listeners: 0 });
  const [systemStatus, setSystemStatus] = useState<AdminSystemStatus | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const loadRooms = async () => {
    setIsLoading(true);
    setError(null);
    try {
      const data = await fetchAdminRooms();
      setRooms(data.rooms);
      setStats({ total: data.total, live: data.live, listeners: data.listeners });
      const status = await fetchAdminSystemStatus();
      setSystemStatus(status);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось загрузить комнаты');
    } finally {
      setIsLoading(false);
    }
  };

  useEffect(() => {
    void loadRooms();
  }, []);

  const filteredRooms = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return rooms.filter((room) => {
      const matchesQuery =
        !normalized ||
        room.id.toLowerCase().includes(normalized) ||
        room.title.toLowerCase().includes(normalized);
      const matchesStatus = statusFilter === 'all' || room.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [query, rooms, statusFilter]);

  return (
    <div className="min-h-screen bg-transparent px-6 py-12 text-white md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-10">
        <div className="flex flex-col items-start gap-6 md:flex-row md:items-center md:justify-between">
          <div className="flex items-center gap-6">
            <Logo size="sm" />
            <div>
              <h1 className="text-2xl font-semibold tracking-wide">Admin Dashboard</h1>
              <p className="text-sm text-gray-400">Мониторинг комнат в реальном времени</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-4">
            <button
              onClick={() => {
                clearAdminToken();
                navigate('/admin/login');
              }}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs uppercase tracking-[0.2em] text-gray-400 transition hover:border-white/30 hover:text-white"
            >
              Logout
            </button>
            <button
              onClick={() => void loadRooms()}
              className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3 text-xs uppercase tracking-[0.2em] text-gray-400 transition hover:border-white/30 hover:text-white"
            >
              Refresh
            </button>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Всего комнат</p>
              <p className="text-lg font-semibold text-white">{stats.total}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Live</p>
              <p className="text-lg font-semibold text-white">{stats.live}</p>
            </div>
            <div className="rounded-2xl border border-white/10 bg-white/5 px-4 py-3">
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Слушателей</p>
              <p className="text-lg font-semibold text-white">{stats.listeners}</p>
            </div>
          </div>
        </div>

        {systemStatus && (
          <div className="grid gap-3 rounded-3xl border border-white/10 bg-black/40 p-5 text-sm text-gray-300 md:grid-cols-4">
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Profile</p>
              <p className="mt-1 text-white">{systemStatus.profile}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">STT</p>
              <p className="mt-1 text-white">{systemStatus.sttProvider}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">MT</p>
              <p className="mt-1 text-white">{systemStatus.mtProvider}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">TTS</p>
              <p className="mt-1 text-white">{systemStatus.ttsProvider}</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Delay</p>
              <p className="mt-1 text-white">{systemStatus.listenerDelayMs} ms</p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">STT Window</p>
              <p className="mt-1 text-white">
                {systemStatus.sttSegmentMinMs}-{systemStatus.sttSegmentMaxMs} ms
              </p>
            </div>
            <div>
              <p className="text-xs uppercase tracking-[0.2em] text-gray-500">VAD Pause</p>
              <p className="mt-1 text-white">{systemStatus.vadPaddingMs} ms</p>
            </div>
          </div>
        )}

        <div className="flex flex-col gap-4 rounded-3xl border border-white/10 bg-black/40 p-5 md:flex-row md:items-center md:justify-between">
          <div className="relative w-full md:max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-gray-500" />
            <input
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Поиск по ID или названию"
              className="w-full rounded-2xl border border-white/10 bg-black/60 py-2.5 pl-10 pr-4 text-sm text-white placeholder:text-gray-500 focus:border-[#00A3FF]/60 focus:outline-none"
            />
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <div className="flex items-center gap-2 text-xs uppercase tracking-[0.2em] text-gray-500">
              <Filter className="h-4 w-4" />
              Статус
            </div>
            {(['all', 'live', 'connecting', 'reconnecting', 'disconnected', 'stopped'] as const).map((status) => (
              <button
                key={status}
                onClick={() => setStatusFilter(status)}
                className={`rounded-full px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] transition ${
                  statusFilter === status
                    ? 'bg-[#00A3FF]/20 text-[#7CC6FF]'
                    : 'border border-white/10 text-gray-400 hover:border-white/30'
                }`}
              >
                {status === 'all' ? 'Все' : getStatusLabel(status)}
              </button>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-4">
          {error && (
            <div className="rounded-3xl border border-rose-400/40 bg-rose-500/10 px-6 py-4 text-sm text-rose-100">
              {error}
            </div>
          )}
          {isLoading && (
            <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 text-center text-sm text-gray-400">
              Загружаем комнаты...
            </div>
          )}
          {!isLoading && filteredRooms.length === 0 && (
            <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 text-center text-sm text-gray-400">
              Комнат с такими параметрами не найдено.
            </div>
          )}
          {!isLoading && filteredRooms.map((room) => (
            <AdminRoomRow key={room.id} room={room} onOpen={(id) => navigate(`/admin/room/${id}`)} />
          ))}
        </div>
      </div>
    </div>
  );
};

export const AdminRoomView: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const [room, setRoom] = useState<AdminRoom | null>(null);
  const [isLoadingRoom, setIsLoadingRoom] = useState(true);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [transcription, setTranscription] = useState('');
  const [translation, setTranslation] = useState('');
  const [streamStatus, setStreamStatus] = useState<RoomStatus>('connecting');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const clientRef = useRef<RealtimeClient | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setIsLoadingRoom(true);
    setRoomError(null);
    fetchAdminRoom(id)
      .then((nextRoom) => {
        if (!active) return;
        setRoom(nextRoom);
        setStreamStatus(nextRoom.status);
      })
      .catch((err) => {
        if (active) setRoomError(err instanceof Error ? err.message : 'Комната не найдена');
      })
      .finally(() => {
        if (active) setIsLoadingRoom(false);
      });
    return () => {
      active = false;
    };
  }, [id]);

  useEffect(() => {
    if (!room) return;
    setTranscription('');
    setTranslation('');
    clientRef.current?.disconnect();
    clientRef.current = new RealtimeClient({
      roomId: room.id,
      role: 'admin',
      targetLanguage: room.targetLanguage,
      onTranscription: (payload) => {
        setTranscription(payload.packet.text);
        setStreamStatus('live');
      },
      onTranslation: (payload) => setTranslation(payload.packet.text),
      onStatus: (payload) => setStreamStatus(payload.status),
      onError: () => setStreamStatus('stopped')
    });
    clientRef.current.connect();
    return () => {
      clientRef.current?.disconnect();
    };
  }, [room?.id]);

  const reloadRoom = async () => {
    if (!id) return;
    const nextRoom = await fetchAdminRoom(id);
    setRoom(nextRoom);
    setStreamStatus(nextRoom.status);
  };

  const handleAction = async (label: string, action: () => Promise<unknown>) => {
    setActionMessage(null);
    try {
      await action();
      await reloadRoom();
      setActionMessage(`Действие "${label}" выполнено`);
    } catch (err) {
      setActionMessage(err instanceof Error ? err.message : `Не удалось выполнить "${label}"`);
    }
    window.setTimeout(() => setActionMessage(null), 2200);
  };

  if (isLoadingRoom) {
    return (
      <div className="min-h-screen bg-transparent px-6 py-12 text-white">
        <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
          <p className="text-lg font-semibold">Загружаем комнату...</p>
        </div>
      </div>
    );
  }

  if (!room || roomError) {
    return (
      <div className="min-h-screen bg-transparent px-6 py-12 text-white">
        <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
          <p className="text-lg font-semibold">Комната не найдена</p>
          {roomError && <p className="mt-2 text-sm text-gray-400">{roomError}</p>}
          <button
            onClick={() => navigate('/admin')}
            className="mt-6 rounded-full border border-white/10 px-6 py-2 text-sm text-gray-300 transition hover:border-white/30"
          >
            Вернуться к списку
          </button>
        </div>
      </div>
    );
  }

  const statusStyle = statusStyles[room.status];

  return (
    <div className="min-h-screen bg-transparent px-6 py-10 text-white md:px-10">
      <div className="mx-auto flex w-full max-w-6xl flex-col gap-8">
        <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
          <button
            onClick={() => navigate('/admin')}
            className="flex items-center gap-2 text-sm text-gray-400 transition hover:text-white"
          >
            <ArrowLeft className="h-4 w-4" />
            Назад к списку
          </button>
          <div className="flex flex-wrap gap-2">
            <button
              onClick={() =>
                void handleAction('Остановить комнату', () => stopAdminRoom(room.id))
              }
              className="rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-200 transition hover:border-rose-400/70"
            >
              Остановить комнату
            </button>
            <button
              onClick={() =>
                void handleAction('Сброс слушателей', () => resetAdminRoomListeners(room.id))
              }
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-200 transition hover:border-white/30"
            >
              Сброс слушателей
            </button>
            <button
              onClick={() =>
                void handleAction('Перезапустить поток', () => restartAdminRoom(room.id))
              }
              className="rounded-full border border-[#00A3FF]/30 bg-[#00A3FF]/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-[#7CC6FF] transition hover:border-[#00A3FF]/60"
            >
              Перезапустить поток
            </button>
          </div>
        </div>

        {actionMessage && (
          <div className="rounded-2xl border border-[#00A3FF]/30 bg-[#00A3FF]/10 px-4 py-3 text-sm text-[#7CC6FF]">
            {actionMessage}
          </div>
        )}

        <div className="flex flex-col gap-6 lg:flex-row">
          <div className="flex-1 rounded-[32px] border border-white/10 bg-white/5 p-6">
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Комната</p>
                <h1 className="text-2xl font-semibold text-white">{room.title}</h1>
                <p className="mt-1 text-sm text-gray-400">{room.id}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className={`h-3 w-3 rounded-full ${statusStyle.dot}`} />
                <span className={`rounded-full border px-3 py-1 text-xs ${statusStyle.pill}`}>
                  {getStatusLabel(room.status)}
                </span>
              </div>
            </div>
            <div className="mt-6 grid gap-4 sm:grid-cols-2">
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Языки</p>
                <p className="mt-2 text-sm text-white">
                  {room.sourceLanguage.name} → {room.targetLanguage.name}
                </p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 p-4">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Тайминг</p>
                <p className="mt-2 text-sm text-white">
                  Старт {formatTime(room.startedAt)} · {formatAgo(room.updatedAt)}
                </p>
              </div>
            </div>
          </div>

          <div className="w-full max-w-md rounded-[32px] border border-white/10 bg-white/5 p-6">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Статус потока</p>
            <div className="mt-3 flex items-center gap-3">
              <span
                className={`h-3 w-3 rounded-full ${
                  streamStatus === 'live'
                    ? 'bg-emerald-400'
                    : streamStatus === 'connecting'
                    ? 'bg-yellow-300'
                    : 'bg-rose-400'
                }`}
              />
              <span className="text-sm text-gray-200">
                {streamStatus === 'live'
                  ? 'Подключено'
                  : streamStatus === 'connecting'
                  ? 'Подключение...'
                  : 'Остановлено'}
              </span>
            </div>
            <div className="mt-6 grid gap-3">
              <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Слушателей</p>
                <p className="mt-1 text-lg font-semibold text-white">{room.listenersCount}</p>
              </div>
              <div className="rounded-2xl border border-white/10 bg-black/40 px-4 py-3">
                <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Latency</p>
                <p className="mt-1 text-lg font-semibold text-white">{room.latency} ms</p>
              </div>
            </div>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-2">
          <div className="rounded-[40px] border border-white/10 bg-[#0A0A0A] p-8 shadow-[0_0_80px_rgba(255,255,255,0.05)] sm:p-12">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Транскрипт</p>
            <div className="mt-4 max-h-[420px] overflow-y-auto">
              <p className="text-reveal text-lg font-light leading-relaxed text-white sm:text-xl">
                {transcription || 'Ожидаем данные...'}
              </p>
            </div>
          </div>
          <div className="rounded-[40px] border border-[#00A3FF]/40 bg-[#050505] p-8 shadow-[0_0_80px_rgba(0,163,255,0.2)] sm:p-12">
            <p className="text-xs uppercase tracking-[0.2em] text-gray-500">Перевод</p>
            <div className="mt-4 max-h-[420px] overflow-y-auto">
              <p className="text-reveal text-lg font-light leading-relaxed text-blue-50/80 sm:text-xl">
                {translation || 'Перевод появится здесь...'}
              </p>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
};
