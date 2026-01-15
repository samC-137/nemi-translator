const DEFAULT_LISTENER_DELAY_MS = 500;

export const getListenerDelayMs = () => {
  const raw = (import.meta as any).env?.VITE_LISTENER_DELAY_MS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed) || parsed < 0) {
    return DEFAULT_LISTENER_DELAY_MS;
  }
  return parsed;
};
