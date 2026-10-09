# JPM Purchase Task Manager

Internal web app that replaces purchase requests sent over WhatsApp groups with trackable purchase tasks:

**Request → Section → Assigned person → Pending → Purchased → Closed**

Not a billing, invoice or ERP system.

## Quick start (development)

Requires Node.js 20+.

```bash
npm install
npm run dev          # API on :4000 + web app on http://localhost:5173
# or separately: npm run dev:server / npm run dev:web
```

Demo accounts (password `Jpm@12345`): `pradeep@jpm.local` (admin), `ashok@jpm.local`, `kumar@jpm.local`, `ravi@jpm.local`.

Without `DATABASE_URL`, the server uses **PGlite** — real PostgreSQL compiled to WebAssembly, stored in `server/data/pglite`. Only one server process may use that folder at a time (the server refuses to start if another holds it). To reset demo data, stop the server and delete `server/data/`.

## Deploy on Render

Easiest: **New → Blueprint** → select this repository (`render.yaml` creates the app and a PostgreSQL database).

A plain **Web Service** also works — Build: `npm ci --include=dev && npm run build`, Start: `npm start`. Nothing else is required:

- On first visit the app shows **Set up JPM Purchase** to create the admin account (only while no users exist).
- The session secret is generated and stored in the database if `JWT_SECRET` is not set.
- Add `DATABASE_URL` (a Render PostgreSQL *Internal Database URL*) so data is kept permanently — without it the admin sees a "Data is temporary" warning, because free instances lose local files on every restart.
- Optional: `FIREBASE_VAPID_KEY` + `FIREBASE_SERVICE_ACCOUNT` for push alerts.

## Production (any Node host)

```bash
npm run build
NODE_ENV=production JWT_SECRET=... DATABASE_URL=postgres://... npm start
```

The server serves the built web app and the API from one port. See `server/.env.example` for all settings. Put it behind HTTPS (cookies are `Secure` in production).

## Stack

| Layer | Choice |
|---|---|
| Web | React 19, TypeScript, Vite, Tailwind CSS 4, TanStack Query, lucide icons |
| API | Node.js, Express 5, TypeScript, Zod validation |
| Database | PostgreSQL via Drizzle ORM (node-postgres in production, PGlite embedded) |
| Auth | bcrypt password hashes, JWT in an httpOnly SameSite cookie |
| Real-time | Server-Sent Events (`/api/events`) |

## How it works

- **Tasks** — item, quantity + unit, optional section and assignee, priority (Normal / High / Urgent), due date, description. Status is only `pending` or `completed`.
- **Inbox** — pending tasks missing a section or an assignee (triage queue).
- **Structures** — an admin-defined hierarchy of any depth (`task_structures`, self-referencing `parent_id`) that gives a task its context, e.g. a machine and its parts. Nothing is hardcoded: admins build it in **Settings → Structures**, and can also add one inline while creating a task. A task stores its deepest selected structure; the path above it is shown separately from the title. Optional on every task.
- **Actions** — admin-managed list (Purchase, Repair, Replacement, … seeded by migration `0001`) in **Settings → Actions**. The first active action is the default for new tasks. Structures and actions are disabled rather than deleted once tasks use them; changes are recorded in the activity log.
- **Voice task creation** — the browser's speech recognition (Chrome/Edge/Android; `en-IN` or `ta-IN`) produces a transcript; `POST /api/voice/parse` turns Tamil / English / Tanglish into fields using the live list of sections, users and past items. The user always confirms and can edit before the task is created. Typing the sentence works as a fallback on browsers without speech recognition.
  - Parser: `server/src/voice/parser.ts` (rule-based, handles `Maintenance-ku`, `rendu`, `urgent-ah`, `venum`, Tamil script, units like `10 meter`, `5kg`). Tests: `npm test`.
  - The speech provider is abstracted in `web/src/lib/speech.ts`; the parser sits behind a `PurchaseParser` interface — either can be replaced (e.g. a server-side STT service or an LLM parser) without UI changes.
- **Conversation per task** — text messages, voice notes (Opus ~24 kbps, max 3 min) and attachments, in time order.
- **Close** — confirmation in the task panel; from lists, the checkbox closes after a 4-second Undo window. Closed by / date / time are recorded. Admins can reopen.
- **Activity history** — every create, assign, edit, message, file, close and reopen is logged.
- **Notifications** — assignment, your request closed/reopened, urgent tasks in your sections, new messages on tasks you are involved in.
- **Assignment alerts & acknowledgement** — assigning a task alerts the assignee instantly over SSE: an in-app alert card (task, structure, action, priority, assigned by, due date) with *Open task* / *Acknowledge*, a synthesized chime (normal: soft, high: two-tone, urgent: three stronger pulses — never looped), and a browser notification when the tab is in the background (users enable it from the prompt or Settings → Alerts). Sound plays only once the browser allows audio (after the first click). The assignee acknowledges, then optionally *Start work*; the stage (Awaiting acknowledgement → Acknowledged → In progress → Completed) is derived from timestamps, so the existing `pending`/`completed` status is unchanged. Reassignment resets acknowledgement, clears the previous assignee's alerts and alerts the new one.
- **Push alerts (Firebase Cloud Messaging)** — with `FIREBASE_VAPID_KEY` and `FIREBASE_SERVICE_ACCOUNT` set on the server, every alert above is also pushed to each user's registered phones/browsers, so it arrives in the notification bar even when the app is closed (Android; iPhone needs the app installed to the Home Screen, iOS 16.4+). Devices register when the user turns alerts on and unregister on sign-out; dead tokens are removed automatically. When the app is open and in front, the in-app alert is used instead of a duplicate notification.
- **Installable app (PWA)** — manifest, icons and service worker: install from Chrome (Android/desktop) or Safari → Share → Add to Home Screen. Opens full screen, app shell cached for instant start, `/api` never cached.
- **Reminders (server-side)** — urgent tasks not acknowledged are reminded every `URGENT_REMINDER_MINUTES` (default 10) up to `URGENT_REMINDER_MAX` times (default 6); assignees get one "due today" reminder and assignee + creator one "overdue" reminder per due date. Reminders are claimed atomically, so several server instances never duplicate them. A closed browser cannot ring: alerts arrive when the app is next open. Web Push (service worker + VAPID) would plug into `notify()` in `server/src/lib/activity.ts`, the single delivery point.

## Permissions

All rules live in `server/src/lib/permissions.ts`.

| | Admin | Member |
|---|---|---|
| See tasks | All | Created by them, assigned to them, or in their sections |
| Create, comment, voice note, attach | ✓ | ✓ (on visible tasks) |
| Edit / reassign | ✓ | Only tasks they created, while pending |
| Close | ✓ | Only tasks assigned to them |
| Reopen, delete tasks | ✓ | — |
| Delete attachment | ✓ | Only files they uploaded |
| Manage sections and users | ✓ | — |

Section membership is set per user in **Settings → Users**. Tasks a user cannot see return 404 (IDs cannot be probed).

## Security notes

- State-changing requests require the `X-JPM-Client` header (CSRF protection alongside SameSite cookies).
- Uploads are checked by file content (magic bytes), not the name or browser-supplied type; max 10 MB (voice 5 MB). Allowed: images, PDF, Word, Excel, PowerPoint, TXT, CSV.
- Files are stored under random names outside the web root and served only after a task access check, with `nosniff` and a sandboxing CSP.
- Login is rate limited. Error responses never include internal details.

## API

All responses are `{ data, meta? }` or `{ error: { code, message, fields? } }`.

```
POST   /api/auth/login | /api/auth/logout      GET|PATCH /api/auth/me
GET    /api/tasks?view=&status=&stage=&section=&structure=&action=&assignee=&priority=&createdBy=&q=&createdFrom=&createdTo=&dueFrom=&dueTo=&closedFrom=&closedTo=&due=&page=&pageSize=
POST   /api/tasks          GET|PATCH|DELETE /api/tasks/:id
POST   /api/tasks/:id/close | /reopen | /acknowledge | /start
GET    /api/tasks/:id/thread | /comments | /activity
POST   /api/tasks/:id/comments | /voice | /attachments     DELETE /api/tasks/:id/attachments/:attachmentId
GET    /api/sections       POST /api/sections   PATCH /api/sections/:id   POST /api/sections/reorder
GET    /api/users          POST /api/users      PATCH /api/users/:id
GET    /api/structures     POST /api/structures PATCH|DELETE /api/structures/:id   POST /api/structures/reorder
GET    /api/actions        POST /api/actions    PATCH|DELETE /api/actions/:id      POST /api/actions/reorder
GET    /api/dashboard      GET /api/activity    GET /api/notifications   POST /api/notifications/read
GET    /api/push/config    POST /api/push/subscribe | /api/push/unsubscribe
POST   /api/voice/parse    GET /api/files/attachments/:id | /api/files/voice/:id    GET /api/events (SSE)
```

## Keyboard shortcuts

`Q`/`N` add purchase · `V` create with voice · `/` search · `Ctrl+Enter` save form · `Esc` close panel/dialog
