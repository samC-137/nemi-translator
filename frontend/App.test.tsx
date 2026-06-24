import { act, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import App from './App';
import { invalidateAdminSession, setAdminToken } from './services/adminAuth';

describe('admin route protection', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    window.history.pushState({}, '', '/admin');
  });

  it('returns to login when the active admin session expires', async () => {
    setAdminToken('admin-token');
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => undefined));
    render(<App />);

    expect(screen.getByText('Admin Dashboard')).toBeInTheDocument();

    await act(async () => {
      invalidateAdminSession();
    });

    expect(await screen.findByText('Admin Login')).toBeInTheDocument();
  });
});
