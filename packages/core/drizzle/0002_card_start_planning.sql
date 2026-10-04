ALTER TABLE "cards" ADD COLUMN "start_date" date;--> statement-breakpoint
-- Les types de séance à faits marquants (Program weekly) reçoivent les vues à date du kanban
UPDATE "meeting_types" SET "blocks" = "blocks" || '["ALERT_CARDS","PLANNING"]'::jsonb WHERE "blocks" @> '["HIGHLIGHTS"]'::jsonb AND NOT ("blocks" @> '["PLANNING"]'::jsonb);
