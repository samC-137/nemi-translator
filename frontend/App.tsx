
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Lobby } from './components/Lobby';
import { LecturerView } from './components/LecturerView';
import { ListenerView } from './components/ListenerView';
import { AdminRoomView, AdminView } from './components/AdminView';
import { AdminLogin } from './components/AdminLogin';
import { RoomSession, Language, LANGUAGES } from './types';
import { getAdminToken } from './services/adminAuth';
import { createRoom, joinRoom } from './services/roomsApi';

const LobbyRoute: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const params = new URLSearchParams(location.search);
    const roomFromUrl = params.get('room');
    if (roomFromUrl) {
      const cleaned = roomFromUrl.trim();
      if (cleaned) {
        navigate(`/room/${cleaned}/listener`, { replace: true });
      }
    }
  }, [location.search, navigate]);

  const handleCreateRoom = async (lang: Language) => {
    setError(null);
    setIsSubmitting(true);
    try {
      const session = await createRoom(lang);
      navigate(`/room/${session.id}/lecturer`, {
        state: { session }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось создать комнату');
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleJoinRoom = async (roomId: string, targetLang: Language) => {
    const cleaned = roomId.trim();
    if (!cleaned) return;
    setError(null);
    setIsSubmitting(true);
    try {
      const session = await joinRoom(cleaned, targetLang);
      navigate(`/room/${session.id}/listener`, {
        state: { session }
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Не удалось подключиться к комнате');
    } finally {
      setIsSubmitting(false);
    }
  };

  return (
    <Lobby
      error={error}
      isSubmitting={isSubmitting}
      onCreateRoom={handleCreateRoom}
      onJoinRoom={handleJoinRoom}
    />
  );
};

const LecturerRoute: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const sessionFromState = (location.state as { session?: RoomSession } | null)?.session;
  const sourceFromState = (location.state as { sourceLanguage?: Language } | null)?.sourceLanguage;
  const [session, setSession] = useState<RoomSession | null>(null);

  useEffect(() => {
    if (!id) return;
    if (sessionFromState) {
      setSession(sessionFromState);
      return;
    }
    const sourceLanguage = sourceFromState ?? LANGUAGES[0];
    setSession({
      id,
      sourceLanguage,
      targetLanguage: LANGUAGES[0],
      status: 'live'
    });
  }, [id, sessionFromState, sourceFromState]);

  if (!id) return <Navigate to="/" replace />;
  if (!session) return null;

  return (
    <LecturerView
      session={session}
      onStop={() => navigate('/')}
      onUpdateLanguage={(lang) =>
        setSession((prev) => (prev ? { ...prev, sourceLanguage: lang } : prev))
      }
    />
  );
};

const ListenerRoute: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const sessionFromState = (location.state as { session?: RoomSession } | null)?.session;
  const [session, setSession] = useState<RoomSession | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!id) return;
    let active = true;
    setError(null);
    if (sessionFromState) {
      setSession(sessionFromState);
      return;
    }
    setSession(null);
    joinRoom(id, LANGUAGES[1] ?? LANGUAGES[0])
      .then((nextSession) => {
        if (active) setSession(nextSession);
      })
      .catch((err) => {
        if (active) setError(err instanceof Error ? err.message : 'Не удалось подключиться');
      });
    return () => {
      active = false;
    };
  }, [id, sessionFromState]);

  if (!id) return <Navigate to="/" replace />;
  if (error) {
    return (
      <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6 text-white">
        <div className="w-full max-w-md rounded-3xl border border-white/10 bg-white/5 p-8 text-center">
          <h1 className="text-2xl font-semibold">Комната недоступна</h1>
          <p className="mt-3 text-sm text-gray-400">{error}</p>
          <button
            onClick={() => navigate('/')}
            className="mt-6 rounded-xl bg-blue-600 px-6 py-3 font-semibold text-white transition hover:bg-blue-500"
          >
            Вернуться на главную
          </button>
        </div>
      </div>
    );
  }
  if (!session) return null;

  return <ListenerView session={session} onExit={() => navigate('/')} />;
};

const RequireAdmin: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const location = useLocation();
  if (!getAdminToken()) {
    return <Navigate to="/admin/login" replace state={{ from: location }} />;
  }
  return <>{children}</>;
};

const App: React.FC = () => {
  return (
    <BrowserRouter>
      <div className="w-full min-h-screen">
        <Routes>
          <Route path="/" element={<LobbyRoute />} />
          <Route path="/room/:id/lecturer" element={<LecturerRoute />} />
          <Route path="/room/:id/listener" element={<ListenerRoute />} />
          <Route path="/admin/login" element={<AdminLogin />} />
          <Route
            path="/admin"
            element={
              <RequireAdmin>
                <AdminView />
              </RequireAdmin>
            }
          />
          <Route
            path="/admin/room/:id"
            element={
              <RequireAdmin>
                <AdminRoomView />
              </RequireAdmin>
            }
          />
          <Route path="*" element={<Navigate to="/" replace />} />
        </Routes>
      </div>
    </BrowserRouter>
  );
};

export default App;
