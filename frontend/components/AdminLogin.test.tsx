import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { AdminLogin } from './AdminLogin';

const renderLogin = () =>
  render(
    <MemoryRouter>
      <AdminLogin />
    </MemoryRouter>
  );

describe('AdminLogin', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
  });

  it('exposes named credential fields with autocomplete metadata', () => {
    renderLogin();

    expect(screen.getByRole('textbox', { name: 'Логин' })).toHaveAttribute(
      'autocomplete',
      'username'
    );
    expect(screen.getByLabelText('Пароль')).toHaveAttribute(
      'autocomplete',
      'current-password'
    );
  });

  it('does not submit blank credentials', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.spyOn(globalThis, 'fetch');
    renderLogin();

    await user.clear(screen.getByRole('textbox', { name: 'Логин' }));
    await user.clear(screen.getByLabelText('Пароль'));
    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('disables repeated submission while login is pending', async () => {
    const user = userEvent.setup();
    vi.spyOn(globalThis, 'fetch').mockReturnValue(new Promise(() => undefined));
    renderLogin();

    await user.click(screen.getByRole('button', { name: 'Войти' }));

    expect(screen.getByRole('button', { name: 'Вход...' })).toBeDisabled();
  });
});
