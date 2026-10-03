import { and, asc, desc, eq, ilike, or } from "drizzle-orm";
import {
  db,
  T,
  ENTITIES,
  can,
  createEntity,
  updateEntity,
  deleteEntity,
  getEntityRow,
  listCards,
  listMeetings,
  createMeeting,
  moveCard,
  switchSprint,
  addComment,
  listComments,
  listEntities,
  type Ctx,
} from "@wacman/core";

/**
 * Outils mis à disposition de Claude. Ils appellent les mêmes services que l'interface :
 * contrôles de rôle, validation et journal des modifications sont identiques.
 */

type Tool = {
  name: string;
  description: string;
  input_schema: Record<string, unknown>;
  write?: boolean;
  run: (ctx: Ctx, input: Record<string, unknown>) => Promise<unknown>;
};

const entityNames = Object.keys(ENTITIES);
const entityDoc = Object.entries(ENTITIES)
  .map(([k, v]) => `- ${k} : ${v.description}`)
  .join("\n");

const compactCard = (c: Record<string, unknown>) => ({
  id: c.id,
  ref: c.ref,
  title: c.title,
  streamId: c.streamId,
  sprintId: c.sprintId,
  statusId: c.statusId,
  alertLevelId: c.alertLevelId,
  ownerId: c.ownerId,
  dueDate: c.dueDate,
  progressNote: String(c.progressNote ?? "").slice(0, 300),
  alertsNote: String(c.alertsNote ?? "").slice(0, 300),
});

export const TOOLS: Tool[] = [
  {
    name: "get_overview",
    description:
      "Vue d'ensemble du compte client : streams, sprints, valeurs des listes (statuts, niveaux d'alerte, types...), contacts, types de séance et dernières séances. À appeler en premier pour connaître les identifiants.",
    input_schema: { type: "object", properties: {} },
    run: async (ctx) => {
      const [account] = await db.select().from(T.accounts).where(eq(T.accounts.id, ctx.accountId));
      const [streams, sprints, options, contacts, meetingTypes] = await Promise.all([
        listEntities(ctx, "stream"),
        listEntities(ctx, "sprint"),
        listEntities(ctx, "option"),
        listEntities(ctx, "contact"),
        listEntities(ctx, "meetingType"),
      ]);
      const recent = await db
        .select({ id: T.meetings.id, meetingTypeId: T.meetings.meetingTypeId, date: T.meetings.date })
        .from(T.meetings)
        .where(eq(T.meetings.accountId, ctx.accountId))
        .orderBy(desc(T.meetings.date))
        .limit(12);
      return {
        account: { name: account.name, clientName: account.clientName },
        yourRole: ctx.role,
        streams: streams.map((s) => ({ id: s.id, name: s.name, emoji: s.emoji, leader: s.leader, prescriber: s.prescriber, inKanban: s.inKanban, active: s.active })),
        sprints: sprints.map((s) => ({ id: s.id, name: s.name, state: s.state, startDate: s.startDate, endDate: s.endDate })),
        options: options.map((o) => ({ id: o.id, kind: o.kind, label: o.label, emoji: o.emoji, meta: o.meta })),
        contacts: contacts.map((c) => ({ id: c.id, name: c.name, company: c.company })),
        meetingTypes: meetingTypes.map((m) => ({ id: m.id, name: m.name, blocks: m.blocks })),
        recentMeetings: recent,
      };
    },
  },
  {
    name: "list_cards",
    description: "Liste les cartes (livrables), avec filtres optionnels. Renvoie une version abrégée ; utiliser get_item pour le détail.",
    input_schema: {
      type: "object",
      properties: {
        sprintId: { type: "string" },
        streamId: { type: "string" },
        alertOnly: { type: "boolean", description: "uniquement les cartes en vigilance ou en alerte" },
        query: { type: "string", description: "recherche dans le titre" },
      },
    },
    run: async (ctx, i) => {
      let rows = (await listCards(ctx, { sprintId: i.sprintId as string | undefined })) as Record<string, unknown>[];
      if (i.streamId) rows = rows.filter((c) => c.streamId === i.streamId);
      if (i.alertOnly) rows = rows.filter((c) => c.alertLevelId);
      if (i.query) {
        const q = String(i.query).toLowerCase();
        rows = rows.filter((c) => String(c.title).toLowerCase().includes(q));
      }
      return rows.map(compactCard);
    },
  },
  {
    name: "get_item",
    description: `Détail complet d'un élément. entity parmi : ${entityNames.join(", ")}. Pour une carte, renvoie aussi ses commentaires.`,
    input_schema: { type: "object", properties: { entity: { type: "string", enum: entityNames }, id: { type: "string" } }, required: ["entity", "id"] },
    run: async (ctx, i) => {
      const row = await getEntityRow(ctx, String(i.entity), String(i.id));
      if (i.entity === "card") return { ...row, comments: await listComments(ctx, "card", String(i.id)) };
      return row;
    },
  },
  {
    name: "list_items",
    description: `Liste les éléments d'un type (filtre optionnel par meetingId, streamId...). entity parmi : ${entityNames.join(", ")}.`,
    input_schema: {
      type: "object",
      properties: { entity: { type: "string", enum: entityNames }, filters: { type: "object", additionalProperties: { type: "string" } } },
      required: ["entity"],
    },
    run: async (ctx, i) => listEntities(ctx, String(i.entity), (i.filters as Record<string, string>) ?? {}),
  },
  {
    name: "list_meetings",
    description: "Séances d'un type de séance, de la plus récente à la plus ancienne, avec leurs faits marquants, statuts de streams et sujets.",
    input_schema: { type: "object", properties: { meetingTypeId: { type: "string" }, limit: { type: "number" } }, required: ["meetingTypeId"] },
    run: async (ctx, i) => (await listMeetings(ctx, String(i.meetingTypeId))).slice(0, Number(i.limit ?? 3)),
  },
  {
    name: "search",
    description: "Recherche plein texte (titre et contenus) dans les cartes, faits marquants, sujets et risques.",
    input_schema: { type: "object", properties: { query: { type: "string" } }, required: ["query"] },
    run: async (ctx, i) => {
      const q = `%${String(i.query)}%`;
      const [cards, hl, tp, rk] = await Promise.all([
        db
          .select({ id: T.cards.id, ref: T.cards.ref, title: T.cards.title })
          .from(T.cards)
          .where(and(eq(T.cards.accountId, ctx.accountId), or(ilike(T.cards.title, q), ilike(T.cards.description, q), ilike(T.cards.progressNote, q), ilike(T.cards.alertsNote, q), ilike(T.cards.nextSteps, q))))
          .limit(20),
        db
          .select({ id: T.highlights.id, title: T.highlights.title, meetingId: T.highlights.meetingId })
          .from(T.highlights)
          .where(and(eq(T.highlights.accountId, ctx.accountId), or(ilike(T.highlights.title, q), ilike(T.highlights.detail, q))))
          .limit(20),
        db
          .select({ id: T.topics.id, title: T.topics.title, meetingId: T.topics.meetingId })
          .from(T.topics)
          .where(and(eq(T.topics.accountId, ctx.accountId), or(ilike(T.topics.title, q), ilike(T.topics.description, q), ilike(T.topics.decisionRequest, q))))
          .limit(20),
        db
          .select({ id: T.risks.id, title: T.risks.title })
          .from(T.risks)
          .where(and(eq(T.risks.accountId, ctx.accountId), or(ilike(T.risks.title, q), ilike(T.risks.description, q), ilike(T.risks.mitigation, q))))
          .orderBy(asc(T.risks.title))
          .limit(20),
      ]);
      return { cards, highlights: hl, topics: tp, risks: rk };
    },
  },
  {
    name: "create_item",
    write: true,
    description: `Crée un élément. entity parmi : ${entityNames.join(", ")}. Champs par type :\n${entityDoc}\nLes dates sont au format AAAA-MM-JJ. Les champs *Id prennent les identifiants renvoyés par get_overview.`,
    input_schema: { type: "object", properties: { entity: { type: "string", enum: entityNames }, data: { type: "object" } }, required: ["entity", "data"] },
    run: (ctx, i) => createEntity(ctx, String(i.entity), i.data),
  },
  {
    name: "update_item",
    write: true,
    description: "Modifie un élément existant : ne passer dans data que les champs à changer.",
    input_schema: {
      type: "object",
      properties: { entity: { type: "string", enum: entityNames }, id: { type: "string" }, data: { type: "object" } },
      required: ["entity", "id", "data"],
    },
    run: (ctx, i) => updateEntity(ctx, String(i.entity), String(i.id), i.data),
  },
  {
    name: "delete_item",
    write: true,
    description: "Supprime définitivement un élément. Uniquement si l'utilisateur l'a explicitement demandé.",
    input_schema: { type: "object", properties: { entity: { type: "string", enum: entityNames }, id: { type: "string" } }, required: ["entity", "id"] },
    run: (ctx, i) => deleteEntity(ctx, String(i.entity), String(i.id)),
  },
  {
    name: "move_card",
    write: true,
    description: "Change la colonne (statusId) ou le couloir (streamId) d'une carte du kanban.",
    input_schema: { type: "object", properties: { cardId: { type: "string" }, statusId: { type: "string" }, streamId: { type: "string" } }, required: ["cardId"] },
    run: (ctx, i) => moveCard(ctx, String(i.cardId), { statusId: i.statusId, streamId: i.streamId }),
  },
  {
    name: "create_meeting",
    write: true,
    description: "Crée une séance d'un type donné à une date (AAAA-MM-JJ), vide (mode empty) ou en recopiant la séance précédente (mode previous).",
    input_schema: {
      type: "object",
      properties: { meetingTypeId: { type: "string" }, date: { type: "string" }, mode: { type: "string", enum: ["empty", "previous"] } },
      required: ["meetingTypeId", "date"],
    },
    run: (ctx, i) => createMeeting(ctx, i),
  },
  {
    name: "switch_sprint",
    write: true,
    description: "Clôt un sprint (DONE), ouvre le suivant (CURRENT) et y reporte les cartes non terminées. Réservé aux administrateurs du compte.",
    input_schema: { type: "object", properties: { fromSprintId: { type: "string" }, toSprintId: { type: "string" } }, required: ["fromSprintId", "toSprintId"] },
    run: (ctx, i) => switchSprint(ctx, i),
  },
  {
    name: "add_comment",
    write: true,
    description: "Ajoute un commentaire sur une carte, un risque, un sujet, un fait marquant ou un statut de stream (entityType : card, risk, topic, highlight, streamStatus).",
    input_schema: {
      type: "object",
      properties: { entityType: { type: "string" }, entityId: { type: "string" }, body: { type: "string" } },
      required: ["entityType", "entityId", "body"],
    },
    run: (ctx, i) => addComment(ctx, String(i.entityType), String(i.entityId), String(i.body)),
  },
];

/** Outils accessibles selon le rôle : un lecteur n'a que la lecture (et les commentaires). */
export function toolsFor(ctx: Ctx) {
  return TOOLS.filter((t) => !t.write || can(ctx, "EDITOR") || t.name === "add_comment");
}
