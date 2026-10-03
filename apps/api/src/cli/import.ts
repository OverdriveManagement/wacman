/**
 * Import d'un fichier de compte en ligne de commande (développement ou maintenance).
 * Usage : DATABASE_URL=... node dist/cli/import.js chemin/vers/compte.json [email-super-admin]
 */
import "../env.js";
import { readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import { db, T, importAccount, runMigrations, toSessionUser, getPool } from "@wacman/core";

const here = path.dirname(fileURLToPath(import.meta.url));

async function main() {
  const [file, email] = process.argv.slice(2);
  if (!file) throw new Error("Usage : import <fichier.json> [email-super-admin]");
  await runMigrations(process.env.MIGRATIONS_DIR ?? path.resolve(here, "../../../../packages/core/drizzle"));
  const [admin] = email
    ? await db.select().from(T.users).where(eq(T.users.email, email.toLowerCase()))
    : await db.select().from(T.users).where(eq(T.users.isSuperAdmin, true)).limit(1);
  if (!admin) throw new Error("Aucun super-administrateur trouvé : démarrez l'API une fois avec BOOTSTRAP_ADMIN_EMAIL / BOOTSTRAP_ADMIN_PASSWORD.");
  const res = await importAccount(toSessionUser(admin), JSON.parse(readFileSync(file, "utf8")));
  console.log(JSON.stringify(res, null, 2));
  await getPool().end();
}

main().catch(async (e) => {
  console.error(e?.details ? JSON.stringify(e.details, null, 2) : e);
  process.exit(1);
});
