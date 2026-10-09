ALTER TABLE "notifications" ADD COLUMN "level" varchar(10) DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD COLUMN "data" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD COLUMN "assigned_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD COLUMN "acknowledged_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD COLUMN "acknowledged_by" integer;--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD COLUMN "started_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD COLUMN "reminder_count" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD COLUMN "last_reminder_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD COLUMN "due_reminder_for" date;--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD COLUMN "overdue_reminder_for" date;--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD CONSTRAINT "purchase_tasks_acknowledged_by_users_id_fk" FOREIGN KEY ("acknowledged_by") REFERENCES "public"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_ack_idx" ON "purchase_tasks" USING btree ("assigned_to","acknowledged_at");--> statement-breakpoint
-- Existing assignments predate acknowledgement: record them as assigned and acknowledged at
-- creation so the upgrade does not raise alarms for old work.
UPDATE "purchase_tasks" SET "assigned_at" = "created_at", "acknowledged_at" = "created_at", "acknowledged_by" = "assigned_to"
WHERE "assigned_to" IS NOT NULL AND "assigned_at" IS NULL;
