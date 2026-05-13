import { spawn } from 'node:child_process';
import fs from 'node:fs/promises';
import http from 'node:http';
import os from 'node:os';
import path from 'node:path';

const FRONTEND_URL = process.env.FRONTEND_URL || 'http://127.0.0.1:4173/';
const BACKEND_URL = (process.env.BACKEND_URL || 'http://127.0.0.1:8000').replace(/\/$/, '');
const CHROME_PATH =
  process.env.CHROME_PATH || '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const DEBUG_PORT = Number(process.env.CHROME_DEBUG_PORT || 9223);

const profile = path.join(os.tmpdir(), `nemi-chrome-e2e-${Date.now()}`);
const chrome = spawn(
  CHROME_PATH,
  [
    `--remote-debugging-port=${DEBUG_PORT}`,
    `--user-data-dir=${profile}`,
    '--no-first-run',
    '--no-default-browser-check',
    '--use-fake-device-for-media-stream',
    '--use-fake-ui-for-media-stream',
    '--autoplay-policy=no-user-gesture-required',
    FRONTEND_URL,
  ],
  { stdio: 'ignore' },
);

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

const getJson = (url) =>
  new Promise((resolve, reject) => {
    http
      .get(url, (response) => {
        let data = '';
        response.on('data', (chunk) => {
          data += chunk;
        });
        response.on('end', () => {
          try {
            resolve(JSON.parse(data));
          } catch (error) {
            reject(error);
          }
        });
      })
      .on('error', reject);
  });

const waitForTab = async () => {
  for (let i = 0; i < 80; i += 1) {
    try {
      const tabs = await getJson(`http://127.0.0.1:${DEBUG_PORT}/json`);
      const tab = tabs.find((item) => item.type === 'page' && item.webSocketDebuggerUrl);
      if (tab) return tab;
    } catch {
      // Chrome is still starting.
    }
    await sleep(250);
  }
  throw new Error('Chrome CDP did not start');
};

const connect = (wsUrl) => {
  const ws = new WebSocket(wsUrl);
  let id = 0;
  const pending = new Map();
  ws.onmessage = (event) => {
    const message = JSON.parse(event.data);
    if (!message.id || !pending.has(message.id)) return;
    const { resolve, reject } = pending.get(message.id);
    pending.delete(message.id);
    if (message.error) {
      reject(new Error(JSON.stringify(message.error)));
    } else {
      resolve(message.result);
    }
  };
  return new Promise((resolve, reject) => {
    ws.onopen = () =>
      resolve({
        send(method, params = {}) {
          const callId = ++id;
          ws.send(JSON.stringify({ id: callId, method, params }));
          return new Promise((resolve, reject) =>
            pending.set(callId, { resolve, reject }),
          );
        },
        close() {
          ws.close();
        },
      });
    ws.onerror = reject;
  });
};

const evalExpr = async (cdp, expression) => {
  const result = await cdp.send('Runtime.evaluate', {
    expression,
    awaitPromise: true,
    returnByValue: true,
  });
  if (result.exceptionDetails) {
    throw new Error(JSON.stringify(result.exceptionDetails));
  }
  return result.result?.value;
};

const waitEval = async (cdp, expression, timeoutMs = 15000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    const value = await evalExpr(cdp, expression).catch(() => undefined);
    if (value) return value;
    await sleep(250);
  }
  throw new Error(`Timed out waiting for ${expression}`);
};

const postJson = async (path, payload) => {
  const response = await fetch(`${BACKEND_URL}${path}`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  if (!response.ok) throw new Error(`${path} failed: ${response.status}`);
  return response.json();
};

const getAdminRoom = async (roomId) => {
  const admin = await postJson('/admin/login', { username: 'admin', password: 'admin' });
  const response = await fetch(`${BACKEND_URL}/admin/rooms/${roomId}`, {
    headers: { Authorization: `Bearer ${admin.token}` },
  });
  if (!response.ok) throw new Error(`admin room failed: ${response.status}`);
  return response.json();
};

try {
  const tab = await waitForTab();
  const cdp = await connect(tab.webSocketDebuggerUrl);
  await cdp.send('Runtime.enable');
  await cdp.send('Page.enable');

  await waitEval(cdp, "document.readyState === 'complete' || document.readyState === 'interactive'");
  await waitEval(
    cdp,
    "Array.from(document.querySelectorAll('button')).some((button) => button.innerText.includes('Create Room'))",
  );
  await evalExpr(
    cdp,
    "Array.from(document.querySelectorAll('button')).find((button) => button.innerText.includes('Create Room'))?.click(); true",
  );
  await waitEval(
    cdp,
    "Array.from(document.querySelectorAll('button')).filter((button) => button.innerText.trim() === 'Create Room').length === 1",
  );
  await evalExpr(
    cdp,
    "Array.from(document.querySelectorAll('button')).find((button) => button.innerText.trim() === 'Create Room')?.click(); true",
  );

  const roomUrl = await waitEval(cdp, "location.href.includes('/lecturer') && location.href");
  const roomId = roomUrl.match(/room\/(NEMI-\d+)\/lecturer/)?.[1];
  if (!roomId) throw new Error(`Cannot parse room id from ${roomUrl}`);

  await waitEval(
    cdp,
    "Array.from(document.querySelectorAll('button')).some((button) => (button.getAttribute('aria-label') || '').includes('Запустить сессию'))",
  );
  await evalExpr(
    cdp,
    "Array.from(document.querySelectorAll('button')).find((button) => (button.getAttribute('aria-label') || '').includes('Запустить сессию'))?.click(); true",
  );
  await sleep(700);
  await evalExpr(
    cdp,
    "Array.from(document.querySelectorAll('button')).find((button) => (button.getAttribute('aria-label') || '').includes('Включить микрофон'))?.click(); true",
  );
  await sleep(3500);

  const body = await evalExpr(cdp, 'document.body.innerText');
  const room = await getAdminRoom(roomId);
  if (room.status !== 'live') {
    throw new Error(`Expected room status live, got ${room.status}`);
  }

  await cdp.send('Browser.close').catch(() => {});
  cdp.close();
  chrome.kill('SIGTERM');
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});

  console.log(
    JSON.stringify(
      {
        status: 'ok',
        roomId,
        roomUrl,
        roomStatus: room.status,
        latency: room.latency,
        uiHasConnected: body.includes('Подключено') || body.includes('Подключение'),
      },
      null,
      2,
    ),
  );
} catch (error) {
  chrome.kill('SIGTERM');
  await fs.rm(profile, { recursive: true, force: true }).catch(() => {});
  throw error;
}
