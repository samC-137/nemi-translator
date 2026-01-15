import React, { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Logo } from './Logo';
import { RealtimeClient } from '../services/realtimeClient';
import { ADMIN_ROOMS, AdminRoom, getAdminRoomById, getStatusLabel } from '../services/mockAdminRooms';
import { RoomStatus } from '../types';
import { ArrowLeft, Eye, Filter, Power, Search, Users } from 'lucide-react';
import { clearAdminToken } from '../services/adminAuth';

const statusStyles: Record<RoomStatus, { dot: string; pill: string }> = {
  live: { dot: 'bg-emerald-400', pill: 'border-emerald-400/40 text-emerald-200' },
  connecting: { dot: 'bg-yellow-300', pill: 'border-yellow-300/40 text-yellow-100' },
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

  const stats = useMemo(() => {
    const total = ADMIN_ROOMS.length;
    const live = ADMIN_ROOMS.filter((room) => room.status === 'live').length;
    const listeners = ADMIN_ROOMS.reduce((sum, room) => sum + room.listenersCount, 0);
    return { total, live, listeners };
  }, []);

  const filteredRooms = useMemo(() => {
    const normalized = query.trim().toLowerCase();
    return ADMIN_ROOMS.filter((room) => {
      const matchesQuery =
        !normalized ||
        room.id.toLowerCase().includes(normalized) ||
        room.title.toLowerCase().includes(normalized);
      const matchesStatus = statusFilter === 'all' || room.status === statusFilter;
      return matchesQuery && matchesStatus;
    });
  }, [query, statusFilter]);

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
            {(['all', 'live', 'connecting', 'stopped'] as const).map((status) => (
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
          {filteredRooms.length === 0 && (
            <div className="rounded-3xl border border-white/10 bg-white/5 px-6 py-10 text-center text-sm text-gray-400">
              Комнат с такими параметрами не найдено.
            </div>
          )}
          {filteredRooms.map((room) => (
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
  const room = id ? getAdminRoomById(id) : undefined;
  const [transcription, setTranscription] = useState('');
  const [translation, setTranslation] = useState('');
  const [streamStatus, setStreamStatus] = useState<RoomStatus>('connecting');
  const [actionMessage, setActionMessage] = useState<string | null>(null);
  const clientRef = useRef<RealtimeClient | null>(null);

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
  }, [room]);

  const handleAction = (label: string) => {
    setActionMessage(`Действие "${label}" отправлено (мок)`);
    window.setTimeout(() => setActionMessage(null), 1800);
  };

  if (!room) {
    return (
      <div className="min-h-screen bg-transparent px-6 py-12 text-white">
        <div className="mx-auto max-w-4xl rounded-3xl border border-white/10 bg-white/5 p-10 text-center">
          <p className="text-lg font-semibold">Комната не найдена</p>
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
              onClick={() => handleAction('Остановить комнату')}
              className="rounded-full border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-rose-200 transition hover:border-rose-400/70"
            >
              Остановить комнату
            </button>
            <button
              onClick={() => handleAction('Сброс слушателей')}
              className="rounded-full border border-white/10 bg-white/5 px-4 py-2 text-xs font-semibold uppercase tracking-[0.2em] text-gray-200 transition hover:border-white/30"
            >
              Сброс слушателей
            </button>
            <button
              onClick={() => handleAction('Перезапустить поток')}
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
