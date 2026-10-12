import {
  RouterHealthResult,
  HotspotBatchAddUser,
  HotspotBatchAddResult,
  HotspotUserRemoveResult,
  HotspotVerifyBatchResult,
  HotspotSessionListResult,
  PppoeProfileSyncPayload,
  PppoeProfileSyncResult,
  PppoeSecretAddPayload,
  PppoeSecretAddResult,
  PppoeSecretUpdatePayload,
  PppoeSecretUpdateResult,
  PppoeSecretStatusPayload,
  PppoeSecretStatusResult,
  PppoeSecretRemovePayload,
  PppoeSecretRemoveResult,
  PppoeSessionListResult,
  PppoeSessionDisconnectPayload,
  PppoeSessionDisconnectResult,
  HotspotPortalPublishPayload,
  HotspotPortalPublishResult,
} from '../../types';

export interface IRouterWorker {
  /**
   * Tests connectivity to the router.
   */
  ping(): Promise<boolean>;

  /**
   * Retrieves system resources (CPU, Memory, HDD, Uptime, RouterOS version).
   */
  getHealth(): Promise<RouterHealthResult>;

  /**
   * Performs an idempotent batch addition of hotspot users.
   * Reconciliation: checks existing users or catches already-existing collision to prevent duplicates.
   */
  batchAddHotspotUsers(users: HotspotBatchAddUser[]): Promise<HotspotBatchAddResult>;

  /**
   * Safely removes hotspot users by name.
   */
  removeHotspotUsers(names: string[]): Promise<HotspotUserRemoveResult>;

  /**
   * Verifies which hotspot users from the list exist on the router.
   */
  verifyHotspotUsers(names: string[]): Promise<HotspotVerifyBatchResult>;

  /**
   * Lists currently active hotspot sessions.
   */
  listActiveSessions(): Promise<HotspotSessionListResult>;

  // ---------- PPPoE / Broadband Operations ----------

  /**
   * Syncs (creates or updates) a PPP profile on the router.
   */
  syncPppoeProfile(payload: PppoeProfileSyncPayload): Promise<PppoeProfileSyncResult>;

  /**
   * Idempotently adds a PPPoE secret (/ppp/secret).
   * Reconciles matching credentials, rejects conflicts if username exists with mismatched profile/settings.
   */
  addPppoeSecret(payload: PppoeSecretAddPayload): Promise<PppoeSecretAddResult>;

  /**
   * Updates an existing PPPoE secret's settings.
   */
  updatePppoeSecret(payload: PppoeSecretUpdatePayload): Promise<PppoeSecretUpdateResult>;

  /**
   * Disables a PPPoE secret (sets disabled=yes) and optionally disconnects any active session.
   */
  disablePppoeSecret(payload: PppoeSecretStatusPayload): Promise<PppoeSecretStatusResult>;

  /**
   * Enables a PPPoE secret (sets disabled=no).
   */
  enablePppoeSecret(payload: PppoeSecretStatusPayload): Promise<PppoeSecretStatusResult>;

  /**
   * Removes a PPPoE secret (/ppp/secret/remove) and optionally disconnects any active session.
   */
  removePppoeSecret(payload: PppoeSecretRemovePayload): Promise<PppoeSecretRemoveResult>;

  /**
   * Lists currently active PPPoE sessions (/ppp/active).
   */
  listPppoeActiveSessions(): Promise<PppoeSessionListResult>;

  /**
   * Disconnects an active PPPoE session by username or session-id.
   */
  disconnectPppoeSession(payload: PppoeSessionDisconnectPayload): Promise<PppoeSessionDisconnectResult>;

  /**
   * Publishes custom HotSpot captive portal files (login.html, status.html, etc.) to the router.
   */
  publishHotspotPortal(payload: HotspotPortalPublishPayload): Promise<HotspotPortalPublishResult>;

  /**
   * Closes active connection.
   */
  disconnect(): Promise<void>;
}
