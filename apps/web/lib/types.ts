export type Role = "ADMIN" | "EDITOR" | "VIEWER";

export interface User {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

export interface AccountSummary {
  id: string;
  slug: string;
  name: string;
  clientName: string;
  emoji: string;
  description: string;
  archived: boolean;
  modules: Modules;
  role: Role;
}

export interface Modules {
  program: boolean;
  finance: boolean;
  provisioning: boolean;
}

export interface AccountSettings {
  intro: string;
  kanbanGuide: string;
  governanceIntro: string;
  governanceInternalTitle: string;
  governanceJointTitle: string;
  governanceInternalSupportLabel: string;
  governanceJointSupportLabel: string;
  sprintMethodology: string;
  labels: { leader: string; prescriber: string };
  freshness: FreshnessSettings;
}

/** Paliers de l'étiquette de fraîcheur des cartes (le dernier, sans limite, couvre le reste). */
export interface FreshnessLevel {
  maxDays: number | null;
  emoji: string;
  color: string;
  label: string;
}
export interface FreshnessSettings {
  enabled: boolean;
  hideDone: boolean;
  levels: FreshnessLevel[];
}

export type OptionKind =
  | "CARD_STATUS"
  | "ALERT_LEVEL"
  | "HIGHLIGHT_TYPE"
  | "STREAM_STATUS"
  | "TOPIC_THEME"
  | "TOPIC_NATURE"
  | "RISK_TYPE"
  | "RISK_STATUS"
  | "RISK_CRITICALITY";

export interface Option {
  id: string;
  kind: OptionKind;
  label: string;
  emoji: string;
  color: string;
  order: number;
  meta: { done?: boolean; closed?: boolean } & Record<string, unknown>;
}

export interface Stream {
  id: string;
  name: string;
  emoji: string;
  leader: string;
  prescriber: string;
  order: number;
  active: boolean;
  inKanban: boolean;
  inStatusTemplate: boolean;
  inDirectory: boolean;
}

export interface Sprint {
  id: string;
  name: string;
  startDate: string | null;
  endDate: string | null;
  state: "UPCOMING" | "CURRENT" | "DONE";
  objective: string;
  clientMilestone: string;
  order: number;
}

export interface Contact {
  id: string;
  name: string;
  email: string;
  company: string;
  role: string;
  userId: string | null;
}

export type MeetingBlock = "HIGHLIGHTS" | "STREAM_STATUS" | "TOPICS" | "ALERT_CARDS" | "PLANNING" | "ACTIONS" | "DECISIONS";

/** Blocs d'un type de séance, dans l'ordre d'affichage. Les deux derniers sont des vues à date du kanban. */
export const BLOCK_LABELS: Record<MeetingBlock, string> = {
  HIGHLIGHTS: "Faits marquants",
  STREAM_STATUS: "Statut des streams",
  TOPICS: "Sujets",
  DECISIONS: "Décisions (registre)",
  ACTIONS: "Relevé des actions",
  ALERT_CARDS: "Cartes en vigilance ou en alerte (à date)",
  PLANNING: "Planning des cartes par stream (à date)",
};
export const BLOCK_ORDER: MeetingBlock[] = ["HIGHLIGHTS", "STREAM_STATUS", "TOPICS", "DECISIONS", "ACTIONS", "ALERT_CARDS", "PLANNING"];
/** Blocs rattachés à une séance datée (les autres sont des vues à date du kanban). */
export const SESSION_BLOCKS: MeetingBlock[] = ["HIGHLIGHTS", "STREAM_STATUS", "TOPICS", "DECISIONS", "ACTIONS"];

export type ActionParty = "WIFIRST" | "CLIENT" | "JOINT";
export interface Action {
  id: string;
  title: string;
  note: string;
  party: ActionParty;
  ownerId: string | null;
  streamId: string | null;
  cardId: string | null;
  meetingTypeId: string | null;
  meetingId: string | null;
  dueDate: string | null;
  status: "OPEN" | "DONE" | "CANCELLED";
  closedAt: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

export interface Decision {
  id: string;
  title: string;
  detail: string;
  status: "PENDING" | "TAKEN";
  decidedOn: string | null;
  streamId: string | null;
  cardId: string | null;
  topicId: string | null;
  meetingTypeId: string | null;
  meetingId: string | null;
  order: number;
  createdAt: string;
  updatedAt: string;
}

/** Réglages d'un type de séance : libellés des colonnes et e-mail du compte rendu. */
export interface MeetingTypeSettings {
  statusLabel?: string;
  progressLabel?: string;
  alertsLabel?: string;
  decisionLabel?: string;
  /** objet de l'e-mail ; variables {type}, {date}, {date_longue}, {compte}, {client} */
  mailSubject?: string;
  mailTo?: string;
  mailCc?: string;
  mailIntro?: string;
  mailOutro?: string;
  /** compte Gmail d'envoi (pour ouvrir le bon compte quand plusieurs sont connectés) */
  mailAccount?: string;
}

export interface MeetingType {
  id: string;
  name: string;
  emoji: string;
  frequency: string;
  description: string;
  guide: string;
  blocks: MeetingBlock[];
  order: number;
  settings: MeetingTypeSettings;
  active: boolean;
}

export interface GovernanceBody {
  id: string;
  scope: "INTERNAL" | "JOINT";
  name: string;
  purpose: string;
  participants: string;
  frequency: string;
  support: string;
  order: number;
}

export interface Bootstrap {
  account: {
    id: string;
    slug: string;
    name: string;
    clientName: string;
    clientShortName: string;
    emoji: string;
    description: string;
    modules: Modules;
    settings: AccountSettings;
    archived: boolean;
  };
  role: Role;
  streams: Stream[];
  sprints: Sprint[];
  options: Option[];
  meetingTypes: MeetingType[];
  contacts: Contact[];
  governance: GovernanceBody[];
}

export interface Card {
  id: string;
  ref: number;
  title: string;
  emoji: string;
  description: string;
  progressNote: string;
  nextSteps: string;
  alertsNote: string;
  startDate: string | null;
  dueDate: string | null;
  progressPct: number | null;
  position: number;
  streamId: string | null;
  sprintId: string | null;
  statusId: string | null;
  alertLevelId: string | null;
  ownerId: string | null;
  archived: boolean;
  createdAt: string;
  updatedAt: string;
  contentUpdatedAt: string;
  commentCount?: number;
}

export interface Highlight {
  id: string;
  meetingId: string;
  title: string;
  emoji: string;
  detail: string;
  streamId: string | null;
  typeId: string | null;
  authorId: string | null;
  order: number;
}

export interface StreamStatus {
  id: string;
  meetingId: string;
  streamId: string | null;
  statusIds: string[];
  progress: string;
  alerts: string;
  order: number;
}

export interface Topic {
  id: string;
  meetingId: string;
  title: string;
  emoji: string;
  themeId: string | null;
  natureId: string | null;
  description: string;
  decisionRequest: string;
  order: number;
}

export interface Meeting {
  id: string;
  meetingTypeId: string;
  date: string;
  notes: string;
  highlights: Highlight[];
  statuses: StreamStatus[];
  topics: Topic[];
}

export interface Risk {
  id: string;
  title: string;
  typeId: string | null;
  statusId: string | null;
  criticalityId: string | null;
  streamId: string | null;
  description: string;
  mitigation: string;
  instance: string;
  dueDate: string | null;
  openedAt: string;
  ownerId: string | null;
  cardIds: string[];
}

export interface Comment {
  id: string;
  body: string;
  createdAt: string;
  authorId: string | null;
  authorName: string | null;
}

export interface AuditEntry {
  id: string;
  entityType: string;
  entityId: string;
  action: string;
  summary: string;
  changes: Record<string, [unknown, unknown]> | Record<string, unknown>;
  userName: string;
  viaAssistant: boolean;
  createdAt: string;
}

export interface Member {
  membershipId: string;
  role: Role;
  user: { id: string; email: string; name: string; active: boolean; isSuperAdmin: boolean; lastLoginAt: string | null };
}

export interface CardLite {
  id: string;
  ref: number;
  title: string;
  emoji: string;
  dueDate: string | null;
  ownerId: string | null;
  streamId: string | null;
  statusId: string | null;
  alertLevelId: string | null;
}

export interface Dashboard {
  today: string;
  sprint: {
    id: string;
    name: string;
    startDate: string | null;
    endDate: string | null;
    objective: string;
    clientMilestone: string;
    timeline: { daysTotal: number; daysElapsed: number; daysLeft: number } | null;
    total: number;
    done: number;
    byStatus: { id: string | null; count: number }[];
    byStream: { id: string; total: number; done: number; alerts: number }[];
  } | null;
  alerts: { id: string; count: number }[];
  overdue: CardLite[];
  overdueCount: number;
  dueSoon: CardLite[];
  dueSoonCount?: number;
  mine: CardLite[] | null;
  risks: {
    open: number;
    total: number;
    byCriticality: { id: string; count: number }[];
    overdue: { id: string; title: string; dueDate: string | null; criticalityId: string | null; ownerId: string | null }[];
  };
  meetings: { typeId: string; count: number; last: { date: string; id: string } | null; next: string | null }[];
  activity: { id: string; entityType: string; entityId: string; action: string; summary: string; userName: string; viaAssistant: boolean; createdAt: string }[];
}

export interface SearchResults {
  query: string;
  cards: { id: string; ref: number; title: string; emoji: string; streamId: string | null; statusId: string | null; archived: boolean; snippet: string }[];
  risks: { id: string; title: string; criticalityId: string | null; snippet: string }[];
  topics: { id: string; title: string; emoji: string; meetingId: string; meetingTypeId: string; date: string; snippet: string }[];
  highlights: { id: string; title: string; emoji: string; meetingId: string; meetingTypeId: string; date: string; snippet: string }[];
  contacts: { id: string; name: string; company: string; role: string; email: string }[];
  streams: { id: string; name: string; emoji: string; leader: string; prescriber: string }[];
}

export interface ApiToken {
  id: string;
  name: string;
  prefix: string;
  readOnly: boolean;
  lastUsedAt: string | null;
  expiresAt: string | null;
  createdAt: string;
}

/** Carte allégée des vues de synthèse (quoi de neuf, revue de stream, bilan de sprint). */
export interface ReviewCard extends CardLite {
  sprintId: string | null;
  alertsNote: string;
  progressNote: string;
  nextSteps: string;
  contentUpdatedAt: string;
}

/** Ce qui a changé depuis la séance précédente du même type. */
export interface MeetingChanges {
  since: string;
  until: string;
  previousMeetingId: string | null;
  cards: {
    created: ReviewCard[];
    done: ReviewCard[];
    moved: ReviewCard[];
    alertUp: ReviewCard[];
    alertDown: ReviewCard[];
    due: { card: ReviewCard; from: string | null; to: string | null }[];
    updated: number;
    deleted: { id: string; summary: string }[];
  };
  streams: { streamId: string | null; before: string[]; after: string[]; statusChanged: boolean; textChanged: boolean; isNew: boolean }[];
  actions: {
    created: { id: string; title: string; party: ActionParty; streamId: string | null; status: Action["status"] }[];
    closed: { id: string; title: string; party: ActionParty; streamId: string | null; status: Action["status"] }[];
  };
  decisions: { id: string; title: string; status: Decision["status"]; decidedOn: string | null; meetingTypeId: string | null; streamId: string | null }[];
  sprintSwitches: { summary: string; at: string }[];
}

/** Revue d'un stream : point hebdomadaire avec le stream leader. */
export interface StreamReview {
  stream: Stream;
  cards: ReviewCard[];
  status: (StreamStatus & { date: string; meetingTypeId: string; meetingId: string }) | null;
  previousStatus: (StreamStatus & { date: string }) | null;
  highlights: (Highlight & { date: string; meetingTypeId: string })[];
  actions: Action[];
  decisions: Decision[];
  risks: Risk[];
  activity: { id: string; entityId: string; action: string; summary: string; userName: string; createdAt: string }[];
}

/** Bilan d'un sprint (à la bascule). */
export interface SprintReview {
  sprint: Sprint;
  next: Sprint | null;
  switchedAt: string | null;
  period: { from: string; to: string };
  stats: { total: number; done: number; carried: number; alerts: number };
  done: ReviewCard[];
  carried: ReviewCard[];
  alerts: ReviewCard[];
  decisions: Decision[];
  actionsClosed: Action[];
  actionsOpen: Action[];
  highlights: (Highlight & { date: string })[];
}
