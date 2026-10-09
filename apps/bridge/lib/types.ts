/** Types des réponses de l'API WiBridge. */

export type Party = "PROVIDER" | "CLIENT";
export type Access = "NONE" | "READ" | "CLIENT" | "PROVIDER" | "BOTH";
export type QStatus = "OPEN" | "IN_PROGRESS" | "CLOSED";
export type Notify = "IMMEDIATE" | "DAILY" | "NONE";

export interface User {
  id: string;
  email: string;
  name: string;
  isSuperAdmin: boolean;
}

export interface ClientSummary {
  id: string;
  slug: string;
  name: string;
  clientName: string;
  providerName: string;
  emoji: string;
  archived: boolean;
  side: Party;
  notify: Notify | null;
  member: boolean;
}

export interface Me {
  user: User;
  clients: ClientSummary[];
}

export interface Settings {
  providerAnswersForClient: boolean;
  providerEditsAll: boolean;
  clientCloseScope: "ANY" | "OWN_OR_ASSIGNED";
  clientCanReopen: boolean;
  notifications: boolean;
}

export interface Stream {
  id: string;
  name: string;
  emoji: string;
  order: number;
  active: boolean;
}

export interface Bootstrap {
  client: { id: string; slug: string; name: string; clientName: string; providerName: string; shortName: string; emoji: string; description: string; archived: boolean };
  settings: Settings;
  streams: Stream[];
  me: { side: Party; isSuperAdmin: boolean; member: boolean; notify: Notify | null; access: Record<string, Access>; canCreate: Record<Party, string[]> };
}

export interface Perms {
  edit: boolean;
  streams: string[];
  respondAs: Party[];
  close: boolean;
  reopenAs: Party[];
  reassign: boolean;
  delete: boolean;
  restore: boolean;
}

export interface LastMessage {
  party: Party;
  authorName: string;
  createdAt: string;
  excerpt: string;
  outcome: string;
  assignedAfter: Party | null;
}

export interface Question {
  id: string;
  ref: number;
  subject: string;
  body: string;
  streamIds: string[];
  askedBy: { id: string | null; name: string };
  askedByParty: Party;
  assignedParty: Party;
  status: QStatus;
  dueDate: string | null;
  createdAt: string;
  updatedAt: string;
  lastActivityAt: string;
  closedAt: string | null;
  closedByName: string;
  deletedAt: string | null;
  messageCount: number;
  fileCount: number;
  lastMessage: LastMessage | null;
  perms: Perms;
}

export interface Message {
  id: string;
  authorId: string | null;
  authorName: string;
  party: Party;
  body: string;
  outcome: "ASSIGN" | "CLOSE" | "REOPEN";
  assignedBefore: Party | null;
  assignedAfter: Party | null;
  editedAt: string | null;
  /** message supprimé : texte retiré, issue conservée */
  deletedAt: string | null;
  deletedByName: string;
  /** "navette" : réponse importée depuis la fiche navette Excel */
  source: string;
  createdAt: string;
  perms: { edit: boolean; delete: boolean };
}

export interface FileInfo {
  id: string;
  name: string;
  mime: string;
  size: number;
  messageId: string | null;
  uploadedById: string | null;
  uploadedByName: string;
  createdAt: string;
  perms: { delete: boolean };
}

export interface QuestionDetail extends Question {
  messages: Message[];
  files: FileInfo[];
}

export interface BridgeEvent {
  id: string;
  questionId: string | null;
  action: string;
  summary: string;
  changes: Record<string, unknown>;
  userId: string | null;
  userName: string;
  party: Party | null;
  createdAt: string;
}

export interface Device {
  id: string;
  label: string;
  createdAt: string;
  lastUsedAt: string;
  expiresAt: string;
  current: boolean;
}
