CREATE TABLE "actions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"title" text NOT NULL,
	"note" text DEFAULT '' NOT NULL,
	"party" text DEFAULT 'WIFIRST' NOT NULL,
	"owner_id" uuid,
	"stream_id" uuid,
	"card_id" uuid,
	"meeting_type_id" uuid,
	"meeting_id" uuid,
	"due_date" date,
	"status" text DEFAULT 'OPEN' NOT NULL,
	"closed_at" timestamp with time zone,
	"order" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "decisions" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"account_id" uuid NOT NULL,
	"title" text NOT NULL,
	"detail" text DEFAULT '' NOT NULL,
	"status" text DEFAULT 'TAKEN' NOT NULL,
	"decided_on" date,
	"stream_id" uuid,
	"card_id" uuid,
	"topic_id" uuid,
	"meeting_type_id" uuid,
	"meeting_id" uuid,
	"order" double precision DEFAULT 0 NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_owner_id_contacts_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."contacts"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_meeting_type_id_meeting_types_id_fk" FOREIGN KEY ("meeting_type_id") REFERENCES "public"."meeting_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "actions" ADD CONSTRAINT "actions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_account_id_accounts_id_fk" FOREIGN KEY ("account_id") REFERENCES "public"."accounts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_stream_id_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."streams"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_card_id_cards_id_fk" FOREIGN KEY ("card_id") REFERENCES "public"."cards"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_topic_id_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."topics"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_meeting_type_id_meeting_types_id_fk" FOREIGN KEY ("meeting_type_id") REFERENCES "public"."meeting_types"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "decisions" ADD CONSTRAINT "decisions_meeting_id_meetings_id_fk" FOREIGN KEY ("meeting_id") REFERENCES "public"."meetings"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "actions_account_idx" ON "actions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "actions_type_idx" ON "actions" USING btree ("meeting_type_id");--> statement-breakpoint
CREATE INDEX "decisions_account_idx" ON "decisions" USING btree ("account_id");--> statement-breakpoint
CREATE INDEX "decisions_type_idx" ON "decisions" USING btree ("meeting_type_id");--> statement-breakpoint
-- Blocs proposés d'office : relevé des actions avec le statut des streams, registre des décisions avec les sujets et les faits marquants
UPDATE "meeting_types" SET "blocks" = "blocks" || '["ACTIONS"]'::jsonb WHERE "blocks" @> '["STREAM_STATUS"]'::jsonb AND NOT ("blocks" @> '["ACTIONS"]'::jsonb);--> statement-breakpoint
UPDATE "meeting_types" SET "blocks" = "blocks" || '["DECISIONS","ACTIONS"]'::jsonb WHERE "blocks" @> '["TOPICS"]'::jsonb AND NOT ("blocks" @> '["DECISIONS"]'::jsonb);--> statement-breakpoint
UPDATE "meeting_types" SET "blocks" = "blocks" || '["DECISIONS"]'::jsonb WHERE "blocks" @> '["HIGHLIGHTS"]'::jsonb AND NOT ("blocks" @> '["DECISIONS"]'::jsonb);--> statement-breakpoint
-- Décisions déjà écrites dans les sujets (ligne « Décision : … ») reprises dans le registre, datées de leur séance
INSERT INTO "decisions" ("account_id", "title", "detail", "status", "decided_on", "topic_id", "meeting_type_id", "meeting_id", "order")
SELECT t."account_id",
       btrim(substring(t."decision_request" from '(?i)(?:^|\n)\s*\**\s*d[ée]cisions?(?:\s+prises?)?\s*\**\s*:\s*([^\n]*)')),
       coalesce(btrim(substring(t."decision_request" from '(?i)(?:^|\n)\s*\**\s*d[ée]cisions?(?:\s+prises?)?\s*\**\s*:[^\n]*\n(.*)$')), ''),
       'TAKEN', m."date", t."id", m."meeting_type_id", m."id", t."order"
FROM "topics" t JOIN "meetings" m ON m."id" = t."meeting_id"
WHERE t."decision_request" ~* '(^|\n)\s*\**\s*d[ée]cisions?(\s+prises?)?\s*\**\s*:'
  AND btrim(substring(t."decision_request" from '(?i)(?:^|\n)\s*\**\s*d[ée]cisions?(?:\s+prises?)?\s*\**\s*:\s*([^\n]*)')) <> '';--> statement-breakpoint
-- Compte La Poste : relevé des actions du COPROJ LP du 01/10/2026, repris du compte rendu envoyé le 03/10/2026
WITH acc AS (SELECT id FROM "accounts" WHERE slug = 'la-poste-pstng'),
typ AS (SELECT mt.id FROM "meeting_types" mt, acc WHERE mt."account_id" = acc.id AND mt."name" = 'COPROJ LP' LIMIT 1),
mtg AS (SELECT m.id FROM "meetings" m, typ WHERE m."meeting_type_id" = typ.id AND m."date" = '2026-10-01' LIMIT 1),
src(n, party, stream, title) AS (VALUES
  (1, 'WIFIRST', 'Gouvernance', 'Proposer 2 ou 3 créneaux pour le comité de pilotage de début novembre.'),
  (2, 'CLIENT', 'Déploiement', 'Passer la commande du pilote après validation du prototype.'),
  (3, 'CLIENT', 'Exploitation', 'Arbitrer entre les 2 scénarios, avec ou sans interconnexion ITSM descendante pour le pilote Lot 3.'),
  (4, 'CLIENT', 'Exploitation', 'Planifier l''atelier de validation du processus Exploitation Lot 3 Fast Track. Wifirst propose de le tenir en commun avec l''atelier MP Maintenance.'),
  (5, 'CLIENT', 'Outillage Data & référentiel', 'Partager le formalisme du référentiel de sites attendu dans l''EB MeC.'),
  (6, 'CLIENT', 'Mainteneurs Postaux', 'Faire un retour sur la proposition Wifirst d''augmenter la fréquence et la durée des ateliers MP en octobre.'),
  (7, 'CLIENT', 'Sécurité', 'Partager la gouvernance prévue sur le NAC et les points d''attention du stream leader sécurité sur le SOC.')
)
INSERT INTO "actions" ("account_id", "title", "party", "stream_id", "meeting_type_id", "meeting_id", "order", "created_at")
SELECT acc.id, src.title, src.party, (SELECT s.id FROM "streams" s WHERE s."account_id" = acc.id AND s."name" = src.stream LIMIT 1), typ.id, mtg.id, src.n, '2026-10-01T12:00:00Z'
FROM src, acc, typ, mtg
WHERE NOT EXISTS (SELECT 1 FROM "actions" x WHERE x."account_id" = acc.id);--> statement-breakpoint
-- Compte La Poste : e-mail du compte rendu du COPROJ LP (objet, destinataires, introduction), repris de l'envoi du 03/10/2026
UPDATE "meeting_types" SET "settings" = "settings" || jsonb_build_object(
  'mailSubject', 'WIFIRST / PSTNG : CR COPROJ du {date}',
  'mailTo', 'tuyen.vu-prestataire@laposte.fr, olivier.thiebaut-prestataire@laposte.fr',
  'mailCc', 'matthieu.roca@wifirst.fr, thibaut.bayen@wifirst.fr',
  'mailIntro', 'Vous trouverez ci-dessous le compte rendu du COPROJ PST NG du {date_longue}.',
  'mailOutro', 'N''hésitez pas à revenir vers moi pour tout complément.',
  'mailAccount', 'florent.jolivet-ext@wifirst.fr')
WHERE "name" = 'COPROJ LP' AND "account_id" = (SELECT id FROM "accounts" WHERE slug = 'la-poste-pstng') AND NOT ("settings" ? 'mailSubject');
