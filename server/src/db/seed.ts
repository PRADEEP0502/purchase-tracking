import bcrypt from 'bcryptjs';
import { sql } from 'drizzle-orm';
import { pathToFileURL } from 'node:url';
import { db, schema, runMigrations, closeDb } from './client.js';

export const DEMO_PASSWORD = 'Jpm@12345';

const SECTIONS: Array<[string, string, string]> = [
  ['Production', 'factory', 'Production floor requirements'],
  ['Maintenance', 'wrench', 'Machine spares and maintenance consumables'],
  ['Electrical', 'zap', 'Cables, switchgear and electrical spares'],
  ['Lab', 'flask', 'Quality lab chemicals and instruments'],
  ['Stores', 'package', 'General stores and consumables'],
  ['IT', 'monitor', 'Computers, printers and accessories'],
  ['Admin', 'building', 'Office administration and stationery'],
  ['HR', 'users', 'Staff welfare and HR requirements'],
];

const USERS = [
  { name: 'Pradeep', email: 'pradeep@jpm.local', phone: '9800000001', role: 'admin' as const, sections: [] as string[] },
  { name: 'Ashok', email: 'ashok@jpm.local', phone: '9800000002', role: 'user' as const, sections: ['Maintenance', 'Electrical'] },
  { name: 'Kumar', email: 'kumar@jpm.local', phone: '9800000003', role: 'user' as const, sections: ['Maintenance', 'Stores', 'Production'] },
  { name: 'Ravi', email: 'ravi@jpm.local', phone: '9800000004', role: 'user' as const, sections: ['IT', 'Admin', 'HR', 'Lab'] },
];

interface DemoTask {
  title: string;
  quantity: number;
  unit: string;
  section: string | null;
  assignee: string | null;
  creator: string;
  priority: 'normal' | 'high' | 'urgent';
  /** days from today; negative = past */
  due?: number;
  createdDaysAgo: number;
  closed?: { by: string; daysAgo: number; hour: number };
  description?: string;
  comments?: Array<[string, string]>;
}

const TASKS: DemoTask[] = [
  { title: 'Bearing', quantity: 2, unit: 'Nos', section: 'Maintenance', assignee: 'Ashok', creator: 'Pradeep', priority: 'urgent', due: 0, createdDaysAgo: 0, description: 'Required for machine maintenance. 6205 ZZ, SKF or equivalent.', comments: [['Pradeep', 'Bearing urgently required.'], ['Ashok', "Okay, I'll purchase it."], ['Pradeep', 'Please purchase today.']] },
  { title: 'V-Belt', quantity: 5, unit: 'Nos', section: 'Maintenance', assignee: 'Kumar', creator: 'Ashok', priority: 'normal', due: 3, createdDaysAgo: 1, description: 'B-42 section belts for compressor drive.' },
  { title: 'A4 Paper', quantity: 10, unit: 'Packets', section: 'Admin', assignee: 'Ravi', creator: 'Pradeep', priority: 'normal', due: 2, createdDaysAgo: 1 },
  { title: 'Electrical Cable', quantity: 50, unit: 'M', section: 'Electrical', assignee: 'Ashok', creator: 'Kumar', priority: 'high', due: 1, createdDaysAgo: 2, description: '2.5 sq mm copper, 3 core.', comments: [['Ashok', 'Checking rate with two suppliers.']] },
  { title: 'Grease', quantity: 5, unit: 'Kg', section: 'Maintenance', assignee: 'Kumar', creator: 'Ashok', priority: 'normal', createdDaysAgo: 3, closed: { by: 'Kumar', daysAgo: 1, hour: 17 } },
  { title: 'Printer Toner', quantity: 2, unit: 'Nos', section: 'IT', assignee: 'Ravi', creator: 'Pradeep', priority: 'high', due: -1, createdDaysAgo: 4, description: 'HP 88A for accounts printer.' },
  { title: 'Motor Coupling', quantity: 1, unit: 'Nos', section: 'Maintenance', assignee: 'Ashok', creator: 'Pradeep', priority: 'urgent', createdDaysAgo: 2, closed: { by: 'Ashok', daysAgo: 0, hour: 11 }, comments: [['Ashok', 'Purchased.']] },
  { title: 'Safety Gloves', quantity: 20, unit: 'Pair', section: 'Production', assignee: 'Kumar', creator: 'Kumar', priority: 'normal', due: 5, createdDaysAgo: 0 },
  { title: 'pH Buffer Solution', quantity: 2, unit: 'Bottle', section: 'Lab', assignee: 'Ravi', creator: 'Pradeep', priority: 'normal', createdDaysAgo: 6, closed: { by: 'Ravi', daysAgo: 5, hour: 15 } },
  { title: 'MCB 32A', quantity: 4, unit: 'Nos', section: 'Electrical', assignee: null, creator: 'Ashok', priority: 'high', createdDaysAgo: 0 },
  { title: 'Hydraulic Oil', quantity: 20, unit: 'L', section: 'Maintenance', assignee: 'Kumar', creator: 'Ashok', priority: 'normal', createdDaysAgo: 9, closed: { by: 'Kumar', daysAgo: 8, hour: 12 } },
  { title: 'Tea Cups', quantity: 100, unit: 'Nos', section: null, assignee: null, creator: 'Ravi', priority: 'normal', createdDaysAgo: 0, description: 'Paper cups for canteen.' },
  { title: 'Keyboard and Mouse Set', quantity: 3, unit: 'Set', section: 'IT', assignee: 'Ravi', creator: 'Ravi', priority: 'normal', due: 7, createdDaysAgo: 1 },
  { title: 'Cable Ties', quantity: 2, unit: 'Packets', section: 'Stores', assignee: 'Kumar', creator: 'Ashok', priority: 'normal', createdDaysAgo: 12, closed: { by: 'Kumar', daysAgo: 11, hour: 10 } },
];

const daysAgo = (n: number, hour = 9, minute = 10) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  d.setHours(hour, minute, 0, 0);
  return d;
};
const isoInDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d.toISOString().slice(0, 10);
};

export async function seedIfEmpty(): Promise<boolean> {
  const [{ count }] = await db.select({ count: sql<number>`count(*)::int` }).from(schema.users);
  if (count > 0) return false;

  const passwordHash = await bcrypt.hash(DEMO_PASSWORD, 10);

  await db.transaction(async (tx) => {
    const sections = await tx
      .insert(schema.sections)
      .values(SECTIONS.map(([name, icon, description], i) => ({ name, icon, description, sortOrder: i + 1 })))
      .returning();
    const sectionId = (name: string | null) => (name ? sections.find((s) => s.name === name)!.id : null);

    const users = await tx
      .insert(schema.users)
      .values(USERS.map(({ sections: _s, ...u }) => ({ ...u, passwordHash })))
      .returning();
    const userId = (name: string | null) => (name ? users.find((u) => u.name === name)!.id : null);

    const memberships = USERS.flatMap((u) => u.sections.map((s) => ({ userId: userId(u.name)!, sectionId: sectionId(s)! })));
    if (memberships.length) await tx.insert(schema.userSections).values(memberships);

    for (const d of TASKS) {
      const createdAt = daysAgo(d.createdDaysAgo, 9, 10);
      const closedAt = d.closed ? daysAgo(d.closed.daysAgo, d.closed.hour, 42) : null;
      const [task] = await tx
        .insert(schema.purchaseTasks)
        .values({
          title: d.title,
          quantity: d.quantity,
          unit: d.unit,
          description: d.description ?? null,
          sectionId: sectionId(d.section),
          assignedTo: userId(d.assignee),
          createdBy: userId(d.creator)!,
          priority: d.priority,
          status: d.closed ? 'completed' : 'pending',
          dueDate: d.due !== undefined ? isoInDays(d.due) : null,
          createdAt,
          updatedAt: closedAt ?? createdAt,
          closedAt,
          closedBy: d.closed ? userId(d.closed.by) : null,
        })
        .returning();

      const label = `${d.title} – ${d.quantity} ${d.unit}`;
      const logs: Array<typeof schema.activityLogs.$inferInsert> = [
        { taskId: task.id, userId: task.createdBy, action: 'created', metadata: { title: label, via: 'form' }, createdAt },
      ];
      if (d.assignee) {
        logs.push({
          taskId: task.id,
          userId: task.createdBy,
          action: 'assigned',
          metadata: { to: userId(d.assignee), toName: d.assignee },
          createdAt: new Date(createdAt.getTime() + 2 * 60_000),
        });
      }
      (d.comments ?? []).forEach(([who, message], i) => {
        const at = new Date(createdAt.getTime() + (i + 1) * 15 * 60_000);
        logs.push({ taskId: task.id, userId: userId(who), action: 'commented', metadata: {}, createdAt: at });
      });
      if (d.comments?.length) {
        await tx.insert(schema.comments).values(
          d.comments.map(([who, message], i) => ({
            taskId: task.id,
            userId: userId(who)!,
            message,
            createdAt: new Date(createdAt.getTime() + (i + 1) * 15 * 60_000),
          })),
        );
      }
      if (closedAt) logs.push({ taskId: task.id, userId: userId(d.closed!.by), action: 'closed', metadata: {}, createdAt: closedAt });
      await tx.insert(schema.activityLogs).values(logs);
    }

    const bearing = await tx.select().from(schema.purchaseTasks).where(sql`${schema.purchaseTasks.title} = 'Bearing'`);
    await tx.insert(schema.notifications).values({
      userId: userId('Ashok')!,
      actorId: userId('Pradeep'),
      taskId: bearing[0].id,
      type: 'assigned',
      message: 'Bearing – 2 Nos was assigned to you by Pradeep.',
    });
  });

  console.log(`Seeded demo data. Sign in as pradeep@jpm.local (admin) or ashok@jpm.local with password ${DEMO_PASSWORD}`);
  return true;
}

// Allow `npm run seed`.
if (import.meta.url === pathToFileURL(process.argv[1] ?? '').href) {
  await runMigrations();
  const seeded = await seedIfEmpty();
  if (!seeded) console.log('Database already has users — seed skipped.');
  await closeDb();
}
