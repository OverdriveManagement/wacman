ALTER TABLE "bridge_members" ALTER COLUMN "notify" SET DEFAULT 'NONE';--> statement-breakpoint
-- WiBridge : par défaut, aucun e-mail de notification (chacun l'active dans Mon compte). Les accès ouverts avant ce
-- changement, encore sur l'ancien réglage par défaut, passent aussi à « Aucun e-mail » (une seule fois, avec la migration).
UPDATE "bridge_members" SET "notify" = 'NONE' WHERE "notify" = 'IMMEDIATE';
