import type { Response } from 'express';

/**
 * Server-Sent Events hub. Events only carry IDs and a type — never task data — so clients
 * re-fetch through the authorised REST API. This keeps real-time updates from leaking restricted tasks.
 */
export type LiveEvent =
  | { type: 'task.changed'; taskId: number }
  | { type: 'task.deleted'; taskId: number }
  | { type: 'task.thread'; taskId: number }
  | { type: 'sections.changed' }
  | { type: 'notification'; notificationId: number };

interface Client {
  userId: number;
  res: Response;
}

const clients = new Set<Client>();

export function addClient(userId: number, res: Response): () => void {
  const client = { userId, res };
  clients.add(client);
  return () => clients.delete(client);
}

function write(res: Response, event: LiveEvent) {
  res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
}

export function broadcast(event: LiveEvent): void {
  for (const c of clients) write(c.res, event);
}

export function sendToUser(userId: number, event: LiveEvent): void {
  for (const c of clients) if (c.userId === userId) write(c.res, event);
}

setInterval(() => {
  for (const c of clients) c.res.write(': keep-alive\n\n');
}, 25_000).unref();
