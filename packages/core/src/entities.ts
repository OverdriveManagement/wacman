import { z } from "zod";
import { and, eq, inArray, asc, desc, sql, type SQL } from "drizzle-orm";
import type { PgTable } from "drizzle-orm/pg-core";
import { db } from "./db.js";
import * as T from "./schema.js";
import { assertRole, badRequest, notFound, type Ctx, type Role } from "./context.js";
import { audit, diff } from "./audit.js";

/**
 * Registre générique des entités éditables d'un compte client.
 * Les routes REST et l'assistant Claude passent tous deux par ce registre,
 * ce qui garantit les mêmes contrôles de droits, la même validation et la même traçabilité.
 */

const str = z.string().max(20000);
const optStr = str.optional();
const idOrNull = z.string().min(1).nullable().optional();
const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Format attendu AAAA-MM-JJ").nullable().optional();
const color = z.enum(["blue", "teal", "ocre", "red", "amber", "slate", "violet", "green"]).optional();

export interface EntityDef {
  model: string; // nom de table dans TABLES
  label: string; // libellé français
  parent: "account" | "meeting";
  editRole: Role;
  titleField: string;
  dateFields: string[];
  create: z.ZodObject<z.ZodRawShape>;
  orderBy?: [string, "asc" | "desc"][];
  description: string; // pour l'assistant
}

export const ENTITIES = {
  stream: {
    model: "stream",
    label: "Stream",
    parent: "account",
    editRole: "ADMIN",
    titleField: "name",
    dateFields: [],
    orderBy: [["order", "asc"], ["name", "asc"]],
    description: "Stream (chantier) du programme : nom, emoji, leader, prescripteur côté client, ordre, affichages.",
    create: z.object({
      name: str.min(1),
      emoji: optStr,
      leader: optStr,
      prescriber: optStr,
      order: z.number().int().optional(),
      active: z.boolean().optional(),
      inKanban: z.boolean().optional(),
      inStatusTemplate: z.boolean().optional(),
      inDirectory: z.boolean().optional(),
    }),
  },
  sprint: {
    model: "sprint",
    label: "Sprint",
    parent: "account",
    editRole: "ADMIN",
    titleField: "name",
    dateFields: ["startDate", "endDate"],
    orderBy: [["order", "asc"], ["startDate", "asc"]],
    description: "Sprint : nom, dates, état (UPCOMING, CURRENT, DONE), objectif, échéance client.",
    create: z.object({
      name: str.min(1),
      startDate: dateStr,
      endDate: dateStr,
      state: z.enum(["UPCOMING", "CURRENT", "DONE"]).optional(),
      objective: optStr,
      clientMilestone: optStr,
      order: z.number().int().optional(),
    }),
  },
  option: {
    model: "option",
    label: "Valeur de liste",
    parent: "account",
    editRole: "ADMIN",
    titleField: "label",
    dateFields: [],
    orderBy: [["kind", "asc"], ["order", "asc"]],
    description: "Valeur d'une liste configurable (statuts du kanban, niveaux d'alerte, types de faits marquants, etc.).",
    create: z.object({
      kind: z.enum([
        "CARD_STATUS",
        "ALERT_LEVEL",
        "HIGHLIGHT_TYPE",
        "STREAM_STATUS",
        "TOPIC_THEME",
        "TOPIC_NATURE",
        "RISK_TYPE",
        "RISK_STATUS",
        "RISK_CRITICALITY",
      ]),
      label: str.min(1),
      emoji: optStr,
      color,
      order: z.number().int().optional(),
      meta: z.record(z.unknown()).optional(),
    }),
  },
  meetingType: {
    model: "meetingType",
    label: "Type de séance",
    parent: "account",
    editRole: "ADMIN",
    titleField: "name",
    dateFields: [],
    orderBy: [["order", "asc"]],
    description: "Type de séance (ex. Program weekly) : nom, fréquence, cadrage, mode d'emploi, blocs (HIGHLIGHTS, STREAM_STATUS, TOPICS saisis par séance ; ALERT_CARDS et PLANNING : cartes en vigilance ou alerte et planning des cartes, vues à date).",
    create: z.object({
      name: str.min(1),
      emoji: optStr,
      frequency: optStr,
      description: optStr,
      guide: optStr,
      blocks: z.array(z.enum(T.MEETING_BLOCKS)).min(1),
      order: z.number().int().optional(),
      settings: z.record(z.unknown()).optional(),
      active: z.boolean().optional(),
    }),
  },
  governance: {
    model: "governance",
    label: "Instance de gouvernance",
    parent: "account",
    editRole: "ADMIN",
    titleField: "name",
    dateFields: [],
    orderBy: [["scope", "asc"], ["order", "asc"]],
    description: "Ligne de comitologie (scope INTERNAL ou JOINT) : instance, finalité, participants, fréquence, support / piloté par.",
    create: z.object({
      scope: z.enum(["INTERNAL", "JOINT"]),
      name: str.min(1),
      purpose: optStr,
      participants: optStr,
      frequency: optStr,
      support: optStr,
      order: z.number().int().optional(),
    }),
  },
  contact: {
    model: "contact",
    label: "Contact",
    parent: "account",
    editRole: "EDITOR",
    titleField: "name",
    dateFields: [],
    orderBy: [["name", "asc"]],
    description: "Contact de l'annuaire du compte (porteur de cartes, auteur de faits marquants).",
    create: z.object({
      name: str.min(1),
      email: optStr,
      company: optStr,
      role: optStr,
      userId: idOrNull,
    }),
  },
  card: {
    model: "card",
    label: "Carte",
    parent: "account",
    editRole: "EDITOR",
    titleField: "title",
    dateFields: ["startDate", "dueDate"],
    orderBy: [["position", "asc"], ["ref", "asc"]],
    description:
      "Livrable (carte du kanban) : titre, emoji, description, point d'avancement (progressNote), prochaines étapes (nextSteps), alertes / arbitrages (alertsNote), début prévu (startDate) et échéance (dueDate) pour le planning, avancement % (progressPct), stream, sprint, statut (statusId, option CARD_STATUS), niveau d'alerte (alertLevelId, option ALERT_LEVEL), porteur (ownerId, contact).",
    create: z.object({
      title: str.min(1),
      emoji: optStr,
      description: optStr,
      progressNote: optStr,
      nextSteps: optStr,
      alertsNote: optStr,
      startDate: dateStr,
      dueDate: dateStr,
      progressPct: z.number().int().min(0).max(100).nullable().optional(),
      position: z.number().optional(),
      streamId: idOrNull,
      sprintId: idOrNull,
      statusId: idOrNull,
      alertLevelId: idOrNull,
      ownerId: idOrNull,
      archived: z.boolean().optional(),
    }),
  },
  meeting: {
    model: "meeting",
    label: "Séance",
    parent: "account",
    editRole: "EDITOR",
    titleField: "date",
    dateFields: ["date"],
    orderBy: [["date", "desc"]],
    description: "Séance d'un type de séance, à une date donnée.",
    create: z.object({
      meetingTypeId: z.string().min(1),
      date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
      notes: optStr,
    }),
  },
  highlight: {
    model: "highlight",
    label: "Fait marquant",
    parent: "meeting",
    editRole: "EDITOR",
    titleField: "title",
    dateFields: [],
    orderBy: [["order", "asc"], ["createdAt", "asc"]],
    description: "Fait marquant d'une séance : titre, emoji, détail, stream, type (typeId, option HIGHLIGHT_TYPE), auteur (authorId, contact), ordre.",
    create: z.object({
      meetingId: z.string().min(1),
      title: str.min(1),
      emoji: optStr,
      detail: optStr,
      streamId: idOrNull,
      typeId: idOrNull,
      authorId: idOrNull,
      order: z.number().int().optional(),
    }),
  },
  streamStatus: {
    model: "streamStatus",
    label: "Statut de stream",
    parent: "meeting",
    editRole: "EDITOR",
    titleField: "progress",
    dateFields: [],
    orderBy: [["order", "asc"]],
    description: "Ligne de statut d'un stream dans une séance : stream, statuts (statusIds, options STREAM_STATUS), avancement, alertes et prérequis.",
    create: z.object({
      meetingId: z.string().min(1),
      streamId: idOrNull,
      statusIds: z.array(z.string()).optional(),
      progress: optStr,
      alerts: optStr,
      order: z.number().int().optional(),
    }),
  },
  topic: {
    model: "topic",
    label: "Sujet",
    parent: "meeting",
    editRole: "EDITOR",
    titleField: "title",
    dateFields: [],
    orderBy: [["order", "asc"], ["createdAt", "asc"]],
    description:
      "Sujet présenté en séance : titre, emoji, thématique (themeId, option TOPIC_THEME), nature (natureId, option TOPIC_NATURE), description, arbitrage ou décision demandée (decisionRequest, avec lignes « Décision : … »), ordre de passage.",
    create: z.object({
      meetingId: z.string().min(1),
      title: str.min(1),
      emoji: optStr,
      themeId: idOrNull,
      natureId: idOrNull,
      description: optStr,
      decisionRequest: optStr,
      order: z.number().int().optional(),
    }),
  },
  risk: {
    model: "risk",
    label: "Risque ou arbitrage",
    parent: "account",
    editRole: "EDITOR",
    titleField: "title",
    dateFields: ["dueDate", "openedAt"],
    orderBy: [["openedAt", "desc"], ["createdAt", "desc"]],
    description:
      "Risque ou arbitrage : titre, type (typeId), statut (statusId), criticité (criticalityId), stream, description, décision / mitigation, instance, échéance, ouvert le, porteur, cartes liées (cardIds).",
    create: z.object({
      title: str.min(1),
      typeId: idOrNull,
      statusId: idOrNull,
      criticalityId: idOrNull,
      streamId: idOrNull,
      description: optStr,
      mitigation: optStr,
      instance: optStr,
      dueDate: dateStr,
      openedAt: dateStr,
      ownerId: idOrNull,
      cardIds: z.array(z.string()).optional(),
    }),
  },
} satisfies Record<string, EntityDef>;

export type EntityName = keyof typeof ENTITIES;

// eslint-disable-next-line @typescript-eslint/no-explicit-any
type AnyTable = PgTable & Record<string, any>;

export const TABLES: Record<string, AnyTable> = {
  stream: T.streams,
  sprint: T.sprints,
  option: T.options,
  meetingType: T.meetingTypes,
  governance: T.governanceBodies,
  contact: T.contacts,
  card: T.cards,
  meeting: T.meetings,
  highlight: T.highlights,
  streamStatus: T.streamStatuses,
  topic: T.topics,
  risk: T.risks,
} as Record<string, AnyTable>;

export function getEntity(name: string): EntityDef {
  const def = (ENTITIES as Record<string, EntityDef>)[name];
  if (!def) throw badRequest(`Type d'élément inconnu : ${name}`);
  return def;
}

const table = (def: EntityDef) => TABLES[def.model];

function orderClauses(def: EntityDef) {
  const t = table(def);
  return (def.orderBy ?? []).map(([col, dir]) => (dir === "asc" ? asc(t[col]) : desc(t[col])));
}

async function withCardIds(rows: Record<string, unknown>[]): Promise<Record<string, unknown>[]> {
  if (!rows.length) return rows;
  const links = await db
    .select()
    .from(T.riskCards)
    .where(inArray(T.riskCards.riskId, rows.map((r) => r.id as string)));
  return rows.map((r) => ({ ...r, cardIds: links.filter((l) => l.riskId === r.id).map((l) => l.cardId) }));
}

/** Vérifie que les références (stream, sprint, option, contact, séance...) appartiennent bien au compte. */
function checkCardDates(c: Record<string, unknown>) {
  if (typeof c.startDate === "string" && typeof c.dueDate === "string" && c.startDate > c.dueDate) {
    throw badRequest("Le début prévu doit précéder l'échéance.");
  }
}

/** Liste de valeurs attendue pour chaque champ d'option, selon le type d'élément. */
const OPTION_FIELD_KIND: Record<string, Record<string, string>> = {
  card: { statusId: "CARD_STATUS", alertLevelId: "ALERT_LEVEL" },
  highlight: { typeId: "HIGHLIGHT_TYPE" },
  topic: { themeId: "TOPIC_THEME", natureId: "TOPIC_NATURE" },
  risk: { typeId: "RISK_TYPE", statusId: "RISK_STATUS", criticalityId: "RISK_CRITICALITY" },
  streamStatus: { statusIds: "STREAM_STATUS" },
};

async function checkRefs(ctx: Ctx, data: Record<string, unknown>, model?: string) {
  const checks: [string, string][] = [
    ["streamId", "stream"],
    ["sprintId", "sprint"],
    ["ownerId", "contact"],
    ["authorId", "contact"],
    ["meetingId", "meeting"],
    ["meetingTypeId", "meetingType"],
    ["statusId", "option"],
    ["alertLevelId", "option"],
    ["typeId", "option"],
    ["themeId", "option"],
    ["natureId", "option"],
    ["criticalityId", "option"],
  ];
  const kinds = (model && OPTION_FIELD_KIND[model]) || {};
  for (const [field, ref] of checks) {
    const v = data[field];
    if (typeof v === "string" && v) {
      if (!isUuid(v)) throw badRequest(`Référence invalide pour ${field} : « ${v} » n'est pas un identifiant.`);
      if (ref === "option") {
        const [o] = await db
          .select({ id: T.options.id, kind: T.options.kind })
          .from(T.options)
          .where(and(eq(T.options.id, v), eq(T.options.accountId, ctx.accountId)))
          .limit(1);
        if (!o) throw badRequest(`Référence invalide pour ${field} : ${v}`);
        if (kinds[field] && o.kind !== kinds[field]) throw badRequest(`Valeur de liste inadaptée pour ${field} : une valeur ${kinds[field]} est attendue.`);
        continue;
      }
      const t = TABLES[ref];
      const found = await db.select({ id: t.id }).from(t).where(and(eq(t.id, v), eq(t.accountId, ctx.accountId))).limit(1);
      if (!found.length) throw badRequest(`Référence invalide pour ${field} : ${v}`);
    }
  }
  for (const field of ["statusIds", "cardIds"]) {
    const arr = data[field];
    if (Array.isArray(arr) && arr.length) {
      if (!arr.every((x) => typeof x === "string" && isUuid(x))) throw badRequest(`Références invalides dans ${field}.`);
      const t = field === "statusIds" ? T.options : T.cards;
      const conds = [inArray(t.id, arr as string[]), eq(t.accountId, ctx.accountId)];
      if (field === "statusIds" && kinds.statusIds) conds.push(eq(T.options.kind, kinds.statusIds as (typeof T.OPTION_KINDS)[number]));
      const [{ n }] = await db
        .select({ n: sql<number>`count(*)::int` })
        .from(t)
        .where(and(...conds));
      if (n !== new Set(arr).size) throw badRequest(`Références invalides dans ${field}.`);
    }
  }
}

function isUuid(v: string) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
}

export async function listEntities(ctx: Ctx, name: string, filters: Record<string, string | boolean> = {}) {
  const def = getEntity(name);
  const t = table(def);
  const conds: SQL[] = [eq(t.accountId, ctx.accountId)];
  for (const [k, v] of Object.entries(filters)) if (k in t) conds.push(eq(t[k], v));
  const rows = (await db.select().from(t).where(and(...conds)).orderBy(...orderClauses(def))) as Record<string, unknown>[];
  return def.model === "risk" ? withCardIds(rows) : rows;
}

export async function getEntityRow(ctx: Ctx, name: string, id: string): Promise<Record<string, unknown>> {
  const def = getEntity(name);
  if (!isUuid(id)) throw notFound(`${def.label} introuvable.`);
  const t = table(def);
  const [row] = (await db.select().from(t).where(and(eq(t.id, id), eq(t.accountId, ctx.accountId))).limit(1)) as Record<string, unknown>[];
  if (!row) throw notFound(`${def.label} introuvable.`);
  return def.model === "risk" ? (await withCardIds([row]))[0] : row;
}

export async function createEntity(ctx: Ctx, name: string, input: unknown) {
  const def = getEntity(name);
  assertRole(ctx, def.editRole);
  const parsed = def.create.safeParse(input);
  if (!parsed.success) throw badRequest("Données invalides.", parsed.error.flatten());
  const data = { ...(parsed.data as Record<string, unknown>) };
  if (def.model === "card") checkCardDates(data);
  await checkRefs(ctx, data, def.model);
  const cardIds = data.cardIds as string[] | undefined;
  delete data.cardIds;
  const t = table(def);

  const row = await db.transaction(async (tx) => {
    const values: Record<string, unknown> = { ...data, accountId: ctx.accountId };
    if (def.model === "card") {
      const [acc] = await tx
        .update(T.accounts)
        .set({ nextCardRef: sql`${T.accounts.nextCardRef} + 1` })
        .where(eq(T.accounts.id, ctx.accountId))
        .returning({ next: T.accounts.nextCardRef });
      values.ref = acc.next - 1;
      values.updatedById = ctx.user.id;
      if (values.position === undefined) {
        const [{ max }] = await tx
          .select({ max: sql<number | null>`max(${T.cards.position})` })
          .from(T.cards)
          .where(eq(T.cards.accountId, ctx.accountId));
        values.position = (max ?? 0) + 1;
      }
    }
    const [r] = (await tx.insert(t).values(values).returning()) as Record<string, unknown>[];
    if (def.model === "risk" && cardIds?.length) {
      await tx.insert(T.riskCards).values(cardIds.map((cardId) => ({ riskId: r.id as string, cardId })));
    }
    await audit(ctx, name, r.id as string, "create", `${def.label} créé(e) : ${String(r[def.titleField] ?? "").slice(0, 120)}`, {}, tx);
    return r;
  });
  return def.model === "risk" ? (await withCardIds([row]))[0] : row;
}

export async function updateEntity(ctx: Ctx, name: string, id: string, input: unknown) {
  const def = getEntity(name);
  assertRole(ctx, def.editRole);
  const before = await getEntityRow(ctx, name, id);
  const schema = def.parent === "meeting" ? def.create.partial().omit({ meetingId: true }) : def.create.partial();
  const parsed = schema.safeParse(input);
  if (!parsed.success) throw badRequest("Données invalides.", parsed.error.flatten());
  const data = { ...(parsed.data as Record<string, unknown>) };
  if (name === "option" && "kind" in data && data.kind !== before.kind) throw badRequest("Le type d'une liste ne peut pas changer.");
  if (name === "meeting") delete data.meetingTypeId;
  if (def.model === "card") checkCardDates({ ...before, ...data });
  await checkRefs(ctx, data, def.model);
  const cardIds = data.cardIds as string[] | undefined;
  delete data.cardIds;
  if (def.model === "card") data.updatedById = ctx.user.id;
  const t = table(def);

  const row = await db.transaction(async (tx) => {
    let r = before;
    if (Object.keys(data).length) {
      [r] = (await tx.update(t).set(data).where(eq(t.id, id)).returning()) as Record<string, unknown>[];
    }
    if (def.model === "risk" && cardIds) {
      await tx.delete(T.riskCards).where(eq(T.riskCards.riskId, id));
      if (cardIds.length) await tx.insert(T.riskCards).values(cardIds.map((cardId) => ({ riskId: id, cardId })));
      r = { ...r, cardIds };
    }
    const after = def.model === "risk" && !cardIds ? { ...r, cardIds: before.cardIds } : r;
    const changes = diff(before, after);
    if (Object.keys(changes).length) {
      await audit(ctx, name, id, "update", `${def.label} modifié(e) : ${String(after[def.titleField] ?? "").slice(0, 120)}`, changes, tx);
    }
    return after;
  });
  return row;
}

export async function deleteEntity(ctx: Ctx, name: string, id: string) {
  const def = getEntity(name);
  assertRole(ctx, def.editRole);
  const before = await getEntityRow(ctx, name, id);
  if (name === "option") {
    const [{ n }] = await db
      .select({ n: sql<number>`count(*)::int` })
      .from(T.cards)
      .where(and(eq(T.cards.accountId, ctx.accountId), sql`(${T.cards.statusId} = ${id} or ${T.cards.alertLevelId} = ${id})`));
    if (n) throw badRequest(`Cette valeur est utilisée par ${n} carte(s) : modifiez-les d'abord.`);
  }
  const t = table(def);
  await db.transaction(async (tx) => {
    await tx.delete(t).where(eq(t.id, id));
    await audit(ctx, name, id, "delete", `${def.label} supprimé(e) : ${String(before[def.titleField] ?? "").slice(0, 120)}`, {}, tx);
  });
  return { ok: true };
}

/** Réordonne une liste d'éléments (champ order ou position). */
export async function reorderEntities(ctx: Ctx, name: string, ids: string[]) {
  const def = getEntity(name);
  assertRole(ctx, def.editRole);
  const t = table(def);
  const field = def.model === "card" ? "position" : "order";
  await db.transaction(async (tx) => {
    for (const [i, id] of ids.entries()) {
      if (!isUuid(id)) continue;
      await tx
        .update(t)
        .set({ [field]: i + 1 })
        .where(and(eq(t.id, id), eq(t.accountId, ctx.accountId)));
    }
  });
  return { ok: true };
}
