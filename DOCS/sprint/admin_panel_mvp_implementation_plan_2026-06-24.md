# Admin Panel MVP Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver a tested, backend-driven and running administrative panel for the NEMI Translator diploma MVP.

**Architecture:** Preserve the existing FastAPI REST/WebSocket contracts and React routes. Harden the frontend API/session boundary, add deterministic dashboard polling and working room actions, then prove the complete workflow with component, REST and browser smoke tests.

**Tech Stack:** React 19, TypeScript, Vite, Tailwind CSS, FastAPI, WebSocket, Vitest, Testing Library, Playwright, Docker Compose.

---

## File map

- Modify `frontend/package.json` and `frontend/package-lock.json`: test and browser-smoke dependencies/scripts.
- Modify `frontend/vite.config.ts`: Vitest jsdom configuration.
- Create `frontend/test/setup.ts`: DOM cleanup and browser API shims.
- Create `frontend/services/adminApi.test.ts`: REST mapping and unauthorized-session tests.
- Create `frontend/components/AdminLogin.test.tsx`: login accessibility and behavior tests.
- Create `frontend/components/AdminView.test.tsx`: dashboard polling/actions and room-detail tests.
- Modify `frontend/services/adminApi.ts`: typed API errors and unauthorized-session notification.
- Modify `frontend/services/adminAuth.ts`: centralized session clearing/event contract.
- Modify `frontend/components/AdminLogin.tsx`: accessible, validated login form.
- Modify `frontend/App.tsx`: reactive protection for expired admin sessions.
- Modify `frontend/components/AdminView.tsx`: polling, action states, confirmations and realtime metrics.
- Modify `backend/app/scripts/smoke_rest.py`: cover system status and every admin action.
- Create `frontend/scripts/smoke_admin_e2e.mjs`: executable browser acceptance scenario.
- Modify `DOCS/sprint/browser_acceptance_checklist.md`: document automated admin check.
- Create `DOCS/sprint/admin_panel_verification_2026-06-24.md`: final reproducible evidence.

### Task 1: Frontend test foundation

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Modify: `frontend/vite.config.ts`
- Create: `frontend/test/setup.ts`
- Create: `frontend/services/adminApi.test.ts`

- [ ] **Step 1: Install the test dependencies**

Run:

```bash
cd frontend
npm install --save-dev vitest jsdom @testing-library/react @testing-library/jest-dom @testing-library/user-event
```

Expected: dependencies are recorded in `package.json` and the lockfile.

- [ ] **Step 2: Add test configuration and setup**

Add a `test` script running `vitest run`, configure `test.environment = 'jsdom'` and `setupFiles = './test/setup.ts'`, and initialize jest-dom plus cleanup:

```ts
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

afterEach(() => cleanup());
```

- [ ] **Step 3: Write and run a mapping test**

Mock `fetch`, store a token and assert that `fetchAdminRooms()` sends the bearer header and converts `roomId`, languages and timestamps into `AdminRoom`.

Run: `cd frontend && npm test -- services/adminApi.test.ts`

Expected: PASS with the existing API client.

- [ ] **Step 4: Run build and commit**

Run: `cd frontend && npm run build`

Expected: Vite exits 0.

Commit:

```bash
git add frontend/package.json frontend/package-lock.json frontend/vite.config.ts frontend/test/setup.ts frontend/services/adminApi.test.ts
git commit -m "test: add frontend admin test foundation"
```

### Task 2: Reliable admin authentication lifecycle

**Files:**
- Modify: `frontend/services/adminAuth.ts`
- Modify: `frontend/services/adminApi.ts`
- Modify: `frontend/App.tsx`
- Modify: `frontend/components/AdminLogin.tsx`
- Modify: `frontend/services/adminApi.test.ts`
- Create: `frontend/components/AdminLogin.test.tsx`

- [ ] **Step 1: Write failing authentication tests**

Test that a 401 response clears `nemi_admin_token` and emits a single `nemi:admin-unauthorized` event. Test that the login form exposes named username/password fields, rejects blank input and disables submit while awaiting the server.

Run: `cd frontend && npm test -- services/adminApi.test.ts components/AdminLogin.test.tsx`

Expected: FAIL because unauthorized notification and accessible labels do not exist.

- [ ] **Step 2: Implement the session event boundary**

Export the event name and helper from `adminAuth.ts`:

```ts
export const ADMIN_UNAUTHORIZED_EVENT = 'nemi:admin-unauthorized';

export const invalidateAdminSession = () => {
  clearAdminToken();
  window.dispatchEvent(new Event(ADMIN_UNAUTHORIZED_EVENT));
};
```

Call it for 401/403 in `requestJson`. Make `RequireAdmin` subscribe to this event and redirect to `/admin/login`.

- [ ] **Step 3: Harden the login form**

Add `<label>` elements, `name`, `autoComplete`, `required`, visible `focus-visible` styles and blank-field validation. Keep the default dev credentials for the diploma demo.

- [ ] **Step 4: Run tests/build and commit**

Run:

```bash
cd frontend
npm test -- services/adminApi.test.ts components/AdminLogin.test.tsx
npm run build
```

Expected: all tests PASS and build exits 0.

Commit: `git commit -m "fix: harden admin authentication lifecycle"` with only the files from this task.

### Task 3: Live dashboard polling and resilient status loading

**Files:**
- Modify: `frontend/components/AdminView.tsx`
- Create: `frontend/components/AdminView.test.tsx`

- [ ] **Step 1: Write failing dashboard tests**

Mock `adminApi`, render `AdminView` in `MemoryRouter`, and verify:

```ts
expect(await screen.findByText('Комната NEMI-1001')).toBeInTheDocument();
await vi.advanceTimersByTimeAsync(2000);
expect(fetchAdminRooms).toHaveBeenCalledTimes(2);
```

Also reject the system-status request while resolving rooms and assert the room remains visible with a scoped status error.

- [ ] **Step 2: Implement non-blocking polling**

Separate room and system-status errors, load both with independent `Promise` branches, and install a two-second interval. Only the initial room request uses the full loading state; polling does not flash the page. Clear the interval on unmount.

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && npm test -- components/AdminView.test.tsx && npm run build`

Expected: tests PASS and build exits 0.

Commit: `git commit -m "feat: add live admin dashboard polling"`.

### Task 4: Working dashboard room controls

**Files:**
- Modify: `frontend/components/AdminView.tsx`
- Modify: `frontend/components/AdminView.test.tsx`

- [ ] **Step 1: Write the failing Stop-action test**

Render a live room, click its Stop button, accept the confirmation, and assert:

```ts
expect(stopAdminRoom).toHaveBeenCalledWith('NEMI-1001');
expect(fetchAdminRooms).toHaveBeenCalledTimes(2);
```

Verify cancellation does not call the endpoint and the button is disabled while the action promise is pending.

- [ ] **Step 2: Implement row action state**

Pass `onStop` and `isStopping` into `AdminRoomRow`. Confirm the destructive action, call the endpoint once, refresh rooms and expose the result through a live status message.

- [ ] **Step 3: Verify and commit**

Run: `cd frontend && npm test -- components/AdminView.test.tsx && npm run build`

Expected: tests PASS and build exits 0.

Commit: `git commit -m "feat: connect dashboard room controls"`.

### Task 5: Realtime room details and safe actions

**Files:**
- Modify: `frontend/components/AdminView.tsx`
- Modify: `frontend/components/AdminView.test.tsx`

- [ ] **Step 1: Write failing room-detail tests**

Mock `RealtimeClient`, render `/admin/room/NEMI-1001`, invoke captured `onListenerCount` and `onStatus` handlers, and assert the visible count/status changes. Test confirmation, pending disable and REST refresh for Stop, Reset listeners and Restart.

- [ ] **Step 2: Implement realtime state updates**

Handle `room:listenerCount`, update both `room.status` and `streamStatus` from `room:status`, show WebSocket errors separately, and refresh the REST snapshot after actions. Track one pending action at a time and clear action-message timers on unmount.

- [ ] **Step 3: Add accessible operation feedback**

Use `role="status"` for success, `role="alert"` for failures, `focus-visible` styling and disabled styles for all action buttons.

- [ ] **Step 4: Verify and commit**

Run: `cd frontend && npm test -- components/AdminView.test.tsx && npm run build`

Expected: tests PASS and build exits 0.

Commit: `git commit -m "feat: complete admin room monitoring"`.

### Task 6: Complete REST admin smoke coverage

**Files:**
- Modify: `backend/app/scripts/smoke_rest.py`

- [ ] **Step 1: Extend smoke assertions**

After login and room creation, assert `/admin/system/status` fields and execute actions in deterministic order:

```python
_, restarted = request(f"/admin/rooms/{room_id}/restart", method="POST", token=token)
assert restarted["status"] == "connecting"
_, reset = request(f"/admin/rooms/{room_id}/reset-listeners", method="POST", token=token)
assert reset["removed"] == 0
_, stopped = request(f"/admin/rooms/{room_id}/stop", method="POST", token=token)
assert stopped["status"] == "stopped"
```

- [ ] **Step 2: Run the smoke script against the backend**

Run: `docker compose exec backend python app/scripts/smoke_rest.py http://127.0.0.1:8000`

Expected: JSON containing `"status": "ok"`.

- [ ] **Step 3: Commit**

Commit: `git commit -m "test: cover admin lifecycle in REST smoke"`.

### Task 7: Automated browser acceptance smoke

**Files:**
- Modify: `frontend/package.json`
- Modify: `frontend/package-lock.json`
- Create: `frontend/scripts/smoke_admin_e2e.mjs`
- Modify: `DOCS/sprint/browser_acceptance_checklist.md`

- [ ] **Step 1: Install Playwright and add the script**

Run: `cd frontend && npm install --save-dev playwright`

Add `"smoke:admin": "node scripts/smoke_admin_e2e.mjs"`.

- [ ] **Step 2: Implement the browser scenario**

The script must create a room through REST, open `/admin`, verify redirect, log in, wait for the real room ID, filter it, open details, confirm Restart and Stop dialogs, verify statuses, log out and print JSON status. Capture a screenshot to `/tmp/nemi-admin-smoke.png` only on failure.

- [ ] **Step 3: Run and document it**

Run: `cd frontend && npm run smoke:admin`

Expected: `{"status":"ok","roomId":"NEMI-..."}`.

Document this command in the acceptance checklist.

- [ ] **Step 4: Commit**

Commit: `git commit -m "test: add admin browser smoke scenario"`.

### Task 8: Final verification and running handoff

**Files:**
- Create: `DOCS/sprint/admin_panel_verification_2026-06-24.md`

- [ ] **Step 1: Run all static and component checks**

Run:

```bash
cd frontend
npm test
npm run build
cd ../backend
python3 -m compileall app
```

Expected: all commands exit 0.

- [ ] **Step 2: Rebuild and start the application**

Run: `docker compose up --build -d`

Expected: backend and frontend containers are Up.

- [ ] **Step 3: Run runtime checks**

Run:

```bash
curl --fail http://127.0.0.1:8000/health
docker compose exec backend python app/scripts/smoke_rest.py http://127.0.0.1:8000
cd frontend && npm run smoke:admin
```

Expected: health and both smoke checks report success.

- [ ] **Step 4: Record evidence and commit**

Record commit IDs, commands, results, URLs and development credentials in the verification report. Do not include secrets beyond the documented dev-only `admin/admin` pair.

Commit: `git commit -m "docs: record admin panel verification"`.

- [ ] **Step 5: Completion audit**

Confirm `git status --short` contains only pre-existing `.current_presentation_workspace` and `outputs/`, `docker compose ps` reports both services running, and `git log` contains one commit for every task.
