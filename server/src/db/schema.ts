import { sql } from 'drizzle-orm';
import {
  pgTable,
  pgEnum,
  serial,
  integer,
  varchar,
  text,
  boolean,
  timestamp,
  date,
  numeric,
  jsonb,
  index,
  uniqueIndex,
  primaryKey,
} from 'drizzle-orm/pg-core';

export const roleEnum = pgEnum('user_role', ['admin', 'user']);
export const priorityEnum = pgEnum('task_priority', ['normal', 'high', 'urgent']);
export const statusEnum = pgEnum('task_status', ['pending', 'completed']);

const timestamps = {
  createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp('updated_at', { withTimezone: true }).notNull().defaultNow(),
};

export const users = pgTable(
  'users',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 120 }).notNull(),
    email: varchar('email', { length: 200 }).notNull(),
    phone: varchar('phone', { length: 30 }),
    role: roleEnum('role').notNull().default('user'),
    profileImage: text('profile_image'),
    passwordHash: text('password_hash').notNull(),
    isActive: boolean('is_active').notNull().default(true),
    ...timestamps,
  },
  (t) => [uniqueIndex('users_email_lower_uq').on(sql`lower(${t.email})`)],
);

export const sections = pgTable(
  'sections',
  {
    id: serial('id').primaryKey(),
    name: varchar('name', { length: 80 }).notNull(),
    description: text('description'),
    icon: varchar('icon', { length: 40 }),
    isActive: boolean('is_active').notNull().default(true),
    sortOrder: integer('sort_order').notNull().default(0),
    ...timestamps,
  },
  (t) => [uniqueIndex('sections_name_lower_uq').on(sql`lower(${t.name})`)],
);

/** Section membership: a normal user can see every task in the sections they belong to. */
export const userSections = pgTable(
  'user_sections',
  {
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    sectionId: integer('section_id')
      .notNull()
      .references(() => sections.id, { onDelete: 'cascade' }),
  },
  (t) => [primaryKey({ columns: [t.userId, t.sectionId] }), index('user_sections_section_idx').on(t.sectionId)],
);

export const purchaseTasks = pgTable(
  'purchase_tasks',
  {
    id: serial('id').primaryKey(),
    title: varchar('title', { length: 200 }).notNull(),
    quantity: numeric('quantity', { precision: 12, scale: 3, mode: 'number' }).notNull(),
    unit: varchar('unit', { length: 20 }).notNull().default('Nos'),
    description: text('description'),
    sectionId: integer('section_id').references(() => sections.id, { onDelete: 'set null' }),
    assignedTo: integer('assigned_to').references(() => users.id, { onDelete: 'set null' }),
    createdBy: integer('created_by')
      .notNull()
      .references(() => users.id),
    priority: priorityEnum('priority').notNull().default('normal'),
    status: statusEnum('status').notNull().default('pending'),
    dueDate: date('due_date', { mode: 'string' }),
    ...timestamps,
    closedAt: timestamp('closed_at', { withTimezone: true }),
    closedBy: integer('closed_by').references(() => users.id),
  },
  (t) => [
    index('tasks_status_created_idx').on(t.status, t.createdAt),
    index('tasks_section_idx').on(t.sectionId, t.status),
    index('tasks_assigned_idx').on(t.assignedTo, t.status),
    index('tasks_created_by_idx').on(t.createdBy),
    index('tasks_due_idx').on(t.dueDate),
    index('tasks_closed_at_idx').on(t.closedAt),
  ],
);

export const comments = pgTable(
  'comments',
  {
    id: serial('id').primaryKey(),
    taskId: integer('task_id')
      .notNull()
      .references(() => purchaseTasks.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    message: text('message').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('comments_task_idx').on(t.taskId, t.createdAt)],
);

export const voiceNotes = pgTable(
  'voice_notes',
  {
    id: serial('id').primaryKey(),
    taskId: integer('task_id')
      .notNull()
      .references(() => purchaseTasks.id, { onDelete: 'cascade' }),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id),
    /** Opaque file name inside the private storage directory. Never exposed to clients. */
    storageKey: varchar('storage_key', { length: 100 }).notNull(),
    mimeType: varchar('mime_type', { length: 100 }).notNull(),
    fileSize: integer('file_size').notNull(),
    duration: integer('duration').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('voice_notes_task_idx').on(t.taskId, t.createdAt)],
);

export const attachments = pgTable(
  'attachments',
  {
    id: serial('id').primaryKey(),
    taskId: integer('task_id')
      .notNull()
      .references(() => purchaseTasks.id, { onDelete: 'cascade' }),
    uploadedBy: integer('uploaded_by')
      .notNull()
      .references(() => users.id),
    fileName: varchar('file_name', { length: 255 }).notNull(),
    storageKey: varchar('storage_key', { length: 100 }).notNull(),
    fileType: varchar('file_type', { length: 100 }).notNull(),
    fileSize: integer('file_size').notNull(),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('attachments_task_idx').on(t.taskId)],
);

export const activityLogs = pgTable(
  'activity_logs',
  {
    id: serial('id').primaryKey(),
    taskId: integer('task_id').references(() => purchaseTasks.id, { onDelete: 'set null' }),
    userId: integer('user_id').references(() => users.id),
    action: varchar('action', { length: 40 }).notNull(),
    metadata: jsonb('metadata').$type<Record<string, unknown>>().notNull().default({}),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('activity_task_idx').on(t.taskId, t.createdAt), index('activity_created_idx').on(t.createdAt)],
);

export const notifications = pgTable(
  'notifications',
  {
    id: serial('id').primaryKey(),
    userId: integer('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    taskId: integer('task_id').references(() => purchaseTasks.id, { onDelete: 'cascade' }),
    actorId: integer('actor_id').references(() => users.id),
    type: varchar('type', { length: 40 }).notNull(),
    message: text('message').notNull(),
    readAt: timestamp('read_at', { withTimezone: true }),
    createdAt: timestamp('created_at', { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index('notifications_user_idx').on(t.userId, t.createdAt)],
);

export type User = typeof users.$inferSelect;
export type Section = typeof sections.$inferSelect;
export type PurchaseTask = typeof purchaseTasks.$inferSelect;
