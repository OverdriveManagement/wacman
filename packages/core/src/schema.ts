// WacMan (Wifirst Account Management) - modèle de données (Drizzle ORM, PostgreSQL)
// Toute donnée métier est rattachée à un compte client (accounts).

import { pgTable, pgEnum, uuid, text, integer, boolean, timestamp, date, jsonb, doublePrecision, index, uniqueIndex, primaryKey } from "drizzle-orm/pg-core";

const id = () => uuid("id").primaryKey().defaultRandom();
const createdAt = () => timestamp("created_at", { withTimezone: true }).notNull().defaultNow();
const updatedAt = () =>
  timestamp("updated_at", { withTimezone: true })
    .notNull()
    .defaultNow()
    .$onUpdate(() => new Date());
const accountRef = () =>
  uuid("account_id")
    .notNull()
    .references(() => accounts.id, { onDelete: "cascade" });

// ---------------------------------------------------------------------------
// Utilisateurs, authentification, rôles
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: id(),
  email: text("email").notNull().unique(),
  name: text("name").notNull(),
  passwordHash: text("password_hash").notNull(),
  isSuperAdmin: boolean("is_super_admin").notNull().default(false),
  active: boolean("active").notNull().default(true),
  sessionVersion: integer("session_version").notNull().default(0),
  lastLoginAt: timestamp("last_login_at", { withTimezone: true }),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const loginChallenges = pgTable(
  "login_challenges",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    codeHash: text("code_hash").notNull(),
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("login_challenges_user_idx").on(t.userId)],
);

export const roleEnum = pgEnum("role", ["ADMIN", "EDITOR", "VIEWER"]);

export const memberships = pgTable(
  "memberships",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accountId: accountRef(),
    role: roleEnum("role").notNull(),
    createdAt: createdAt(),
  },
  (t) => [uniqueIndex("memberships_user_account_uq").on(t.userId, t.accountId)],
);

// ---------------------------------------------------------------------------
// Compte client et configuration
// ---------------------------------------------------------------------------

export const accounts = pgTable("accounts", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(),
  clientName: text("client_name").notNull(),
  clientShortName: text("client_short_name").notNull(),
  emoji: text("emoji").notNull().default("📁"),
  description: text("description").notNull().default(""),
  modules: jsonb("modules").notNull().$type<{ program: boolean; finance: boolean; provisioning: boolean }>(),
  settings: jsonb("settings").notNull().$type<Record<string, unknown>>(),
  archived: boolean("archived").notNull().default(false),
  nextCardRef: integer("next_card_ref").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

export const OPTION_KINDS = [
  "CARD_STATUS", // colonnes du kanban (meta.done = colonne « terminé »)
  "ALERT_LEVEL", // Vigilance / Alerte
  "HIGHLIGHT_TYPE", // Avancée, Jalon atteint, Décision, Difficulté
  "STREAM_STATUS", // statuts de stream présentés en séance
  "TOPIC_THEME", // Build, Run, Commercial
  "TOPIC_NATURE", // Alerte, Arbitrage, Information
  "RISK_TYPE",
  "RISK_STATUS",
  "RISK_CRITICALITY",
] as const;
export const optionKindEnum = pgEnum("option_kind", OPTION_KINDS);

export const options = pgTable(
  "options",
  {
    id: id(),
    accountId: accountRef(),
    kind: optionKindEnum("kind").notNull(),
    label: text("label").notNull(),
    emoji: text("emoji").notNull().default(""),
    color: text("color").notNull().default("slate"),
    order: integer("order").notNull().default(0),
    meta: jsonb("meta").notNull().default({}).$type<Record<string, unknown>>(),
    createdAt: createdAt(),
  },
  (t) => [index("options_account_kind_idx").on(t.accountId, t.kind)],
);

export const contacts = pgTable(
  "contacts",
  {
    id: id(),
    accountId: accountRef(),
    name: text("name").notNull(),
    email: text("email").notNull().default(""),
    company: text("company").notNull().default(""),
    role: text("role").notNull().default(""),
    userId: uuid("user_id").references(() => users.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("contacts_account_idx").on(t.accountId)],
);

export const streams = pgTable(
  "streams",
  {
    id: id(),
    accountId: accountRef(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default(""),
    leader: text("leader").notNull().default(""),
    prescriber: text("prescriber").notNull().default(""),
    order: integer("order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    inKanban: boolean("in_kanban").notNull().default(true),
    inStatusTemplate: boolean("in_status_template").notNull().default(true),
    inDirectory: boolean("in_directory").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("streams_account_idx").on(t.accountId)],
);

export const sprintStateEnum = pgEnum("sprint_state", ["UPCOMING", "CURRENT", "DONE"]);

export const sprints = pgTable(
  "sprints",
  {
    id: id(),
    accountId: accountRef(),
    name: text("name").notNull(),
    startDate: date("start_date", { mode: "string" }),
    endDate: date("end_date", { mode: "string" }),
    state: sprintStateEnum("state").notNull().default("UPCOMING"),
    objective: text("objective").notNull().default(""),
    clientMilestone: text("client_milestone").notNull().default(""),
    order: integer("order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("sprints_account_idx").on(t.accountId)],
);

// ---------------------------------------------------------------------------
// Program Management
// ---------------------------------------------------------------------------

export const cards = pgTable(
  "cards",
  {
    id: id(),
    accountId: accountRef(),
    ref: integer("ref").notNull(),
    title: text("title").notNull(),
    emoji: text("emoji").notNull().default(""),
    description: text("description").notNull().default(""),
    progressNote: text("progress_note").notNull().default(""), // Point d'avancement
    nextSteps: text("next_steps").notNull().default(""), // Prochaines étapes
    alertsNote: text("alerts_note").notNull().default(""), // Alertes / arbitrages
    dueDate: date("due_date", { mode: "string" }),
    progressPct: integer("progress_pct"),
    position: doublePrecision("position").notNull().default(0),
    streamId: uuid("stream_id").references(() => streams.id, { onDelete: "set null" }),
    sprintId: uuid("sprint_id").references(() => sprints.id, { onDelete: "set null" }),
    statusId: uuid("status_id").references(() => options.id, { onDelete: "set null" }),
    alertLevelId: uuid("alert_level_id").references(() => options.id, { onDelete: "set null" }),
    ownerId: uuid("owner_id").references(() => contacts.id, { onDelete: "set null" }),
    archived: boolean("archived").notNull().default(false),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
    updatedById: uuid("updated_by_id"),
  },
  (t) => [uniqueIndex("cards_account_ref_uq").on(t.accountId, t.ref), index("cards_account_sprint_idx").on(t.accountId, t.sprintId)],
);

export const MEETING_BLOCKS = ["HIGHLIGHTS", "STREAM_STATUS", "TOPICS"] as const;
export type MeetingBlock = (typeof MEETING_BLOCKS)[number];

export const meetingTypes = pgTable(
  "meeting_types",
  {
    id: id(),
    accountId: accountRef(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default(""),
    frequency: text("frequency").notNull().default(""),
    description: text("description").notNull().default(""),
    guide: text("guide").notNull().default(""),
    blocks: jsonb("blocks").notNull().$type<MeetingBlock[]>(),
    order: integer("order").notNull().default(0),
    settings: jsonb("settings").notNull().default({}).$type<Record<string, unknown>>(),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("meeting_types_account_idx").on(t.accountId)],
);

export const meetings = pgTable(
  "meetings",
  {
    id: id(),
    accountId: accountRef(),
    meetingTypeId: uuid("meeting_type_id")
      .notNull()
      .references(() => meetingTypes.id, { onDelete: "cascade" }),
    date: date("date", { mode: "string" }).notNull(),
    notes: text("notes").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("meetings_account_type_date_idx").on(t.accountId, t.meetingTypeId, t.date)],
);

const meetingRef = () =>
  uuid("meeting_id")
    .notNull()
    .references(() => meetings.id, { onDelete: "cascade" });

export const highlights = pgTable(
  "highlights",
  {
    id: id(),
    accountId: accountRef(),
    meetingId: meetingRef(),
    title: text("title").notNull(),
    emoji: text("emoji").notNull().default(""),
    detail: text("detail").notNull().default(""),
    streamId: uuid("stream_id").references(() => streams.id, { onDelete: "set null" }),
    typeId: uuid("type_id").references(() => options.id, { onDelete: "set null" }),
    authorId: uuid("author_id").references(() => contacts.id, { onDelete: "set null" }),
    order: integer("order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("highlights_meeting_idx").on(t.meetingId)],
);

export const streamStatuses = pgTable(
  "stream_statuses",
  {
    id: id(),
    accountId: accountRef(),
    meetingId: meetingRef(),
    streamId: uuid("stream_id").references(() => streams.id, { onDelete: "set null" }),
    statusIds: jsonb("status_ids").notNull().default([]).$type<string[]>(),
    progress: text("progress").notNull().default(""),
    alerts: text("alerts").notNull().default(""),
    order: integer("order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("stream_statuses_meeting_idx").on(t.meetingId)],
);

export const topics = pgTable(
  "topics",
  {
    id: id(),
    accountId: accountRef(),
    meetingId: meetingRef(),
    title: text("title").notNull(),
    emoji: text("emoji").notNull().default(""),
    themeId: uuid("theme_id").references(() => options.id, { onDelete: "set null" }),
    natureId: uuid("nature_id").references(() => options.id, { onDelete: "set null" }),
    description: text("description").notNull().default(""),
    decisionRequest: text("decision_request").notNull().default(""),
    order: integer("order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("topics_meeting_idx").on(t.meetingId)],
);

export const risks = pgTable(
  "risks",
  {
    id: id(),
    accountId: accountRef(),
    title: text("title").notNull(),
    typeId: uuid("type_id").references(() => options.id, { onDelete: "set null" }),
    statusId: uuid("status_id").references(() => options.id, { onDelete: "set null" }),
    criticalityId: uuid("criticality_id").references(() => options.id, { onDelete: "set null" }),
    streamId: uuid("stream_id").references(() => streams.id, { onDelete: "set null" }),
    description: text("description").notNull().default(""),
    mitigation: text("mitigation").notNull().default(""),
    instance: text("instance").notNull().default(""),
    dueDate: date("due_date", { mode: "string" }),
    openedAt: date("opened_at", { mode: "string" }).notNull().defaultNow(),
    ownerId: uuid("owner_id").references(() => contacts.id, { onDelete: "set null" }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("risks_account_idx").on(t.accountId)],
);

export const riskCards = pgTable(
  "risk_cards",
  {
    riskId: uuid("risk_id")
      .notNull()
      .references(() => risks.id, { onDelete: "cascade" }),
    cardId: uuid("card_id")
      .notNull()
      .references(() => cards.id, { onDelete: "cascade" }),
  },
  (t) => [primaryKey({ columns: [t.riskId, t.cardId] })],
);

export const governanceScopeEnum = pgEnum("governance_scope", ["INTERNAL", "JOINT"]);

export const governanceBodies = pgTable(
  "governance_bodies",
  {
    id: id(),
    accountId: accountRef(),
    scope: governanceScopeEnum("scope").notNull(),
    name: text("name").notNull(),
    purpose: text("purpose").notNull().default(""),
    participants: text("participants").notNull().default(""),
    frequency: text("frequency").notNull().default(""),
    support: text("support").notNull().default(""), // « Support » (interne) ou « Piloté par » (conjoint)
    order: integer("order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("governance_account_idx").on(t.accountId)],
);

// ---------------------------------------------------------------------------
// Collaboration et traçabilité
// ---------------------------------------------------------------------------

export const comments = pgTable(
  "comments",
  {
    id: id(),
    accountId: accountRef(),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    body: text("body").notNull(),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("comments_entity_idx").on(t.entityType, t.entityId)],
);

export const auditLogs = pgTable(
  "audit_logs",
  {
    id: id(),
    accountId: uuid("account_id").references(() => accounts.id, { onDelete: "cascade" }),
    entityType: text("entity_type").notNull(),
    entityId: uuid("entity_id").notNull(),
    action: text("action").notNull(),
    summary: text("summary").notNull().default(""),
    changes: jsonb("changes").notNull().default({}).$type<Record<string, unknown>>(),
    userId: uuid("user_id"),
    userName: text("user_name").notNull().default(""),
    viaAssistant: boolean("via_assistant").notNull().default(false),
    createdAt: createdAt(),
  },
  (t) => [index("audit_entity_idx").on(t.entityType, t.entityId), index("audit_account_created_idx").on(t.accountId, t.createdAt)],
);

export const assistantRuns = pgTable(
  "assistant_runs",
  {
    id: id(),
    accountId: accountRef(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    prompt: text("prompt").notNull(),
    response: text("response").notNull().default(""),
    actions: jsonb("actions").notNull().default([]).$type<unknown[]>(),
    inputTokens: integer("input_tokens").notNull().default(0),
    outputTokens: integer("output_tokens").notNull().default(0),
    createdAt: createdAt(),
  },
  (t) => [index("assistant_runs_account_idx").on(t.accountId, t.createdAt)],
);
