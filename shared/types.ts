// Shared types for Swanson: consumed by both Electron client and OpenClaw server

// ─── Plan Schema ───────────────────────────────────────────────────────────────

export type PlanStatus = "draft" | "refined" | "approved" | "exported";

export interface IPlanQuestion {
  question: string;
  answer: string;
}

export interface IPlanStep {
  id: string;
  title: string;
  description: string;
  repository: string;
  files: string[];
  dependencies: string[];
  acceptance_criteria: string[];
}

export interface IPlanContext {
  repositories: string[];
  affected_files: string[];
  new_files: string[];
  patterns_referenced: string[];
}

export interface IPlanSpawneeConfig {
  model: string;
  branch_prefix: string;
}

export interface IPlan {
  id: string;
  title: string;
  status: PlanStatus;
  narrative: string;
  questions_resolved: IPlanQuestion[];
  context: IPlanContext;
  steps: IPlanStep[];
  acceptance_criteria: string[];
  spawnee_config: IPlanSpawneeConfig;
  threadId: string;
  createdAt: string;
  updatedAt: string;
}

export interface IPlanSummary {
  id: string;
  title: string;
  status: PlanStatus;
  threadId: string;
  repositories: string[];
  stepCount: number;
  createdAt: string;
  updatedAt: string;
}

// ─── Thread Schema ─────────────────────────────────────────────────────────────

export interface IThreadSummary {
  id: string;
  title: string;
  userEmail: string;
  createdAt: string;
  updatedAt: string;
  planIds: string[];
  messagePreview: string;
}

// ─── Chat Messages ─────────────────────────────────────────────────────────────

export interface IChatMessage {
  id: string;
  role: "user" | "assistant";
  content: string;
  timestamp: string;
  isStreaming?: boolean;
  planId?: string;
}

// ─── WebSocket Message Envelope ────────────────────────────────────────────────

export type WSMessageType =
  // Chat
  | "chat"
  // Plan CRUD
  | "plan:update"
  | "plan:approve"
  | "plan:approved"
  | "plan:export_yaml"
  | "plan:yaml"
  | "plans:list"
  | "plans:list_response"
  | "plan:get"
  | "plan:get_response"
  // Thread CRUD
  | "thread:create"
  | "thread:created"
  | "thread:resume"
  | "thread:resumed"
  | "thread:delete"
  | "thread:deleted"
  | "thread:rename"
  | "thread:renamed"
  | "threads:list"
  | "threads:list_response"
  // System
  | "status"
  | "error"
  | "auth";

export interface IWSMessage {
  type: WSMessageType;
  sessionId: string;
  payload: unknown;
  timestamp: string;
}

// ─── Chat Payloads ─────────────────────────────────────────────────────────────

export interface IChatPayload {
  content: string;
  delta?: boolean;
  done?: boolean;
  messageId?: string;
}

// ─── Plan Payloads ─────────────────────────────────────────────────────────────

export interface IPlanUpdatePayload {
  plan: IPlan;
}

export interface IPlanApprovePayload {
  planId: string;
}

export interface IPlanApprovedPayload {
  planId: string;
  status: PlanStatus;
}

export interface IPlanExportYamlPayload {
  planId: string;
}

export interface IPlanYamlPayload {
  planId: string;
  yaml: string;
  filename: string;
}

export interface IPlansListPayload {
  status?: PlanStatus;
}

export interface IPlansListResponsePayload {
  plans: IPlanSummary[];
}

export interface IPlanGetPayload {
  planId: string;
}

export interface IPlanGetResponsePayload {
  plan: IPlan;
}

// ─── Thread Payloads ───────────────────────────────────────────────────────────

export interface IThreadCreatePayload {
  title?: string;
  userEmail: string;
}

export interface IThreadCreatedPayload {
  thread: IThreadSummary;
}

export interface IThreadResumePayload {
  threadId: string;
}

export interface IThreadResumedPayload {
  thread: IThreadSummary;
  messages: IChatMessage[];
}

export interface IThreadDeletePayload {
  threadId: string;
}

export interface IThreadDeletedPayload {
  threadId: string;
}

export interface IThreadRenamePayload {
  threadId: string;
  title: string;
}

export interface IThreadRenamedPayload {
  threadId: string;
  title: string;
}

export interface IThreadsListResponsePayload {
  threads: IThreadSummary[];
}

// ─── System Payloads ───────────────────────────────────────────────────────────

export interface IStatusPayload {
  state: "connected" | "disconnected" | "reconnecting" | "ready";
  message?: string;
}

export interface IErrorPayload {
  code: string;
  message: string;
  details?: unknown;
}

export interface IAuthPayload {
  token: string;
  userEmail: string;
}

// ─── Payload Type Map ──────────────────────────────────────────────────────────

export interface IWSPayloadMap {
  "chat": IChatPayload;
  "plan:update": IPlanUpdatePayload;
  "plan:approve": IPlanApprovePayload;
  "plan:approved": IPlanApprovedPayload;
  "plan:export_yaml": IPlanExportYamlPayload;
  "plan:yaml": IPlanYamlPayload;
  "plans:list": IPlansListPayload;
  "plans:list_response": IPlansListResponsePayload;
  "plan:get": IPlanGetPayload;
  "plan:get_response": IPlanGetResponsePayload;
  "thread:create": IThreadCreatePayload;
  "thread:created": IThreadCreatedPayload;
  "thread:resume": IThreadResumePayload;
  "thread:resumed": IThreadResumedPayload;
  "thread:delete": IThreadDeletePayload;
  "thread:deleted": IThreadDeletedPayload;
  "thread:rename": IThreadRenamePayload;
  "thread:renamed": IThreadRenamedPayload;
  "threads:list": Record<string, never>;
  "threads:list_response": IThreadsListResponsePayload;
  "status": IStatusPayload;
  "error": IErrorPayload;
  "auth": IAuthPayload;
}

// Type-safe message constructor
export interface IWSTypedMessage<T extends WSMessageType> {
  type: T;
  sessionId: string;
  payload: IWSPayloadMap[T];
  timestamp: string;
}
