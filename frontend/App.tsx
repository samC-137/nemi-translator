
import React, { useEffect, useState } from 'react';
import { BrowserRouter, Routes, Route, Navigate, useLocation, useNavigate, useParams } from 'react-router-dom';
import { Lobby } from './components/Lobby';
import { LecturerView } from './components/LecturerView';
import { ListenerView } from './components/ListenerView';
import { AdminRoomView, AdminView } from './components/AdminView';
import { AdminLogin } from './components/AdminLogin';
import { RoomSession, Language, LANGUAGES } from './types';
import { getAdminToken } from './services/adminAuth';

const createRoomId = () => `NEMI-${Math.floor(1000 + Math.random() * 9000)}`;

const createMockSessionFromRoomId = (roomId: string): RoomSession => {
  const isMockRussian = roomId.length % 2 === 0;
  const sourceLanguage = isMockRussian ? LANGUAGES[1] : LANGUAGES[0];
  const targetLanguage = isMockRussian ? LANGUAGES[0] : LANGUAGES[1];

  return {
    id: roomId,
    sourceLanguage,
    targetLanguage,
    status: 'live'
  };
};

const LobbyRoute: React.FC = () => {
  const navigate = useNavigate();
  const location = useLocation();

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

  const handleCreateRoom = (lang: Language) => {
    const roomId = createRoomId();
    navigate(`/room/${roomId}/lecturer`, {
      state: { sourceLanguage: lang }
    });
  };

  const handleJoinRoom = (roomId: string) => {
    const cleaned = roomId.trim();
    if (!cleaned) return;
    navigate(`/room/${cleaned}/listener`);
  };

  return <Lobby onCreateRoom={handleCreateRoom} onJoinRoom={handleJoinRoom} />;
};

const LecturerRoute: React.FC = () => {
  const { id } = useParams();
  const navigate = useNavigate();
  const location = useLocation();
  const sourceFromState = (location.state as { sourceLanguage?: Language } | null)?.sourceLanguage;
  const [session, setSession] = useState<RoomSession | null>(null);

  useEffect(() => {
    if (!id) return;
    const sourceLanguage = sourceFromState ?? LANGUAGES[0];
    setSession({
      id,
      sourceLanguage,
      targetLanguage: LANGUAGES[0],
      status: 'live'
    });
  }, [id, sourceFromState]);

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

  useEffect(() => {
    if (!id) return;
    if (sessionFromState) {
      setSession(sessionFromState);
      return;
    }
    setSession(createMockSessionFromRoomId(id));
  }, [id, sessionFromState]);

  if (!id) return <Navigate to="/" replace />;
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
