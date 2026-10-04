ALTER TABLE "cards" ADD COLUMN "content_updated_at" timestamp with time zone DEFAULT now() NOT NULL;--> statement-breakpoint
-- Point de départ : la dernière mise à jour connue de chaque carte
UPDATE "cards" SET "content_updated_at" = "updated_at";--> statement-breakpoint
-- Compte La Poste (PST NG) : dates « Mis à jour » relevées dans Notion le 04/10/2026 (base Livrables, par Réf.).
-- Si la carte a été modifiée dans WacMan depuis l'import, la date de cette modification l'emporte.
WITH notion(ref, edited) AS (VALUES
  (1, '2026-09-28T13:17:19Z'::timestamptz),
  (3, '2026-10-04T06:41:13Z'::timestamptz),
  (5, '2026-09-28T13:17:22Z'::timestamptz),
  (6, '2026-09-28T13:17:25Z'::timestamptz),
  (8, '2026-09-28T13:17:30Z'::timestamptz),
  (9, '2026-09-28T13:17:27Z'::timestamptz),
  (10, '2026-09-28T13:17:45Z'::timestamptz),
  (11, '2026-09-28T13:17:28Z'::timestamptz),
  (12, '2026-09-28T13:17:31Z'::timestamptz),
  (13, '2026-10-02T15:04:10Z'::timestamptz),
  (14, '2026-09-28T13:17:51Z'::timestamptz),
  (15, '2026-09-28T13:17:54Z'::timestamptz),
  (16, '2026-09-28T13:17:46Z'::timestamptz),
  (17, '2026-09-28T13:17:48Z'::timestamptz),
  (18, '2026-09-28T14:16:51Z'::timestamptz),
  (19, '2026-09-28T13:17:42Z'::timestamptz),
  (20, '2026-09-28T13:17:43Z'::timestamptz),
  (21, '2026-09-28T14:19:15Z'::timestamptz),
  (22, '2026-09-28T13:17:50Z'::timestamptz),
  (30, '2026-09-28T13:17:33Z'::timestamptz),
  (31, '2026-09-28T13:17:39Z'::timestamptz),
  (32, '2026-10-03T06:10:09Z'::timestamptz),
  (33, '2026-09-29T09:12:12Z'::timestamptz),
  (34, '2026-09-28T13:17:36Z'::timestamptz),
  (35, '2026-09-28T13:17:24Z'::timestamptz),
  (36, '2026-09-28T13:19:50Z'::timestamptz),
  (37, '2026-09-28T14:06:26Z'::timestamptz),
  (38, '2026-09-28T14:18:14Z'::timestamptz),
  (39, '2026-10-03T06:03:51Z'::timestamptz),
  (40, '2026-10-03T06:03:51Z'::timestamptz)
),
acc AS (SELECT id FROM "accounts" WHERE slug = 'la-poste-pstng'),
imp AS (SELECT max(a.created_at) AS at FROM "audit_logs" a, acc WHERE a.entity_type = 'account' AND a.entity_id = acc.id AND a.action = 'import')
UPDATE "cards" c SET "content_updated_at" = GREATEST(
  n.edited,
  COALESCE((SELECT max(l.created_at) FROM "audit_logs" l, imp
            WHERE l.entity_type = 'card' AND l.entity_id = c.id AND l.action IN ('update', 'move')
              AND l.created_at > COALESCE(imp.at, '-infinity'::timestamptz)), n.edited)
)
FROM notion n, acc
WHERE c.account_id = acc.id AND c.ref = n.ref;
