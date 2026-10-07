CREATE TABLE "bridge_clients" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"slug" text NOT NULL,
	"name" text NOT NULL,
	"client_name" text NOT NULL,
	"provider_name" text DEFAULT 'Wifirst' NOT NULL,
	"short_name" text DEFAULT '' NOT NULL,
	"emoji" text DEFAULT '🤝' NOT NULL,
	"description" text DEFAULT '' NOT NULL,
	"settings" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"archived" boolean DEFAULT false NOT NULL,
	"next_ref" integer DEFAULT 1 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bridge_clients_slug_unique" UNIQUE("slug")
);
--> statement-breakpoint
CREATE TABLE "bridge_devices" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"label" text DEFAULT '' NOT NULL,
	"last_used_at" timestamp with time zone DEFAULT now() NOT NULL,
	"expires_at" timestamp with time zone NOT NULL,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bridge_devices_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "bridge_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"question_id" uuid,
	"action" text NOT NULL,
	"summary" text DEFAULT '' NOT NULL,
	"changes" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"user_id" uuid,
	"user_name" text DEFAULT '' NOT NULL,
	"party" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bridge_files" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"question_id" uuid,
	"message_id" uuid,
	"name" text NOT NULL,
	"mime" text DEFAULT 'application/octet-stream' NOT NULL,
	"size" integer NOT NULL,
	"data" "bytea" NOT NULL,
	"uploaded_by_id" uuid,
	"uploaded_by_name" text DEFAULT '' NOT NULL,
	"attached_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bridge_invitations" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"token_hash" text NOT NULL,
	"invited_by_id" uuid,
	"expires_at" timestamp with time zone NOT NULL,
	"accepted_at" timestamp with time zone,
	"revoked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bridge_invitations_token_hash_unique" UNIQUE("token_hash")
);
--> statement-breakpoint
CREATE TABLE "bridge_jobs" (
	"name" text NOT NULL,
	"day" date NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "bridge_jobs_name_day_pk" PRIMARY KEY("name","day")
);
--> statement-breakpoint
CREATE TABLE "bridge_members" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"user_id" uuid NOT NULL,
	"client_id" uuid NOT NULL,
	"side" text NOT NULL,
	"default_access" text DEFAULT 'READ' NOT NULL,
	"stream_access" jsonb DEFAULT '{}'::jsonb NOT NULL,
	"notify" text DEFAULT 'IMMEDIATE' NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bridge_messages" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"question_id" uuid NOT NULL,
	"author_id" uuid,
	"author_name" text DEFAULT '' NOT NULL,
	"party" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"outcome" text DEFAULT 'ASSIGN' NOT NULL,
	"assigned_before" text,
	"assigned_after" text,
	"edited_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bridge_question_streams" (
	"question_id" uuid NOT NULL,
	"stream_id" uuid NOT NULL,
	CONSTRAINT "bridge_question_streams_question_id_stream_id_pk" PRIMARY KEY("question_id","stream_id")
);
--> statement-breakpoint
CREATE TABLE "bridge_questions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"ref" integer NOT NULL,
	"subject" text NOT NULL,
	"body" text DEFAULT '' NOT NULL,
	"asked_by_id" uuid,
	"asked_by_name" text DEFAULT '' NOT NULL,
	"asked_by_party" text NOT NULL,
	"assigned_party" text NOT NULL,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"due_date" date,
	"closed_at" timestamp with time zone,
	"closed_by_id" uuid,
	"closed_by_name" text DEFAULT '' NOT NULL,
	"last_activity_at" timestamp with time zone DEFAULT now() NOT NULL,
	"deleted_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "bridge_streams" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"client_id" uuid NOT NULL,
	"name" text NOT NULL,
	"emoji" text DEFAULT '' NOT NULL,
	"order" integer DEFAULT 0 NOT NULL,
	"active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "wacman_access" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bridge_access" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_set" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "bridge_last_login_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "bridge_devices" ADD CONSTRAINT "bridge_devices_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_events" ADD CONSTRAINT "bridge_events_client_id_bridge_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."bridge_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_events" ADD CONSTRAINT "bridge_events_question_id_bridge_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."bridge_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_files" ADD CONSTRAINT "bridge_files_client_id_bridge_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."bridge_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_files" ADD CONSTRAINT "bridge_files_question_id_bridge_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."bridge_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_files" ADD CONSTRAINT "bridge_files_message_id_bridge_messages_id_fk" FOREIGN KEY ("message_id") REFERENCES "public"."bridge_messages"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_files" ADD CONSTRAINT "bridge_files_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_invitations" ADD CONSTRAINT "bridge_invitations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_members" ADD CONSTRAINT "bridge_members_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_members" ADD CONSTRAINT "bridge_members_client_id_bridge_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."bridge_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_messages" ADD CONSTRAINT "bridge_messages_client_id_bridge_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."bridge_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_messages" ADD CONSTRAINT "bridge_messages_question_id_bridge_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."bridge_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_messages" ADD CONSTRAINT "bridge_messages_author_id_users_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_question_streams" ADD CONSTRAINT "bridge_question_streams_question_id_bridge_questions_id_fk" FOREIGN KEY ("question_id") REFERENCES "public"."bridge_questions"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_question_streams" ADD CONSTRAINT "bridge_question_streams_stream_id_bridge_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."bridge_streams"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_questions" ADD CONSTRAINT "bridge_questions_client_id_bridge_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."bridge_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_questions" ADD CONSTRAINT "bridge_questions_asked_by_id_users_id_fk" FOREIGN KEY ("asked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_questions" ADD CONSTRAINT "bridge_questions_closed_by_id_users_id_fk" FOREIGN KEY ("closed_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "bridge_streams" ADD CONSTRAINT "bridge_streams_client_id_bridge_clients_id_fk" FOREIGN KEY ("client_id") REFERENCES "public"."bridge_clients"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "bridge_devices_user_idx" ON "bridge_devices" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "bridge_events_question_idx" ON "bridge_events" USING btree ("question_id","created_at");--> statement-breakpoint
CREATE INDEX "bridge_events_client_idx" ON "bridge_events" USING btree ("client_id","created_at");--> statement-breakpoint
CREATE INDEX "bridge_files_question_idx" ON "bridge_files" USING btree ("question_id");--> statement-breakpoint
CREATE INDEX "bridge_files_client_idx" ON "bridge_files" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "bridge_invitations_user_idx" ON "bridge_invitations" USING btree ("user_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bridge_members_user_client_uq" ON "bridge_members" USING btree ("user_id","client_id");--> statement-breakpoint
CREATE INDEX "bridge_members_client_idx" ON "bridge_members" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "bridge_messages_question_idx" ON "bridge_messages" USING btree ("question_id","created_at");--> statement-breakpoint
CREATE INDEX "bridge_messages_client_idx" ON "bridge_messages" USING btree ("client_id");--> statement-breakpoint
CREATE INDEX "bridge_question_streams_stream_idx" ON "bridge_question_streams" USING btree ("stream_id");--> statement-breakpoint
CREATE UNIQUE INDEX "bridge_questions_client_ref_uq" ON "bridge_questions" USING btree ("client_id","ref");--> statement-breakpoint
CREATE INDEX "bridge_questions_client_status_idx" ON "bridge_questions" USING btree ("client_id","status");--> statement-breakpoint
CREATE INDEX "bridge_streams_client_idx" ON "bridge_streams" USING btree ("client_id");--> statement-breakpoint
-- WiBridge : premier client, La Poste, et ses streams (une seule fois, si aucun client WiBridge n'existe)
INSERT INTO "bridge_clients" ("slug", "name", "client_name", "provider_name", "short_name", "emoji", "description")
SELECT 'la-poste', 'La Poste', 'La Poste', 'Wifirst', 'LP', '📮', $$**À quoi sert WiBridge** : Wifirst et La Poste y posent leurs questions et leurs demandes d'éléments, et chacun voit à qui revient la suite.
**Poser une question** : bouton « Nouvelle question », avec un sujet, le texte de la question, un ou plusieurs streams et l'organisation qui doit répondre.
**Répondre** : ouvrir les échanges d'une question, écrire la réponse puis choisir l'issue : attribuer à l'autre organisation, conserver l'attribution (premiers éléments, réponse à compléter) ou clôturer.
**Rouvrir** : une question clôturée peut être rouverte à tout moment.
**Historique** : le bouton horloge de chaque question montre toutes les modifications.$$
WHERE NOT EXISTS (SELECT 1 FROM "bridge_clients");--> statement-breakpoint
INSERT INTO "bridge_streams" ("client_id", "name", "emoji", "order")
SELECT c."id", s."name", s."emoji", s."ord"
FROM "bridge_clients" c,
     (VALUES ('Technico-fonctionnelle', '🧩', 1), ('Sécurité', '🔒', 2), ('Déploiement', '🚚', 3), ('Mainteneur Postal', '🛠️', 4), ('Exploitation', '⚙️', 5), ('Outillage & Data', '📊', 6), ('Gouvernance', '🏛️', 7)) AS s("name", "emoji", "ord")
WHERE c."slug" = 'la-poste' AND NOT EXISTS (SELECT 1 FROM "bridge_streams" b WHERE b."client_id" = c."id");--> statement-breakpoint
-- Super-administrateurs : accès WiBridge, membres Wifirst du client La Poste avec les droits des deux organisations
UPDATE "users" SET "bridge_access" = true WHERE "is_super_admin" AND NOT "bridge_access";--> statement-breakpoint
INSERT INTO "bridge_members" ("user_id", "client_id", "side", "default_access")
SELECT u."id", c."id", 'PROVIDER', 'BOTH' FROM "users" u, "bridge_clients" c
WHERE u."is_super_admin" AND c."slug" = 'la-poste'
ON CONFLICT ("user_id", "client_id") DO NOTHING;
