import type { DeviceConnectionConfig } from '../mikrotik-client.factory';
export type { DeviceConnectionConfig };
import type { IMikrotikClient } from './mikrotik-client.interface';

export enum OperationExecutionStatus {
  SUCCESS = 'SUCCESS', // Executed on router AND verified (read-after-write confirmed)
  FAILED = 'FAILED', // Failed on router, validation failed, or verification failed
  PENDING = 'PENDING', // In-progress or queued
  UNKNOWN = 'UNKNOWN', // Sent to router, but verification could not be confirmed (e.g. connection dropped)
}

export enum OperationFailurePhase {
  INPUT_VALIDATION = 'INPUT_VALIDATION',
  CONNECTION = 'CONNECTION',
  PRE_VERIFICATION = 'PRE_VERIFICATION', // Idempotency check / state pre-check
  COMMAND_EXECUTION = 'COMMAND_EXECUTION',
  POST_VERIFICATION = 'POST_VERIFICATION', // Read-after-write verification failed
  PERSISTENCE = 'PERSISTENCE', // Router succeeded, but DB persistence failed
}

export type OperationType = 'CREATE' | 'UPDATE' | 'DELETE' | 'ACTION' | 'QUERY';

export type ResourceType =
  | 'HOTSPOT_USER'
  | 'HOTSPOT_PROFILE'
  | 'PPP_SECRET'
  | 'PPP_PROFILE'
  | 'ACTIVE_SESSION'
  | 'FILE'
  | 'CUSTOM';

export interface PreCheckResult<TTarget = unknown> {
  canExecute: boolean;
  alreadyCompliant?: boolean;
  existingItem?: TTarget;
  reason?: string;
  reasonArabic?: string;
}

export interface PostVerifyResult<TTarget = unknown> {
  verified: boolean;
  actualItem?: TTarget | null;
  reason?: string;
  reasonArabic?: string;
}

export interface GenericOperationContext<TTarget = unknown, TResult = unknown> {
  deviceConfig: DeviceConnectionConfig;
  operationType: OperationType;
  resourceType: ResourceType;
  resourceIdentifier: string;

  /**
   * Phase 4: Pre-execution check (idempotency, existing state lookup)
   */
  preCheck?: (client: IMikrotikClient) => Promise<PreCheckResult<TTarget>>;

  /**
   * Phase 6: Command execution on router
   */
  execute: (client: IMikrotikClient, preCheck: PreCheckResult<TTarget>) => Promise<TResult>;

  /**
   * Phase 7 & 8: Read-After-Write verification
   */
  verify: (client: IMikrotikClient, executeResult: TResult, preCheck: PreCheckResult<TTarget>) => Promise<PostVerifyResult<TTarget>>;

  /**
   * Phase 9: Database persistence (ONLY called if verification succeeds)
   */
  persist?: (verifiedItem: TTarget | null, executeResult: TResult) => Promise<void>;

  /**
   * Optional compensation / rollback if persistence fails
   */
  rollbackOnPersistenceFailure?: (client: IMikrotikClient, verifiedItem: TTarget | null) => Promise<void>;
}

export interface OperationResult<T = unknown> {
  status: OperationExecutionStatus;
  phase: OperationFailurePhase | 'COMPLETED';
  resourceType: ResourceType;
  resourceIdentifier: string;
  routerId: string;
  routerHost: string;
  data?: T;
  error?: string;
  errorArabic?: string;
  durationMs: number;
  details?: Record<string, unknown>;
}
