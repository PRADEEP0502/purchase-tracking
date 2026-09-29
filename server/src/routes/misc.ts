import { Router } from 'express';
import fs from 'node:fs';
import { z } from 'zod';
import { and, desc, eq, inArray, isNull, sql } from 'drizzle-orm';
import { db, schema } from '../db/client.js';
import { parse, idParam, notFound } from '../lib/http.js';
import { visibleTasksCondition, loadVisibleTask } from '../lib/permissions.js';
import { addClient } from '../lib/events.js';
import { filePath } from '../lib/storage.js';
import { todayISO } from '../lib/dates.js';
import { ruleBasedParser } from '../voice/parser.js';

const t = schema.purchaseTasks;

// ---------------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------------

export const dashboardRouter = Router();

dashboardRouter.get('/', async (req, res) => {
  const user = req.user!;
  const visible = visibleTasksCondition(user);
  const today = todayISO();

  const [[counts], sections] = await Promise.all([
    db
      .select({
        total: sql<number>`count(*)::int`,
        pending: sql<number>`count(*) filter (where ${t.status} = 'pending')::int`,
        urgent: sql<number>`count(*) filter (where ${t.status} = 'pending' and ${t.priority} = 'urgent')::int`,
        completed: sql<number>`count(*) filter (where ${t.status} = 'completed')::int`,
        overdue: sql<number>`count(*) filter (where ${t.status} = 'pending' and ${t.dueDate} < ${today})::int`,
        mine: sql<number>`count(*) filter (where ${t.status} = 'pending' and ${t.assignedTo} = ${user.id})::int`,
        inbox: sql<number>`count(*) filter (where ${t.status} = 'pending' and (${t.sectionId} is null or ${t.assignedTo} is null))::int`,
        completedToday: sql<number>`count(*) filter (where ${t.status} = 'completed' and ${t.closedAt} >= ${today}::date)::int`,
      })
      .from(t)
      .where(visible),
    db
      .select({
        id: schema.sections.id,
        name: schema.sections.name,
        icon: schema.sections.icon,
        pending: sql<number>`count(${t.id}) filter (where ${t.status} = 'pending')::int`,
        urgent: sql<number>`count(${t.id}) filter (where ${t.status} = 'pending' and ${t.priority} = 'urgent')::int`,
      })
      .from(schema.sections)
      .leftJoin(t, and(eq(t.sectionId, schema.sections.id), visible))
      .where(eq(schema.sections.isActive, true))
      .groupBy(schema.sections.id)
      .orderBy(sql`count(${t.id}) filter (where ${t.status} = 'pending') desc`, schema.sections.sortOrder),
  ]);

  res.json({ data: { counts, sections } });
});

// ---------------------------------------------------------------------------
// Activity feed (across all visible tasks)
// ---------------------------------------------------------------------------

export const activityRouter = Router();

activityRouter.get('/', async (req, res) => {
  const user = req.user!;
  const { offset, limit } = parse(
    z.object({ offset: z.coerce.number().int().min(0).max(100_000).default(0), limit: z.coerce.number().int().min(1).max(100).default(40) }),
    req.query,
  );
  const visibleIds = db.select({ id: t.id }).from(t).where(visibleTasksCondition(user));
  const rows = await db
    .select({
      id: schema.activityLogs.id,
      taskId: schema.activityLogs.taskId,
      taskTitle: t.title,
      action: schema.activityLogs.action,
      metadata: schema.activityLogs.metadata,
      createdAt: schema.activityLogs.createdAt,
      userName: schema.users.name,
    })
    .from(schema.activityLogs)
    .leftJoin(schema.users, eq(schema.users.id, schema.activityLogs.userId))
    .leftJoin(t, eq(t.id, schema.activityLogs.taskId))
    .where(user.role === 'admin' ? undefined : inArray(schema.activityLogs.taskId, visibleIds))
    .orderBy(desc(schema.activityLogs.createdAt), desc(schema.activityLogs.id))
    .limit(limit)
    .offset(offset);
  res.json({ data: rows, meta: { nextOffset: rows.length === limit ? offset + limit : null } });
});

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notificationsRouter = Router();

notificationsRouter.get('/', async (req, res) => {
  const userId = req.user!.id;
  const n = schema.notifications;
  const [rows, [{ unread }]] = await Promise.all([
    db
      .select({ id: n.id, taskId: n.taskId, type: n.type, message: n.message, readAt: n.readAt, createdAt: n.createdAt })
      .from(n)
      .where(eq(n.userId, userId))
      .orderBy(desc(n.createdAt), desc(n.id))
      .limit(40),
    db.select({ unread: sql<number>`count(*)::int` }).from(n).where(and(eq(n.userId, userId), isNull(n.readAt))),
  ]);
  res.json({ data: rows, meta: { unread } });
});

notificationsRouter.post('/read', async (req, res) => {
  const { ids } = parse(z.object({ ids: z.array(z.number().int().positive()).max(200).optional() }), req.body ?? {});
  const n = schema.notifications;
  await db
    .update(n)
    .set({ readAt: new Date() })
    .where(and(eq(n.userId, req.user!.id), isNull(n.readAt), ids?.length ? inArray(n.id, ids) : undefined));
  res.json({ data: { ok: true } });
});

// ---------------------------------------------------------------------------
// Voice: turn a transcript into structured fields for confirmation.
// ---------------------------------------------------------------------------

export const voiceRouter = Router();

voiceRouter.post('/parse', async (req, res) => {
  const { transcript } = parse(
    z.object({ transcript: z.string().trim().min(1, 'Voice could not be understood. Please try again or create the task manually.').max(1000) }),
    req.body,
  );
  const [sections, users, items] = await Promise.all([
    db.select({ id: schema.sections.id, name: schema.sections.name }).from(schema.sections).where(eq(schema.sections.isActive, true)),
    db.select({ id: schema.users.id, name: schema.users.name }).from(schema.users).where(eq(schema.users.isActive, true)),
    db.selectDistinct({ title: t.title }).from(t).limit(500),
  ]);
  const result = ruleBasedParser.parse(transcript, {
    sections,
    users,
    items: items.map((i) => i.title),
    today: todayISO(),
  });
  res.json({ data: result });
});

// ---------------------------------------------------------------------------
// Files — served only after the task access check.
// ---------------------------------------------------------------------------

export const filesRouter = Router();

function sendStored(res: import('express').Response, key: string, mime: string, fileName: string | null) {
  const p = filePath(key);
  if (!fs.existsSync(p)) throw notFound('File');
  const inline = mime.startsWith('image/') || mime === 'application/pdf' || mime.startsWith('audio/');
  res.setHeader('Content-Type', mime);
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Content-Security-Policy', "default-src 'none'; img-src 'self'; media-src 'self'; style-src 'unsafe-inline'; sandbox");
  res.setHeader('Cache-Control', 'private, max-age=3600');
  if (fileName) {
    const encoded = encodeURIComponent(fileName);
    res.setHeader('Content-Disposition', `${inline ? 'inline' : 'attachment'}; filename="${encoded}"; filename*=UTF-8''${encoded}`);
  }
  res.sendFile(p);
}

filesRouter.get('/attachments/:id', async (req, res) => {
  const [file] = await db.select().from(schema.attachments).where(eq(schema.attachments.id, idParam(req)));
  if (!file) throw notFound('File');
  await loadVisibleTask(req.user!, file.taskId);
  const download = req.query.download === '1';
  sendStored(res, file.storageKey, download ? 'application/octet-stream' : file.fileType, file.fileName);
});

filesRouter.get('/voice/:id', async (req, res) => {
  const [note] = await db.select().from(schema.voiceNotes).where(eq(schema.voiceNotes.id, idParam(req)));
  if (!note) throw notFound('Voice note');
  await loadVisibleTask(req.user!, note.taskId);
  sendStored(res, note.storageKey, note.mimeType, null);
});

// ---------------------------------------------------------------------------
// Live updates (Server-Sent Events)
// ---------------------------------------------------------------------------

export const eventsRouter = Router();

eventsRouter.get('/', (req, res) => {
  res.setHeader('Content-Type', 'text/event-stream');
  res.setHeader('Cache-Control', 'no-cache, no-transform');
  res.setHeader('Connection', 'keep-alive');
  res.setHeader('X-Accel-Buffering', 'no');
  res.flushHeaders();
  res.write('retry: 5000\n\n');
  const remove = addClient(req.user!.id, res);
  req.on('close', remove);
});
