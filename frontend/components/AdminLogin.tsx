import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Logo } from './Logo';
import { getAdminToken, setAdminToken } from '../services/adminAuth';

const resolveBaseUrl = () => {
  const envBase = (import.meta as any).env?.VITE_BACKEND_URL as string | undefined;
  return (envBase || 'http://localhost:8000').replace(/\/$/, '');
};

export const AdminLogin: React.FC = () => {
  const navigate = useNavigate();
  const [username, setUsername] = useState('admin');
  const [password, setPassword] = useState('admin');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  useEffect(() => {
    if (getAdminToken()) {
      navigate('/admin', { replace: true });
    }
  }, [navigate]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setIsLoading(true);
    try {
      const response = await fetch(`${resolveBaseUrl()}/admin/login`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username, password })
      });
      if (!response.ok) {
        throw new Error('Неверные данные');
      }
      const data = await response.json();
      if (!data?.token) {
        throw new Error('Нет токена');
      }
      setAdminToken(data.token);
      navigate('/admin', { replace: true });
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Ошибка авторизации');
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <div className="min-h-screen bg-black flex flex-col items-center justify-center p-6">
      <div className="mb-10">
        <Logo size="md" />
      </div>
      <form
        onSubmit={handleSubmit}
        className="w-full max-w-md bg-white/5 border border-white/10 rounded-3xl p-8 space-y-6"
      >
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-white">Admin Login</h1>
          <p className="text-sm text-gray-400">Доступ только для администраторов</p>
        </div>
        <div className="space-y-4">
          <input
            type="text"
            value={username}
            onChange={(event) => setUsername(event.target.value)}
            placeholder="Username"
            className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500/50 focus:outline-none"
          />
          <input
            type="password"
            value={password}
            onChange={(event) => setPassword(event.target.value)}
            placeholder="Password"
            className="w-full rounded-xl border border-white/10 bg-black/50 px-4 py-3 text-white placeholder:text-gray-500 focus:border-blue-500/50 focus:outline-none"
          />
        </div>
        {error && (
          <div className="rounded-xl border border-rose-400/40 bg-rose-500/10 px-4 py-2 text-sm text-rose-200">
            {error}
          </div>
        )}
        <button
          type="submit"
          disabled={isLoading}
          className="w-full rounded-xl bg-blue-600 py-3 text-white font-semibold hover:bg-blue-500 disabled:opacity-60 disabled:cursor-not-allowed transition"
        >
          {isLoading ? 'Вход...' : 'Войти'}
        </button>
      </form>
      <button
        onClick={() => navigate('/')}
        className="mt-6 text-xs uppercase tracking-[0.3em] text-gray-500 hover:text-white transition"
      >
        Вернуться на главную
      </button>
    </div>
  );
};
