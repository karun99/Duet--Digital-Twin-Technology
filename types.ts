
export enum AgentRole {
  PRIMARY = 'PRIMARY', // Executive, Action-Oriented (Internal Thought)
  META = 'META',       // Reflective, Philosophical (Internal Thought)
  CLONE = 'CLONE',     // The synthesized persona (Final Response)
  USER = 'USER'        // The actual user
}

export interface InternalThought {
  role: AgentRole;
  content: string;
}

export interface Attachment {
  mimeType: string;
  data: string; // base64
  name?: string;
}

export type ContextNodeType = 'link' | 'file' | 'text';

export interface ContextNode {
  id: string;
  type: ContextNodeType;
  title: string;
  content: string; // URL for links, base64 for files, raw text for text
  sourceUrl?: string; // original link, kept even after content is summarised
  mimeType?: string;
  timestamp: number;
  status?: 'idle' | 'fetching' | 'ready' | 'error';
}

/* -------------------------------------------------------------------------- */
/* MAS operating protocol                                                     */
/* -------------------------------------------------------------------------- */

export type MasMode = 'SINGLE' | 'KB-PRIMARY' | 'REFRESH' | 'SITEMAP' | 'INDEX';
export type MasStage = 0 | 1 | 2;
export type PiSection = 'identity' | 'persona' | 'context' | 'history' | 'preferences';

export interface PiField {
  id: string;
  section: PiSection;
  value: string;
  approvedAt: number;
}

export interface AuditEntry {
  id: string;
  at: number;
  action: 'read' | 'write' | 'delete' | 'disable' | 'enable';
  field: string;
  purpose: string;
}

export interface DunceEntry {
  id: string;
  at: number;
  kind: 'turn' | 'error' | 'correction';
  summary: string;
  correction?: string;
  confidenceDelta?: number;
  kbUrls?: string[];
  piUrls?: string[];
  jataka?: string[];
}

export interface MasState {
  enabled: boolean;
  piConsent: boolean;
  mode: MasMode;
  stage: MasStage;
  piFields: PiField[];
  audit: AuditEntry[];
  dunce: DunceEntry[];
  updatedAt: number;
}

/** PERSONAFORGE: persona grounding, distinctness and one-question discipline. */
export interface ForgeTrace {
  status: 'PASS' | 'FLAG' | 'VETO';
  grounded: 'SOURCE' | 'PARTIAL' | 'NONE';
  questions: number;
  notes: string[];
}

export type GuardId = 'G1' | 'G2' | 'G3' | 'G4' | 'G5' | 'G6';
export type GuardStatus = 'PASS' | 'FAIL' | 'ESCALATE' | 'DOWNGRADE' | 'FLAG' | 'LOGGED';

export interface GuardCheck {
  id: GuardId;
  name: string;
  status: GuardStatus;
  note: string;
}

export interface GovernorTrace {
  mode: MasMode;
  grounded: 'YES' | 'PARTIAL' | 'NO';
  checks: GuardCheck[];
  verdict: 'PROCEED' | 'HALT' | 'ESCALATE';
  risk: 'LOW' | 'MEDIUM' | 'HIGH';
  emoja: { status: 'PASS' | 'VETO'; note: string };
  forge?: ForgeTrace;
  kbUrls: string[];
  piUrls: string[];
  at: number;
}

export interface AgentMessage {
  id: string;
  role: AgentRole;
  content: string; // The main display content (User msg or Clone final answer)
  timestamp: number;
  internalThoughts?: InternalThought[]; // For CLONE messages, contains the Duet process
  attachments?: Attachment[];
  governor?: GovernorTrace; // JATAKA / EMOJA result for this reply
  isTyping?: boolean; // UI state
}

export interface UserProfile {
  name: string;
  bio: string;
  links?: string; // Reference URLs for knowledge base
  source: 'manual' | 'search';
  topic?: string; // Optional context for the session
  avatarUrl?: string; // URL of the generated virtual face
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export type GroundedSource = GroundingSource;

export interface SearchResult {
  bio: string;
  sources: GroundingSource[];
}

/** A saved conversation, persisted locally so a reload keeps the thread. */
export interface DuetSession {
  profile: UserProfile;
  messages: AgentMessage[];
  contextNodes: ContextNode[];
  updatedAt: number;
}

export type ToastKind = 'error' | 'success' | 'info';

export interface Toast {
  id: string;
  kind: ToastKind;
  title: string;
  detail?: string;
}
