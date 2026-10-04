import { z } from "zod";
import { and, asc, eq } from "drizzle-orm";
import { db } from "../db.js";
import * as T from "../schema.js";
import { assertRole, badRequest, forbidden, notFound, type Ctx, type SessionUser } from "../context.js";
import { defaultMeetingTypes, defaultModules, defaultOptions, defaultSettings, type AccountSettings } from "../defaults.js";
import { audit } from "../audit.js";
import { listEntities } from "../entities.js";

export async function listAccountsForUser(user: SessionUser) {
  const all = await db.select().from(T.accounts).orderBy(asc(T.accounts.archived), asc(T.accounts.name));
  const mine = await db.select().from(T.memberships).where(eq(T.memberships.userId, user.id));
  const roleOf = new Map(mine.map((m) => [m.accountId, m.role]));
  return all
    .filter((a) => user.isSuperAdmin || roleOf.has(a.id))
    .map((a) => ({
      id: a.id,
      slug: a.slug,
      name: a.name,
      clientName: a.clientName,
      emoji: a.emoji,
      description: a.description,
      archived: a.archived,
      modules: a.modules,
      role: user.isSuperAdmin ? "ADMIN" : roleOf.get(a.id) ?? "VIEWER",
    }));
}

export const freshnessSchema = z.object({
  enabled: z.boolean(),
  hideDone: z.boolean(),
  levels: z
    .array(
      z.object({
        maxDays: z.number().int().min(0).max(3650).nullable(),
        emoji: z.string().max(8),
        color: z.string().max(20),
        label: z.string().max(40),
      }),
    )
    .min(1)
    .max(6)
    .refine((l) => l[l.length - 1].maxDays === null && l.slice(0, -1).every((x, i, a) => x.maxDays !== null && (i === 0 || x.maxDays > (a[i - 1].maxDays as number))), {
      message: "Paliers croissants, le dernier sans limite.",
    }),
});

export function mergeSettings(clientName: string, stored: Record<string, unknown> | null | undefined): AccountSettings {
  const d = defaultSettings(clientName);
  const s = (stored ?? {}) as Partial<AccountSettings>;
  const f = freshnessSchema.safeParse(s.freshness);
  return { ...d, ...s, labels: { ...d.labels, ...(s.labels ?? {}) }, freshness: f.success ? f.data : d.freshness };
}

/** Tout ce dont l'interface a besoin pour afficher un compte : configuration et référentiels. */
export async function getAccountBootstrap(ctx: Ctx) {
  const [account] = await db.select().from(T.accounts).where(eq(T.accounts.id, ctx.accountId));
  if (!account) throw notFound();
  const [streams, sprints, options, meetingTypes, contacts, governance] = await Promise.all([
    listEntities(ctx, "stream"),
    listEntities(ctx, "sprint"),
    listEntities(ctx, "option"),
    listEntities(ctx, "meetingType"),
    listEntities(ctx, "contact"),
    listEntities(ctx, "governance"),
  ]);
  return {
    account: {
      id: account.id,
      slug: account.slug,
      name: account.name,
      clientName: account.clientName,
      clientShortName: account.clientShortName,
      emoji: account.emoji,
      description: account.description,
      modules: { ...defaultModules, ...account.modules },
      settings: mergeSettings(account.clientName, account.settings),
      archived: account.archived,
    },
    role: ctx.role,
    streams,
    sprints,
    options,
    meetingTypes,
    contacts,
    governance,
  };
}

export const slugify = (s: string) =>
  s
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "")
    .slice(0, 40);

export const accountCreateSchema = z.object({
  name: z.string().min(1).max(120),
  clientName: z.string().min(1).max(80),
  clientShortName: z.string().min(1).max(20),
  emoji: z.string().max(8).optional(),
  description: z.string().max(2000).optional(),
  slug: z
    .string()
    .regex(/^[a-z0-9-]{2,40}$/)
    .optional(),
  duplicateFromAccountId: z.string().uuid().optional(),
});

/** Crée un compte client, vide (configuration par défaut) ou en dupliquant la configuration d'un compte existant. */
export async function createAccount(user: SessionUser, input: unknown) {
  if (!user.isSuperAdmin) throw forbidden("Seul un super-administrateur peut créer un compte client.");
  const parsed = accountCreateSchema.safeParse(input);
  if (!parsed.success) throw badRequest("Données invalides.", parsed.error.flatten());
  const d = parsed.data;
  let slug = d.slug ?? (slugify(d.name) || "compte");
  const base = slug;
  for (let i = 2; ; i++) {
    const [exists] = await db.select({ id: T.accounts.id }).from(T.accounts).where(eq(T.accounts.slug, slug));
    if (!exists) break;
    slug = `${base}-${i}`;
  }

  const account = await db.transaction(async (tx) => {
    let src: typeof T.accounts.$inferSelect | undefined;
    if (d.duplicateFromAccountId) {
      [src] = await tx.select().from(T.accounts).where(eq(T.accounts.id, d.duplicateFromAccountId));
      if (!src) throw notFound("Compte source introuvable.");
    }
    const [acc] = await tx
      .insert(T.accounts)
      .values({
        slug,
        name: d.name,
        clientName: d.clientName,
        clientShortName: d.clientShortName,
        emoji: d.emoji ?? src?.emoji ?? "📁",
        description: d.description ?? "",
        modules: src?.modules ?? defaultModules,
        settings: src ? src.settings : (defaultSettings(d.clientName) as unknown as Record<string, unknown>),
      })
      .returning();

    if (src) {
      const sid = src.id;
      const [opts, strs, sps, mts, gov] = await Promise.all([
        tx.select().from(T.options).where(eq(T.options.accountId, sid)),
        tx.select().from(T.streams).where(eq(T.streams.accountId, sid)),
        tx.select().from(T.sprints).where(eq(T.sprints.accountId, sid)),
        tx.select().from(T.meetingTypes).where(eq(T.meetingTypes.accountId, sid)),
        tx.select().from(T.governanceBodies).where(eq(T.governanceBodies.accountId, sid)),
      ]);
      const strip = <R extends { id: string; accountId: string; createdAt: Date }>(r: R) => {
        // eslint-disable-next-line @typescript-eslint/no-unused-vars
        const { id, accountId, createdAt, ...rest } = r as R & { updatedAt?: Date };
        delete (rest as { updatedAt?: Date }).updatedAt;
        return { ...rest, accountId: acc.id };
      };
      if (opts.length) await tx.insert(T.options).values(opts.map(strip));
      if (strs.length) await tx.insert(T.streams).values(strs.map((s) => ({ ...strip(s), leader: "", prescriber: "" })));
      if (sps.length) await tx.insert(T.sprints).values(sps.map((s) => ({ ...strip(s), clientMilestone: "" })));
      if (mts.length) await tx.insert(T.meetingTypes).values(mts.map(strip));
      if (gov.length) await tx.insert(T.governanceBodies).values(gov.map(strip));
    } else {
      const opts = Object.entries(defaultOptions).flatMap(([kind, list]) =>
        list.map((o, idx) => ({
          accountId: acc.id,
          kind: kind as (typeof T.OPTION_KINDS)[number],
          label: o.label,
          emoji: o.emoji ?? "",
          color: o.color ?? "slate",
          order: idx + 1,
          meta: o.meta ?? {},
        })),
      );
      await tx.insert(T.options).values(opts);
      await tx.insert(T.meetingTypes).values(
        defaultMeetingTypes.map((m, idx) => ({
          accountId: acc.id,
          name: m.name,
          emoji: m.emoji,
          frequency: m.frequency,
          description: m.description,
          guide: m.guide,
          blocks: [...m.blocks],
          order: idx + 1,
          settings: m.settings,
        })),
      );
    }
    await audit({ user, accountId: acc.id }, "account", acc.id, "create", `Compte client créé : ${acc.name}${src ? ` (configuration de ${src.name})` : ""}`, {}, tx);
    return acc;
  });
  return account;
}

export const accountUpdateSchema = z.object({
  name: z.string().min(1).max(120).optional(),
  clientName: z.string().min(1).max(80).optional(),
  clientShortName: z.string().min(1).max(20).optional(),
  emoji: z.string().max(8).optional(),
  description: z.string().max(2000).optional(),
  modules: z.object({ program: z.boolean(), finance: z.boolean(), provisioning: z.boolean() }).partial().optional(),
  settings: z.record(z.unknown()).optional(),
  archived: z.boolean().optional(),
});

export async function updateAccount(ctx: Ctx, input: unknown) {
  assertRole(ctx, "ADMIN");
  const parsed = accountUpdateSchema.safeParse(input);
  if (!parsed.success) throw badRequest("Données invalides.", parsed.error.flatten());
  const d = parsed.data;
  if (d.archived !== undefined && !ctx.user.isSuperAdmin) throw forbidden("Seul un super-administrateur peut archiver un compte.");
  const [current] = await db.select().from(T.accounts).where(eq(T.accounts.id, ctx.accountId));
  const data: Partial<typeof T.accounts.$inferInsert> = { ...d } as never;
  if (d.modules) data.modules = { ...defaultModules, ...current.modules, ...d.modules };
  if (d.settings?.freshness !== undefined && !freshnessSchema.safeParse(d.settings.freshness).success) throw badRequest("Paliers de fraîcheur invalides.");
  if (d.settings) {
    const cur = current.settings ?? {};
    const next: Record<string, unknown> = { ...cur, ...d.settings };
    if (d.settings.labels) next.labels = { ...((cur.labels as object) ?? {}), ...(d.settings.labels as object) };
    data.settings = next;
  }
  const [updated] = await db.update(T.accounts).set(data).where(eq(T.accounts.id, ctx.accountId)).returning();
  await audit(ctx, "account", ctx.accountId, "update", "Configuration du compte modifiée", { fields: Object.keys(d) });
  return updated;
}

/** Utilisé par l'assistant et les exports : options d'un compte par type. */
export async function optionsByKind(accountId: string) {
  const rows = await db.select().from(T.options).where(eq(T.options.accountId, accountId)).orderBy(asc(T.options.order));
  const map = new Map(rows.map((o) => [o.id, o]));
  const byKind = (k: (typeof T.OPTION_KINDS)[number]) => rows.filter((o) => o.kind === k);
  return { rows, map, byKind };
}

export async function getAccountRow(accountId: string) {
  const [a] = await db.select().from(T.accounts).where(and(eq(T.accounts.id, accountId)));
  if (!a) throw notFound("Compte client introuvable.");
  return a;
}
