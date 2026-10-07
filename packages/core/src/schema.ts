// WacMan (Wifirst Account Management) - modèle de données (Drizzle ORM, PostgreSQL)
// Toute donnée métier est rattachée à un compte client (accounts).

import { pgTable, pgEnum, uuid, text, integer, boolean, timestamp, date, jsonb, doublePrecision, index, uniqueIndex, primaryKey, customType } from "drizzle-orm/pg-core";

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
  // Accès par application : WacMan (pilotage interne) et WiBridge (échanges avec les clients).
  // Le super-administrateur a toujours les deux. Un compte créé depuis WiBridge n'a pas accès à WacMan.
  wacmanAccess: boolean("wacman_access").notNull().default(true),
  bridgeAccess: boolean("bridge_access").notNull().default(false),
  // faux pour un compte invité qui n'a pas encore choisi son mot de passe
  passwordSet: boolean("password_set").notNull().default(true),
  bridgeLastLoginAt: timestamp("bridge_last_login_at", { withTimezone: true }),
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
    purpose: text("purpose").notNull().default("LOGIN"), // LOGIN ou RESET (mot de passe oublié)
    attempts: integer("attempts").notNull().default(0),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    consumedAt: timestamp("consumed_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("login_challenges_user_idx").on(t.userId)],
);

/** Jetons d'accès personnels (API REST et serveur MCP pour Claude). Seul le hachage est conservé. */
export const apiTokens = pgTable(
  "api_tokens",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    tokenHash: text("token_hash").notNull().unique(),
    prefix: text("prefix").notNull(),
    readOnly: boolean("read_only").notNull().default(false),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("api_tokens_user_idx").on(t.userId)],
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
    startDate: date("start_date", { mode: "string" }), // début prévu (planning)
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
    // Dernière modification du contenu (textes, propriétés, statut, stream) : sert à l'étiquette de fraîcheur.
    // Un simple réordonnancement ou une bascule automatique de sprint ne la change pas.
    contentUpdatedAt: timestamp("content_updated_at", { withTimezone: true }).notNull().defaultNow(),
    updatedById: uuid("updated_by_id"),
  },
  (t) => [uniqueIndex("cards_account_ref_uq").on(t.accountId, t.ref), index("cards_account_sprint_idx").on(t.accountId, t.sprintId)],
);

// HIGHLIGHTS, STREAM_STATUS et TOPICS sont saisis par séance ; ALERT_CARDS et PLANNING sont des vues à date du kanban ;
// ACTIONS et DECISIONS montrent le relevé des actions et le registre des décisions suivis dans ce type de séance
export const MEETING_BLOCKS = ["HIGHLIGHTS", "STREAM_STATUS", "TOPICS", "ALERT_CARDS", "PLANNING", "ACTIONS", "DECISIONS"] as const;
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

/** Côté qui porte une action : Wifirst, le client, ou les deux. */
export const ACTION_PARTIES = ["WIFIRST", "CLIENT", "JOINT"] as const;
export const ACTION_STATUSES = ["OPEN", "DONE", "CANCELLED"] as const;

/**
 * Relevé des actions : une action est suivie dans une série de séances (meetingTypeId) jusqu'à sa clôture ;
 * elle reste affichée de séance en séance tant qu'elle est ouverte.
 */
export const actions = pgTable(
  "actions",
  {
    id: id(),
    accountId: accountRef(),
    title: text("title").notNull(),
    note: text("note").notNull().default(""),
    party: text("party").$type<(typeof ACTION_PARTIES)[number]>().notNull().default("WIFIRST"),
    ownerId: uuid("owner_id").references(() => contacts.id, { onDelete: "set null" }),
    streamId: uuid("stream_id").references(() => streams.id, { onDelete: "set null" }),
    cardId: uuid("card_id").references(() => cards.id, { onDelete: "set null" }),
    meetingTypeId: uuid("meeting_type_id").references(() => meetingTypes.id, { onDelete: "set null" }),
    meetingId: uuid("meeting_id").references(() => meetings.id, { onDelete: "set null" }), // séance où l'action a été prise
    dueDate: date("due_date", { mode: "string" }),
    status: text("status").$type<(typeof ACTION_STATUSES)[number]>().notNull().default("OPEN"),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    order: doublePrecision("order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("actions_account_idx").on(t.accountId), index("actions_type_idx").on(t.meetingTypeId)],
);

export const DECISION_STATUSES = ["PENDING", "TAKEN"] as const;

/** Registre des décisions : attendues (à faire trancher) ou prises (avec la date et l'instance). */
export const decisions = pgTable(
  "decisions",
  {
    id: id(),
    accountId: accountRef(),
    title: text("title").notNull(),
    detail: text("detail").notNull().default(""),
    status: text("status").$type<(typeof DECISION_STATUSES)[number]>().notNull().default("TAKEN"),
    decidedOn: date("decided_on", { mode: "string" }),
    streamId: uuid("stream_id").references(() => streams.id, { onDelete: "set null" }),
    cardId: uuid("card_id").references(() => cards.id, { onDelete: "set null" }),
    topicId: uuid("topic_id").references(() => topics.id, { onDelete: "set null" }),
    meetingTypeId: uuid("meeting_type_id").references(() => meetingTypes.id, { onDelete: "set null" }),
    meetingId: uuid("meeting_id").references(() => meetings.id, { onDelete: "set null" }),
    order: doublePrecision("order").notNull().default(0),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("decisions_account_idx").on(t.accountId), index("decisions_type_idx").on(t.meetingTypeId)],
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

// ---------------------------------------------------------------------------
// WiBridge : échanges entre Wifirst et ses clients (questions, réponses, pièces jointes).
// Interface distincte (apps/bridge), même API et même base. Données rattachées à un client WiBridge.
// ---------------------------------------------------------------------------

/** Organisation qui agit : PROVIDER (Wifirst) ou CLIENT (La Poste pour le premier client). */
export const BRIDGE_PARTIES = ["PROVIDER", "CLIENT"] as const;
export type BridgeParty = (typeof BRIDGE_PARTIES)[number];
/** Droit d'un utilisateur sur un stream : masqué, lecture, éditeur client, éditeur Wifirst, éditeur des deux. */
export const BRIDGE_ACCESS = ["NONE", "READ", "CLIENT", "PROVIDER", "BOTH"] as const;
export type BridgeAccess = (typeof BRIDGE_ACCESS)[number];
/** À traiter (attribuée, sans réponse de l'attributaire), en cours (réponse partielle), clôturée. */
export const BRIDGE_STATUSES = ["OPEN", "IN_PROGRESS", "CLOSED"] as const;
export type BridgeStatus = (typeof BRIDGE_STATUSES)[number];
/** Préférence d'e-mail : à chaque attribution, récapitulatif quotidien, aucun. */
export const BRIDGE_NOTIFY = ["IMMEDIATE", "DAILY", "NONE"] as const;
export type BridgeNotify = (typeof BRIDGE_NOTIFY)[number];
/** Issue d'un message : attribution (conservée ou changée), clôture, réouverture. */
export const BRIDGE_OUTCOMES = ["ASSIGN", "CLOSE", "REOPEN"] as const;
export type BridgeOutcome = (typeof BRIDGE_OUTCOMES)[number];

const bytea = customType<{ data: Buffer; driverData: Buffer }>({ dataType: () => "bytea" });

export const bridgeClients = pgTable("bridge_clients", {
  id: id(),
  slug: text("slug").notNull().unique(),
  name: text("name").notNull(), // nom de l'espace (« La Poste »)
  clientName: text("client_name").notNull(), // libellé de l'organisation cliente
  providerName: text("provider_name").notNull().default("Wifirst"),
  shortName: text("short_name").notNull().default(""),
  emoji: text("emoji").notNull().default("🤝"),
  description: text("description").notNull().default(""), // mode d'emploi affiché en tête des questions
  settings: jsonb("settings").notNull().default({}).$type<Record<string, unknown>>(),
  archived: boolean("archived").notNull().default(false),
  nextRef: integer("next_ref").notNull().default(1),
  createdAt: createdAt(),
  updatedAt: updatedAt(),
});

const bridgeClientRef = () =>
  uuid("client_id")
    .notNull()
    .references(() => bridgeClients.id, { onDelete: "cascade" });

export const bridgeStreams = pgTable(
  "bridge_streams",
  {
    id: id(),
    clientId: bridgeClientRef(),
    name: text("name").notNull(),
    emoji: text("emoji").notNull().default(""),
    order: integer("order").notNull().default(0),
    active: boolean("active").notNull().default(true),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("bridge_streams_client_idx").on(t.clientId)],
);

/** Accès d'un utilisateur à un client : organisation de rattachement, droit par défaut et droits par stream. */
export const bridgeMembers = pgTable(
  "bridge_members",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    clientId: bridgeClientRef(),
    side: text("side").$type<BridgeParty>().notNull(),
    defaultAccess: text("default_access").$type<BridgeAccess>().notNull().default("READ"),
    // droits propres à certains streams ({ streamId: droit }) ; les autres streams suivent le droit par défaut
    streamAccess: jsonb("stream_access").notNull().default({}).$type<Record<string, BridgeAccess>>(),
    // préférence d'e-mail propre à la personne (Mon compte) ; par défaut aucun e-mail
    notify: text("notify").$type<BridgeNotify>().notNull().default("NONE"),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("bridge_members_user_client_uq").on(t.userId, t.clientId), index("bridge_members_client_idx").on(t.clientId)],
);

export const bridgeQuestions = pgTable(
  "bridge_questions",
  {
    id: id(),
    clientId: bridgeClientRef(),
    ref: integer("ref").notNull(),
    subject: text("subject").notNull(),
    body: text("body").notNull().default(""),
    askedById: uuid("asked_by_id").references(() => users.id, { onDelete: "set null" }),
    askedByName: text("asked_by_name").notNull().default(""),
    askedByParty: text("asked_by_party").$type<BridgeParty>().notNull(),
    assignedParty: text("assigned_party").$type<BridgeParty>().notNull(),
    status: text("status").$type<BridgeStatus>().notNull().default("OPEN"),
    dueDate: date("due_date", { mode: "string" }),
    closedAt: timestamp("closed_at", { withTimezone: true }),
    closedById: uuid("closed_by_id").references(() => users.id, { onDelete: "set null" }),
    closedByName: text("closed_by_name").notNull().default(""),
    lastActivityAt: timestamp("last_activity_at", { withTimezone: true }).notNull().defaultNow(),
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [uniqueIndex("bridge_questions_client_ref_uq").on(t.clientId, t.ref), index("bridge_questions_client_status_idx").on(t.clientId, t.status)],
);

/** Une question peut relever de plusieurs streams. */
export const bridgeQuestionStreams = pgTable(
  "bridge_question_streams",
  {
    questionId: uuid("question_id")
      .notNull()
      .references(() => bridgeQuestions.id, { onDelete: "cascade" }),
    streamId: uuid("stream_id")
      .notNull()
      .references(() => bridgeStreams.id),
  },
  (t) => [primaryKey({ columns: [t.questionId, t.streamId] }), index("bridge_question_streams_stream_idx").on(t.streamId)],
);

/** Échanges d'une question : chaque message porte son issue (attribution, clôture, réouverture). */
export const bridgeMessages = pgTable(
  "bridge_messages",
  {
    id: id(),
    clientId: bridgeClientRef(),
    questionId: uuid("question_id")
      .notNull()
      .references(() => bridgeQuestions.id, { onDelete: "cascade" }),
    authorId: uuid("author_id").references(() => users.id, { onDelete: "set null" }),
    authorName: text("author_name").notNull().default(""),
    party: text("party").$type<BridgeParty>().notNull(), // organisation au nom de laquelle le message est écrit
    body: text("body").notNull().default(""),
    outcome: text("outcome").$type<BridgeOutcome>().notNull().default("ASSIGN"),
    assignedBefore: text("assigned_before").$type<BridgeParty>(), // vide si la question était clôturée
    assignedAfter: text("assigned_after").$type<BridgeParty>(), // vide si le message clôture la question
    editedAt: timestamp("edited_at", { withTimezone: true }),
    // message supprimé par son auteur (ou par Wifirst) : le texte est retiré, l'issue reste affichée, le texte reste à l'historique
    deletedAt: timestamp("deleted_at", { withTimezone: true }),
    deletedByName: text("deleted_by_name").notNull().default(""),
    createdAt: createdAt(),
    updatedAt: updatedAt(),
  },
  (t) => [index("bridge_messages_question_idx").on(t.questionId, t.createdAt), index("bridge_messages_client_idx").on(t.clientId)],
);

/** Pièces jointes (contenu en base). Sans attachedAt, la pièce est en cours de rédaction et visible de son seul auteur. */
export const bridgeFiles = pgTable(
  "bridge_files",
  {
    id: id(),
    clientId: bridgeClientRef(),
    questionId: uuid("question_id").references(() => bridgeQuestions.id, { onDelete: "cascade" }),
    messageId: uuid("message_id").references(() => bridgeMessages.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    mime: text("mime").notNull().default("application/octet-stream"),
    size: integer("size").notNull(),
    data: bytea("data").notNull(),
    uploadedById: uuid("uploaded_by_id").references(() => users.id, { onDelete: "set null" }),
    uploadedByName: text("uploaded_by_name").notNull().default(""),
    attachedAt: timestamp("attached_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("bridge_files_question_idx").on(t.questionId), index("bridge_files_client_idx").on(t.clientId)],
);

/** Historique de toutes les modifications (par question, et configuration du client quand questionId est vide). */
export const bridgeEvents = pgTable(
  "bridge_events",
  {
    id: id(),
    clientId: bridgeClientRef(),
    questionId: uuid("question_id").references(() => bridgeQuestions.id, { onDelete: "cascade" }),
    action: text("action").notNull(),
    summary: text("summary").notNull().default(""),
    changes: jsonb("changes").notNull().default({}).$type<Record<string, unknown>>(),
    userId: uuid("user_id"),
    userName: text("user_name").notNull().default(""),
    party: text("party").$type<BridgeParty>(),
    createdAt: createdAt(),
  },
  (t) => [index("bridge_events_question_idx").on(t.questionId, t.createdAt), index("bridge_events_client_idx").on(t.clientId, t.createdAt)],
);

/** Appareils de confiance : le code par e-mail n'est demandé qu'à la première connexion depuis un appareil. */
export const bridgeDevices = pgTable(
  "bridge_devices",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    label: text("label").notNull().default(""),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }).notNull().defaultNow(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("bridge_devices_user_idx").on(t.userId)],
);

/** Invitations à créer son compte WiBridge (lien à usage unique). */
export const bridgeInvitations = pgTable(
  "bridge_invitations",
  {
    id: id(),
    userId: uuid("user_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    tokenHash: text("token_hash").notNull().unique(),
    invitedById: uuid("invited_by_id"),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    acceptedAt: timestamp("accepted_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    createdAt: createdAt(),
  },
  (t) => [index("bridge_invitations_user_idx").on(t.userId)],
);

/** Tâches planifiées déjà jouées (récapitulatif quotidien) : la clé (nom, jour) évite un double envoi. */
export const bridgeJobs = pgTable(
  "bridge_jobs",
  {
    name: text("name").notNull(),
    day: date("day", { mode: "string" }).notNull(),
    createdAt: createdAt(),
  },
  (t) => [primaryKey({ columns: [t.name, t.day] })],
);
