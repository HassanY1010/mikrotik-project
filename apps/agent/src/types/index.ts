import {
  AgentStatus,
  AgentCommandStatus,
  AgentCommandType,
  PppoeAccountStatus,
  PppoeProfileItem,
  PppoeAccountItem,
  PppoeActiveSessionItem,
  PppoeProfileSyncPayload,
  PppoeSecretAddPayload,
  PppoeSecretUpdatePayload,
  PppoeSecretStatusPayload,
  PppoeSecretRemovePayload,
  PppoeSessionDisconnectPayload,
  PppoeBatchResult,
  HotspotPortalFile,
  HotspotPortalPublishPayload,
  HotspotPortalPublishResult,
} from '@mikrotik-saas/shared-types';

export {
  AgentStatus,
  AgentCommandStatus,
  AgentCommandType,
  PppoeAccountStatus,
  PppoeProfileItem,
  PppoeAccountItem,
  PppoeActiveSessionItem,
  PppoeProfileSyncPayload,
  PppoeSecretAddPayload,
  PppoeSecretUpdatePayload,
  PppoeSecretStatusPayload,
  PppoeSecretRemovePayload,
  PppoeSessionDisconnectPayload,
  PppoeBatchResult,
  HotspotPortalFile,
  HotspotPortalPublishPayload,
  HotspotPortalPublishResult,
};

export type AgentState =
  | 'UNPAIRED'
  | 'STARTING'
  | 'ONLINE'
  | 'RECONNECTING'
  | 'REVOKED'
  | 'STOPPED';

export interface RouterConfig {
  host: string;
  port: number;
  username: string;
  password?: string;
  useSsl?: boolean;
  caCertPath?: string;
  rejectUnauthorized?: boolean;
  timeoutMs?: number;
  rosVersion?: 'v6' | 'v7';
}

export interface AgentConfigFile {
  serverUrl: string;
  agentName?: string;
  heartbeatIntervalMs?: number;
  httpTimeoutMs?: number;
  maxRetries?: number;
  mockRouter?: boolean;
  router?: RouterConfig;
}

export interface StoredCredentials {
  agentId: string;
  deviceId: string;
  tenantId: string;
  token: string;
  pairedAt: string;
  serverUrl: string;
  router?: RouterConfig;
}

export interface CommandItem {
  id: string;
  operationId: string;
  type: AgentCommandType;
  payload: Record<string, any>;
  expiresAt: string;
  attempts: number;
}

export interface HeartbeatMetrics {
  uptimeSeconds?: number;
  agentUptimeSeconds?: number;
  cpuUsagePercent?: number;
  freeMemoryBytes?: number;
  memoryUsage?: number;
  routerPingMs?: number;
}

export interface HeartbeatResponse {
  serverTime: string;
  status: string;
  pendingCommands: CommandItem[];
}

export interface SubmitResultPayload {
  operationId: string;
  status: 'COMPLETED' | 'FAILED';
  result?: Record<string, any>;
  errorMessage?: string;
}

export interface RouterHealthResult {
  uptime: string;
  version: string;
  cpuLoad: number;
  memoryFree: number;
  memoryTotal: number;
  hddFree: number;
  hddTotal: number;
  boardName?: string;
  architecture?: string;
}

export interface HotspotBatchAddUser {
  name: string;
  password?: string;
  profile?: string;
  limitUptime?: string;
  limitBytesTotal?: number;
  comment?: string;
}

export interface HotspotBatchAddResult {
  total: number;
  createdCount: number;
  alreadyExistingCount: number;
  failedCount: number;
  errors?: Array<{ name: string; error: string }>;
}

export interface HotspotUserRemoveResult {
  total: number;
  removedCount: number;
  notFoundCount: number;
  failedCount: number;
}

export interface HotspotVerifyBatchResult {
  existingUsers: string[];
  missingUsers: string[];
}

export interface HotspotActiveSession {
  id: string;
  user: string;
  address: string;
  macAddress: string;
  uptime: string;
  bytesIn: number;
  bytesOut: number;
  sessionId?: string;
  server?: string;
  loginBy?: string;
  sessionTimeLeft?: string;
  idleTime?: string;
  limitBytesTotal?: number;
}

export interface HotspotSessionListResult {
  total: number;
  sessions: HotspotActiveSession[];
}

// ---------- PPPoE Worker Result Types ----------

export interface PppoeProfileSyncResult {
  name: string;
  action: 'CREATED' | 'UPDATED' | 'UNCHANGED';
  rateLimit?: string;
}

export interface PppoeSecretAddResult {
  username: string;
  status: 'CREATED' | 'ALREADY_EXISTS';
  profile: string;
  reconciled?: boolean;
}

export interface PppoeSecretUpdateResult {
  username: string;
  updated: boolean;
  fieldsModified?: string[];
}

export interface PppoeSecretStatusResult {
  username: string;
  disabled: boolean;
  activeDisconnected: boolean;
}

export interface PppoeSecretRemoveResult {
  username: string;
  removed: boolean;
  activeDisconnected: boolean;
}

export interface PppoeActiveSession {
  id: string;
  username: string;
  service: string;
  callerId?: string;
  address: string;
  uptime: string;
  encoding?: string;
  sessionId?: string;
}

export interface PppoeSessionListResult {
  total: number;
  sessions: PppoeActiveSession[];
}

export interface PppoeSessionDisconnectResult {
  disconnected: boolean;
  matchedCount: number;
  message?: string;
}

