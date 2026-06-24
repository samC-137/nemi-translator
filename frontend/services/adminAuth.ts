const STORAGE_KEY = 'nemi_admin_token';
export const ADMIN_UNAUTHORIZED_EVENT = 'nemi:admin-unauthorized';

export const getAdminToken = () => {
  if (typeof window === 'undefined') return null;
  return window.localStorage.getItem(STORAGE_KEY);
};

export const setAdminToken = (token: string) => {
  if (typeof window === 'undefined') return;
  window.localStorage.setItem(STORAGE_KEY, token);
};

export const clearAdminToken = () => {
  if (typeof window === 'undefined') return;
  window.localStorage.removeItem(STORAGE_KEY);
};

export const invalidateAdminSession = () => {
  if (typeof window === 'undefined') return;
  clearAdminToken();
  window.dispatchEvent(new Event(ADMIN_UNAUTHORIZED_EVENT));
};
