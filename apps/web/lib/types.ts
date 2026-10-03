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

export type MeetingBlock = "HIGHLIGHTS" | "STREAM_STATUS" | "TOPICS";

export interface MeetingType {
  id: string;
  name: string;
  emoji: string;
  frequency: string;
  description: string;
  guide: string;
  blocks: MeetingBlock[];
  order: number;
  settings: { statusLabel?: string; progressLabel?: string; alertsLabel?: string; decisionLabel?: string };
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
