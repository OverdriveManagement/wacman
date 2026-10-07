ALTER TABLE "bridge_messages" ADD COLUMN "deleted_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bridge_messages" ADD COLUMN "deleted_by_name" text DEFAULT '' NOT NULL;