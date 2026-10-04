import { z } from "zod";
import { randomUUID } from "node:crypto";
import { asc, eq, inArray, sql } from "drizzle-orm";
import { db } from "../db.js";
import * as T from "../schema.js";
import { badRequest, forbidden, type SessionUser } from "../context.js";
import { audit } from "../audit.js";
import { defaultModules, defaultSettings } from "../defaults.js";

/**
 * Format d'échange « wacman-account-v1 » : export complet d'un compte client
 * (configuration + données), réimportable. Les liens entre objets passent par des clés (key).
 */

const opt = z.string().optional().nullable();
const keyRef = z.string().optional().nullable();

export const accountFileSchema = z.object({
  format: z.literal("wacman-account-v1"),
  account: z.object({
    slug: z.string().regex(/^[a-z0-9-]{2,40}$/),
    name: z.string(),
    clientName: z.string(),
    clientShortName: z.string(),
    emoji: opt,
    description: opt,
    modules: z.record(z.boolean()).optional(),
    settings: z.record(z.unknown()).optional(),
  }),
  options: z.array(
    z.object({ key: z.string(), kind: z.string(), label: z.string(), emoji: opt, color: opt, order: z.number().optional(), meta: z.record(z.unknown()).optional() }),
  ),
  streams: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      emoji: opt,
      leader: opt,
      prescriber: opt,
      order: z.number().optional(),
      active: z.boolean().optional(),
      inKanban: z.boolean().optional(),
      inStatusTemplate: z.boolean().optional(),
      inDirectory: z.boolean().optional(),
    }),
  ),
  sprints: z.array(
    z.object({ key: z.string(), name: z.string(), startDate: opt, endDate: opt, state: z.enum(["UPCOMING", "CURRENT", "DONE"]).optional(), objective: opt, clientMilestone: opt, order: z.number().optional() }),
  ),
  contacts: z.array(z.object({ key: z.string(), name: z.string(), email: opt, company: opt, role: opt })),
  meetingTypes: z.array(
    z.object({
      key: z.string(),
      name: z.string(),
      emoji: opt,
      frequency: opt,
      description: opt,
      guide: opt,
      blocks: z.array(z.enum(T.MEETING_BLOCKS)),
      order: z.number().optional(),
      settings: z.record(z.unknown()).optional(),
    }),
  ),
  governance: z.array(
    z.object({ scope: z.enum(["INTERNAL", "JOINT"]), name: z.string(), purpose: opt, participants: opt, frequency: opt, support: opt, order: z.number().optional() }),
  ),
  cards: z.array(
    z.object({
      ref: z.number().int(),
      title: z.string(),
      emoji: opt,
      description: opt,
      progressNote: opt,
      nextSteps: opt,
      alertsNote: opt,
      startDate: opt,
      dueDate: opt,
      progressPct: z.number().nullable().optional(),
      position: z.number().optional(),
      stream: keyRef,
      sprint: keyRef,
      status: keyRef,
      alertLevel: keyRef,
      owner: keyRef,
      archived: z.boolean().optional(),
      createdAt: opt,
      updatedAt: opt,
      contentUpdatedAt: opt, // dernière modification du contenu (à défaut : updatedAt)
    }),
  ),
  meetings: z.array(
    z.object({
      type: z.string(),
      date: z.string(),
      notes: opt,
      highlights: z
        .array(z.object({ title: z.string(), emoji: opt, detail: opt, stream: keyRef, type: keyRef, author: keyRef, order: z.number().optional() }))
        .default([]),
      statuses: z
        .array(z.object({ stream: keyRef, statuses: z.array(z.string()).default([]), progress: opt, alerts: opt, order: z.number().optional() }))
        .default([]),
      topics: z
        .array(
          z.object({ title: z.string(), emoji: opt, theme: keyRef, nature: keyRef, description: opt, decisionRequest: opt, order: z.number().optional() }),
        )
        .default([]),
    }),
  ),
  risks: z.array(
    z.object({
      title: z.string(),
      type: keyRef,
      status: keyRef,
      criticality: keyRef,
      stream: keyRef,
      description: opt,
      mitigation: opt,
      instance: opt,
      dueDate: opt,
      openedAt: opt,
      owner: keyRef,
      cards: z.array(z.number()).default([]),
    }),
  ),
});

export type AccountFile = z.infer<typeof accountFileSchema>;

const s = (v: string | null | undefined) => v ?? "";
const d = (v: string | null | undefined) => (v ? v.slice(0, 10) : null);

/**
 * Importe un fichier de compte. Si le compte (slug) existe déjà, son contenu est remplacé
 * (configuration et données) ; les accès des utilisateurs sont conservés.
 */
export async function importAccount(user: SessionUser, input: unknown) {
  if (!user.isSuperAdmin) throw forbidden("Import réservé aux super-administrateurs.");
  const parsed = accountFileSchema.safeParse(input);
  if (!parsed.success) throw badRequest("Fichier d'import invalide.", parsed.error.flatten());
  const f = parsed.data;

  const result = await db.transaction(async (tx) => {
    const [existing] = await tx.select().from(T.accounts).where(eq(T.accounts.slug, f.account.slug));
    const accData = {
      name: f.account.name,
      clientName: f.account.clientName,
      clientShortName: f.account.clientShortName,
      emoji: f.account.emoji ?? "📁",
      description: s(f.account.description),
      modules: { ...defaultModules, ...(f.account.modules ?? {}) },
      settings: (f.account.settings ?? defaultSettings(f.account.clientName)) as Record<string, unknown>,
    };
    let accountId: string;
    if (existing) {
      accountId = existing.id;
      // purge du contenu : l'ordre respecte les clés étrangères ; les accès (memberships) sont conservés
      for (const t of [T.comments, T.risks, T.meetings, T.cards, T.meetingTypes, T.governanceBodies, T.sprints, T.streams, T.contacts, T.options]) {
        await tx.delete(t).where(eq(t.accountId, accountId));
      }
      await tx.update(T.accounts).set(accData).where(eq(T.accounts.id, accountId));
    } else {
      const [a] = await tx.insert(T.accounts).values({ slug: f.account.slug, ...accData }).returning();
      accountId = a.id;
    }

    const maps = { option: new Map<string, string>(), stream: new Map<string, string>(), sprint: new Map<string, string>(), contact: new Map<string, string>(), type: new Map<string, string>(), card: new Map<number, string>() };
    const ref = (m: Map<string, string>, k: string | null | undefined, what: string) => {
      if (!k) return null;
      const v = m.get(k);
      if (!v) throw badRequest(`Clé inconnue (${what}) : ${k}`);
      return v;
    };
    const keyed = <X extends { key: string }>(list: X[], m: Map<string, string>) =>
      list.map((x) => {
        const id = randomUUID();
        m.set(x.key, id);
        return { x, id };
      });

    const opts = keyed(f.options, maps.option);
    if (opts.length)
      await tx.insert(T.options).values(
        opts.map(({ x, id }, i) => ({ id, accountId, kind: x.kind as (typeof T.OPTION_KINDS)[number], label: x.label, emoji: s(x.emoji), color: x.color ?? "slate", order: x.order ?? i + 1, meta: x.meta ?? {} })),
      );
    const strs = keyed(f.streams, maps.stream);
    if (strs.length)
      await tx.insert(T.streams).values(
        strs.map(({ x, id }, i) => ({
          id,
          accountId,
          name: x.name,
          emoji: s(x.emoji),
          leader: s(x.leader),
          prescriber: s(x.prescriber),
          order: x.order ?? i + 1,
          active: x.active ?? true,
          inKanban: x.inKanban ?? true,
          inStatusTemplate: x.inStatusTemplate ?? true,
          inDirectory: x.inDirectory ?? true,
        })),
      );
    const sps = keyed(f.sprints, maps.sprint);
    if (sps.length)
      await tx.insert(T.sprints).values(
        sps.map(({ x, id }, i) => ({ id, accountId, name: x.name, startDate: d(x.startDate), endDate: d(x.endDate), state: x.state ?? "UPCOMING", objective: s(x.objective), clientMilestone: s(x.clientMilestone), order: x.order ?? i + 1 })),
      );
    const cts = keyed(f.contacts, maps.contact);
    if (cts.length) {
      const emails = cts.map(({ x }) => s(x.email).toLowerCase()).filter(Boolean);
      const us = emails.length ? await tx.select({ id: T.users.id, email: T.users.email }).from(T.users).where(inArray(T.users.email, emails)) : [];
      await tx.insert(T.contacts).values(
        cts.map(({ x, id }) => {
          const email = s(x.email).toLowerCase();
          return { id, accountId, name: x.name, email, company: s(x.company), role: s(x.role), userId: us.find((u) => u.email === email)?.id ?? null };
        }),
      );
    }
    const mts = keyed(f.meetingTypes, maps.type);
    if (mts.length)
      await tx.insert(T.meetingTypes).values(
        mts.map(({ x, id }, i) => ({ id, accountId, name: x.name, emoji: s(x.emoji), frequency: s(x.frequency), description: s(x.description), guide: s(x.guide), blocks: x.blocks, order: x.order ?? i + 1, settings: x.settings ?? {} })),
      );
    if (f.governance.length)
      await tx.insert(T.governanceBodies).values(
        f.governance.map((g, i) => ({ accountId, scope: g.scope, name: g.name, purpose: s(g.purpose), participants: s(g.participants), frequency: s(g.frequency), support: s(g.support), order: g.order ?? i + 1 })),
      );

    let maxRef = 0;
    if (f.cards.length) {
      await tx.insert(T.cards).values(
        f.cards.map((c, i) => {
          const id = randomUUID();
          maps.card.set(c.ref, id);
          maxRef = Math.max(maxRef, c.ref);
          return {
            id,
            accountId,
            ref: c.ref,
            title: c.title,
            emoji: s(c.emoji),
            description: s(c.description),
            progressNote: s(c.progressNote),
            nextSteps: s(c.nextSteps),
            alertsNote: s(c.alertsNote),
            startDate: d(c.startDate),
            dueDate: d(c.dueDate),
            progressPct: c.progressPct ?? null,
            position: c.position ?? i + 1,
            streamId: ref(maps.stream, c.stream, "stream"),
            sprintId: ref(maps.sprint, c.sprint, "sprint"),
            statusId: ref(maps.option, c.status, "statut"),
            alertLevelId: ref(maps.option, c.alertLevel, "alerte"),
            ownerId: ref(maps.contact, c.owner, "contact"),
            archived: c.archived ?? false,
            createdAt: c.createdAt ? new Date(c.createdAt) : new Date(),
            updatedAt: c.updatedAt ? new Date(c.updatedAt) : new Date(),
            contentUpdatedAt: new Date(c.contentUpdatedAt ?? c.updatedAt ?? Date.now()),
            updatedById: user.id,
          };
        }),
      );
    }
    await tx.update(T.accounts).set({ nextCardRef: maxRef + 1 }).where(eq(T.accounts.id, accountId));

    for (const m of f.meetings) {
      const meetingId = randomUUID();
      await tx.insert(T.meetings).values({ id: meetingId, accountId, meetingTypeId: ref(maps.type, m.type, "type de séance")!, date: d(m.date)!, notes: s(m.notes) });
      const base = { accountId, meetingId };
      if (m.highlights.length)
        await tx.insert(T.highlights).values(
          m.highlights.map((h, i) => ({ ...base, title: h.title, emoji: s(h.emoji), detail: s(h.detail), streamId: ref(maps.stream, h.stream, "stream"), typeId: ref(maps.option, h.type, "type"), authorId: ref(maps.contact, h.author, "contact"), order: h.order ?? i + 1 })),
        );
      if (m.statuses.length)
        await tx.insert(T.streamStatuses).values(
          m.statuses.map((st, i) => ({
            ...base,
            streamId: ref(maps.stream, st.stream, "stream"),
            statusIds: st.statuses.map((k) => ref(maps.option, k, "statut")!),
            progress: s(st.progress),
            alerts: s(st.alerts),
            order: st.order ?? i + 1,
          })),
        );
      if (m.topics.length)
        await tx.insert(T.topics).values(
          m.topics.map((t, i) => ({
            ...base,
            title: t.title,
            emoji: s(t.emoji),
            themeId: ref(maps.option, t.theme, "thématique"),
            natureId: ref(maps.option, t.nature, "nature"),
            description: s(t.description),
            decisionRequest: s(t.decisionRequest),
            order: t.order ?? i + 1,
          })),
        );
    }
    for (const r of f.risks) {
      const riskId = randomUUID();
      await tx.insert(T.risks).values({
        id: riskId,
        accountId,
        title: r.title,
        typeId: ref(maps.option, r.type, "type"),
        statusId: ref(maps.option, r.status, "statut"),
        criticalityId: ref(maps.option, r.criticality, "criticité"),
        streamId: ref(maps.stream, r.stream, "stream"),
        description: s(r.description),
        mitigation: s(r.mitigation),
        instance: s(r.instance),
        dueDate: d(r.dueDate),
        openedAt: d(r.openedAt) ?? new Date().toISOString().slice(0, 10),
        ownerId: ref(maps.contact, r.owner, "contact"),
      });
      const cardIds = r.cards.map((n) => {
        const id = maps.card.get(n);
        if (!id) throw badRequest(`Carte inconnue dans un risque : Réf. ${n}`);
        return id;
      });
      if (cardIds.length) await tx.insert(T.riskCards).values(cardIds.map((cardId) => ({ riskId, cardId })));
    }
    await audit({ user, accountId }, "account", accountId, "import", `Import du fichier de compte (${existing ? "remplacement" : "création"})`, {}, tx);
    return { accountId, slug: f.account.slug, replaced: !!existing };
  });
  const counts = await accountCounts(result.accountId);
  return { ...result, counts };
}

export async function accountCounts(accountId: string) {
  const count = async (t: typeof T.options | typeof T.streams | typeof T.sprints | typeof T.contacts | typeof T.meetingTypes | typeof T.governanceBodies | typeof T.cards | typeof T.meetings | typeof T.highlights | typeof T.streamStatuses | typeof T.topics | typeof T.risks) => {
    const [{ n }] = await db.select({ n: sql<number>`count(*)::int` }).from(t).where(eq(t.accountId, accountId));
    return n;
  };
  const [options, streams, sprints, contacts, meetingTypes, governance, cards, meetings, highlights, statuses, topics, risks] = await Promise.all([
    count(T.options),
    count(T.streams),
    count(T.sprints),
    count(T.contacts),
    count(T.meetingTypes),
    count(T.governanceBodies),
    count(T.cards),
    count(T.meetings),
    count(T.highlights),
    count(T.streamStatuses),
    count(T.topics),
    count(T.risks),
  ]);
  return { options, streams, sprints, contacts, meetingTypes, governance, cards, meetings, highlights, statuses, topics, risks };
}

/** Exporte un compte au format d'échange (sauvegarde ou transfert). */
export async function exportAccount(user: SessionUser, accountId: string): Promise<AccountFile> {
  if (!user.isSuperAdmin) throw forbidden("Export complet réservé aux super-administrateurs.");
  const [a] = await db.select().from(T.accounts).where(eq(T.accounts.id, accountId));
  if (!a) throw badRequest("Compte introuvable.");
  const by = <X extends { accountId: string }>(t: unknown) => t as X;
  void by;
  const [opts, strs, sps, cts, mts, gov, cds, mtgs, hs, ss, ts, rks] = await Promise.all([
    db.select().from(T.options).where(eq(T.options.accountId, accountId)).orderBy(asc(T.options.kind), asc(T.options.order)),
    db.select().from(T.streams).where(eq(T.streams.accountId, accountId)).orderBy(asc(T.streams.order)),
    db.select().from(T.sprints).where(eq(T.sprints.accountId, accountId)).orderBy(asc(T.sprints.order)),
    db.select().from(T.contacts).where(eq(T.contacts.accountId, accountId)).orderBy(asc(T.contacts.name)),
    db.select().from(T.meetingTypes).where(eq(T.meetingTypes.accountId, accountId)).orderBy(asc(T.meetingTypes.order)),
    db.select().from(T.governanceBodies).where(eq(T.governanceBodies.accountId, accountId)).orderBy(asc(T.governanceBodies.scope), asc(T.governanceBodies.order)),
    db.select().from(T.cards).where(eq(T.cards.accountId, accountId)).orderBy(asc(T.cards.ref)),
    db.select().from(T.meetings).where(eq(T.meetings.accountId, accountId)).orderBy(asc(T.meetings.date)),
    db.select().from(T.highlights).where(eq(T.highlights.accountId, accountId)).orderBy(asc(T.highlights.order)),
    db.select().from(T.streamStatuses).where(eq(T.streamStatuses.accountId, accountId)).orderBy(asc(T.streamStatuses.order)),
    db.select().from(T.topics).where(eq(T.topics.accountId, accountId)).orderBy(asc(T.topics.order)),
    db.select().from(T.risks).where(eq(T.risks.accountId, accountId)),
  ]);
  const links = rks.length ? await db.select().from(T.riskCards).where(inArray(T.riskCards.riskId, rks.map((r) => r.id))) : [];
  const refOf = new Map(cds.map((c) => [c.id, c.ref]));
  return {
    format: "wacman-account-v1",
    account: { slug: a.slug, name: a.name, clientName: a.clientName, clientShortName: a.clientShortName, emoji: a.emoji, description: a.description, modules: a.modules, settings: a.settings },
    options: opts.map((o) => ({ key: o.id, kind: o.kind, label: o.label, emoji: o.emoji, color: o.color, order: o.order, meta: o.meta })),
    streams: strs.map((x) => ({ key: x.id, name: x.name, emoji: x.emoji, leader: x.leader, prescriber: x.prescriber, order: x.order, active: x.active, inKanban: x.inKanban, inStatusTemplate: x.inStatusTemplate, inDirectory: x.inDirectory })),
    sprints: sps.map((x) => ({ key: x.id, name: x.name, startDate: x.startDate, endDate: x.endDate, state: x.state, objective: x.objective, clientMilestone: x.clientMilestone, order: x.order })),
    contacts: cts.map((c) => ({ key: c.id, name: c.name, email: c.email, company: c.company, role: c.role })),
    meetingTypes: mts.map((m) => ({ key: m.id, name: m.name, emoji: m.emoji, frequency: m.frequency, description: m.description, guide: m.guide, blocks: m.blocks, order: m.order, settings: m.settings })),
    governance: gov.map((g) => ({ scope: g.scope, name: g.name, purpose: g.purpose, participants: g.participants, frequency: g.frequency, support: g.support, order: g.order })),
    cards: cds.map((c) => ({
      ref: c.ref,
      title: c.title,
      emoji: c.emoji,
      description: c.description,
      progressNote: c.progressNote,
      nextSteps: c.nextSteps,
      alertsNote: c.alertsNote,
      startDate: c.startDate,
      dueDate: c.dueDate,
      progressPct: c.progressPct,
      position: c.position,
      stream: c.streamId,
      sprint: c.sprintId,
      status: c.statusId,
      alertLevel: c.alertLevelId,
      owner: c.ownerId,
      archived: c.archived,
      createdAt: c.createdAt.toISOString(),
      updatedAt: c.updatedAt.toISOString(),
      contentUpdatedAt: c.contentUpdatedAt.toISOString(),
    })),
    meetings: mtgs.map((m) => ({
      type: m.meetingTypeId,
      date: m.date,
      notes: m.notes,
      highlights: hs.filter((h) => h.meetingId === m.id).map((h) => ({ title: h.title, emoji: h.emoji, detail: h.detail, stream: h.streamId, type: h.typeId, author: h.authorId, order: h.order })),
      statuses: ss.filter((x) => x.meetingId === m.id).map((x) => ({ stream: x.streamId, statuses: x.statusIds, progress: x.progress, alerts: x.alerts, order: x.order })),
      topics: ts.filter((t) => t.meetingId === m.id).map((t) => ({ title: t.title, emoji: t.emoji, theme: t.themeId, nature: t.natureId, description: t.description, decisionRequest: t.decisionRequest, order: t.order })),
    })),
    risks: rks.map((r) => ({
      title: r.title,
      type: r.typeId,
      status: r.statusId,
      criticality: r.criticalityId,
      stream: r.streamId,
      description: r.description,
      mitigation: r.mitigation,
      instance: r.instance,
      dueDate: r.dueDate,
      openedAt: r.openedAt,
      owner: r.ownerId,
      cards: links.filter((l) => l.riskId === r.id).map((l) => refOf.get(l.cardId)!).filter((n) => n !== undefined),
    })),
  };
}
