import { chromium } from 'playwright';

const FRONTEND_URL = (process.env.FRONTEND_URL || 'http://127.0.0.1:4173').replace(/\/$/, '');
const BACKEND_URL = (process.env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');

const postJson = async (path, payload) => {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload)
  });
  if (!response.ok) {
    throw new Error(`${path} failed with ${response.status}`);
  }
  return response.json();
};

const acceptNextDialog = (page) => {
  page.once('dialog', async (dialog) => dialog.accept());
};

const main = async () => {
  const room = await postJson('/rooms', {
    sourceLanguage: { code: 'en-US', name: 'English' },
    targetLanguage: { code: 'ru-RU', name: 'Russian' }
  });
  const roomId = room.roomId;
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });

  try {
    await page.goto(`${FRONTEND_URL}/admin`, { waitUntil: 'networkidle' });
    await page.waitForURL('**/admin/login');

    await page.getByLabel('Логин').fill('admin');
    await page.getByLabel('Пароль').fill('admin');
    await page.getByRole('button', { name: 'Войти' }).click();
    await page.waitForURL('**/admin');

    await page.getByText(`Комната ${roomId}`, { exact: true }).waitFor({ timeout: 10000 });
    await page.getByPlaceholder('Поиск по ID или названию').fill(roomId);

    const roomRow = page
      .getByText(`Комната ${roomId}`, { exact: true })
      .locator('xpath=ancestor::div[contains(@class,"grid")][1]');
    await roomRow.getByRole('button', { name: 'Открыть' }).click();
    await page.waitForURL(`**/admin/room/${roomId}`);

    acceptNextDialog(page);
    await page.getByRole('button', { name: 'Перезапустить поток' }).click();
    await page.getByRole('status').filter({ hasText: 'Перезапустить поток' }).waitFor();

    acceptNextDialog(page);
    await page.getByRole('button', { name: 'Сброс слушателей' }).click();
    await page.getByRole('status').filter({ hasText: 'Сброс слушателей' }).waitFor();

    acceptNextDialog(page);
    await page.getByRole('button', { name: 'Остановить комнату' }).click();
    await page.getByText('Stopped', { exact: true }).waitFor();

    await page.getByRole('button', { name: 'Назад к списку' }).click();
    await page.waitForURL('**/admin');
    await page.getByRole('button', { name: 'Logout' }).click();
    await page.waitForURL('**/admin/login');

    console.log(JSON.stringify({ status: 'ok', roomId, scenario: 'admin-browser' }));
  } catch (error) {
    await page.screenshot({ path: '/tmp/nemi-admin-smoke.png', fullPage: true });
    throw error;
  } finally {
    await browser.close();
  }
};

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
