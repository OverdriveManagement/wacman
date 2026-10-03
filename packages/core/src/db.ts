import pg from "pg";
import { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
import { migrate } from "drizzle-orm/node-postgres/migrator";
import * as schema from "./schema.js";

export type DB = NodePgDatabase<typeof schema>;
// Transaction ou base : même API de requêtes
export type Tx = Parameters<Parameters<DB["transaction"]>[0]>[0] | DB;

const globalForDb = globalThis as unknown as { pool?: pg.Pool; db?: DB };

function makePool() {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL manquant");
  const ssl = /sslmode=require|proxy\.rlwy\.net/.test(url) ? { rejectUnauthorized: false } : undefined;
  return new pg.Pool({ connectionString: url, max: Number(process.env.DB_POOL_MAX ?? 8), ssl });
}

export function getPool(): pg.Pool {
  if (!globalForDb.pool) globalForDb.pool = makePool();
  return globalForDb.pool;
}

export const db: DB = new Proxy({} as DB, {
  get(_t, prop) {
    if (!globalForDb.db) globalForDb.db = drizzle(getPool(), { schema });
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    return (globalForDb.db as any)[prop];
  },
});

/** Applique les migrations SQL (dossier drizzle/) au démarrage de l'API. */
export async function runMigrations(migrationsFolder: string) {
  const d = drizzle(getPool(), { schema });
  await migrate(d, { migrationsFolder });
}

export { schema };
