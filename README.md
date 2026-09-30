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

`render.yaml` creates the web service, a PostgreSQL database and a 1 GB disk for uploads.
In Render: **New → Blueprint** → select this repository. When asked, enter `ADMIN_NAME`, `ADMIN_EMAIL`
and `ADMIN_PASSWORD` (min 8 characters) — the first admin account is created from these on first start.
`JWT_SECRET` is generated automatically. After signing in, add your team under Settings → Users.

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
- **Voice task creation** — the browser's speech recognition (Chrome/Edge/Android; `en-IN` or `ta-IN`) produces a transcript; `POST /api/voice/parse` turns Tamil / English / Tanglish into fields using the live list of sections, users and past items. The user always confirms and can edit before the task is created. Typing the sentence works as a fallback on browsers without speech recognition.
  - Parser: `server/src/voice/parser.ts` (rule-based, handles `Maintenance-ku`, `rendu`, `urgent-ah`, `venum`, Tamil script, units like `10 meter`, `5kg`). Tests: `npm test`.
  - The speech provider is abstracted in `web/src/lib/speech.ts`; the parser sits behind a `PurchaseParser` interface — either can be replaced (e.g. a server-side STT service or an LLM parser) without UI changes.
- **Conversation per task** — text messages, voice notes (Opus ~24 kbps, max 3 min) and attachments, in time order.
- **Close** — confirmation in the task panel; from lists, the checkbox closes after a 4-second Undo window. Closed by / date / time are recorded. Admins can reopen.
- **Activity history** — every create, assign, edit, message, file, close and reopen is logged.
- **Notifications** — assignment, your request closed/reopened, urgent tasks in your sections, new messages on tasks you are involved in.

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
GET    /api/tasks?view=&status=&section=&assignee=&priority=&createdBy=&q=&createdFrom=&createdTo=&dueFrom=&dueTo=&closedFrom=&closedTo=&due=&page=&pageSize=
POST   /api/tasks          GET|PATCH|DELETE /api/tasks/:id
POST   /api/tasks/:id/close | /reopen
GET    /api/tasks/:id/thread | /comments | /activity
POST   /api/tasks/:id/comments | /voice | /attachments     DELETE /api/tasks/:id/attachments/:attachmentId
GET    /api/sections       POST /api/sections   PATCH /api/sections/:id   POST /api/sections/reorder
GET    /api/users          POST /api/users      PATCH /api/users/:id
GET    /api/dashboard      GET /api/activity    GET /api/notifications   POST /api/notifications/read
POST   /api/voice/parse    GET /api/files/attachments/:id | /api/files/voice/:id    GET /api/events (SSE)
```

## Keyboard shortcuts

`Q`/`N` add purchase · `V` create with voice · `/` search · `Ctrl+Enter` save form · `Esc` close panel/dialog
