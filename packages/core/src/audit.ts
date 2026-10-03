import { db, type Tx } from "./db.js";
import { auditLogs } from "./schema.js";
import type { Ctx } from "./context.js";

const IGNORED = new Set(["updatedAt", "createdAt", "updatedById", "position"]);

function norm(v: unknown): unknown {
  if (v instanceof Date) return v.toISOString().slice(0, 10);
  if (Array.isArray(v)) return JSON.stringify(v);
  if (v && typeof v === "object") return JSON.stringify(v);
  return v ?? null;
}

/** Différence champ à champ entre deux versions d'un enregistrement. */
export function diff(before: Record<string, unknown>, after: Record<string, unknown>) {
  const changes: Record<string, [unknown, unknown]> = {};
  for (const k of Object.keys(after)) {
    if (IGNORED.has(k)) continue;
    const a = norm(before[k]);
    const b = norm(after[k]);
    if (a !== b) changes[k] = [a, b];
  }
  return changes;
}

export async function audit(
  ctx: Ctx | { user: { id: string; name: string }; accountId: string | null; viaAssistant?: boolean },
  entityType: string,
  entityId: string,
  action: string,
  summary: string,
  changes: Record<string, unknown> = {},
  tx: Tx = db,
) {
  await tx.insert(auditLogs).values({
    accountId: ctx.accountId,
    entityType,
    entityId,
    action,
    summary,
    changes,
    userId: ctx.user.id,
    userName: ctx.user.name,
    viaAssistant: !!ctx.viaAssistant,
  });
}
