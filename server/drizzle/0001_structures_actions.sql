CREATE TABLE "task_actions" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(60) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "task_structures" (
	"id" serial PRIMARY KEY NOT NULL,
	"name" varchar(120) NOT NULL,
	"parent_id" integer,
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" integer DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD COLUMN "structure_id" integer;--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD COLUMN "action_id" integer;--> statement-breakpoint
ALTER TABLE "task_structures" ADD CONSTRAINT "task_structures_parent_id_task_structures_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."task_structures"("id") ON DELETE restrict ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "task_actions_name_lower_uq" ON "task_actions" USING btree (lower("name"));--> statement-breakpoint
CREATE INDEX "task_structures_parent_idx" ON "task_structures" USING btree ("parent_id","sort_order");--> statement-breakpoint
CREATE UNIQUE INDEX "task_structures_sibling_name_uq" ON "task_structures" USING btree (coalesce("parent_id", 0),lower("name"));--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD CONSTRAINT "purchase_tasks_structure_id_task_structures_id_fk" FOREIGN KEY ("structure_id") REFERENCES "public"."task_structures"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "purchase_tasks" ADD CONSTRAINT "purchase_tasks_action_id_task_actions_id_fk" FOREIGN KEY ("action_id") REFERENCES "public"."task_actions"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "tasks_structure_idx" ON "purchase_tasks" USING btree ("structure_id");--> statement-breakpoint
CREATE INDEX "tasks_action_idx" ON "purchase_tasks" USING btree ("action_id");--> statement-breakpoint
-- Default actions (admins can rename, disable, reorder or add more).
INSERT INTO "task_actions" ("name", "sort_order") VALUES
	('Purchase', 1), ('Repair', 2), ('Replacement', 3), ('Maintenance', 4), ('Inspection', 5),
	('Service', 6), ('Installation', 7), ('Modification', 8), ('Follow-up', 9), ('Other', 10)
ON CONFLICT DO NOTHING;--> statement-breakpoint
-- Every task created before actions existed was a purchase request.
UPDATE "purchase_tasks" SET "action_id" = (SELECT "id" FROM "task_actions" WHERE "name" = 'Purchase') WHERE "action_id" IS NULL;
