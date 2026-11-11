# Rollback, Disconnect Resilience, and Recovery Report

> **Scope Note:** All rollback, timeout-idempotency, orphan quarantine, off-router backup gating, SHA-256 tamper rejection, and HTTPS cloud recovery behaviors described below were verified in backend TypeScript/Jest suites using stateful router mocks (`apps/api/src/modules/mikrotik-provisioning/backup-recovery-and-executor.spec.ts` and `remediation-security-and-topology.spec.ts`). Live RouterOS hardware/CHR recovery testing has not yet been executed in this environment.

---

## 1. Pre-Change Rollback Architecture (`C-2`)

Implemented in `apps/api/src/modules/mikrotik-provisioning/services/command-executor.service.ts`:

### 1.1 Dynamic Pre-Change State Capture (`captureDynamicPreChangeRollback`)
Before dispatching any mutating command in `runPreparedExecution`:
- **`/set` commands:** Queries `${basePath}/print` (4s race timeout). Locates target row by `.id`, `numbers`, or singleton paths (`/ip/dns`, `/system/identity`, `/system/clock`, `/system/ntp/client`, `/system/note`). Records a rollback `/set` command preserving the exact pre-change values for every attribute about to be modified. If the planner already provided `cmd.rollbackWords`, merges/uses captured prior state.
- **`/remove` commands:** Queries `${basePath}/print` and reconstructs a full `${basePath}/add` command copying all writable attributes from the original row (excluding `READONLY_ROUTEROS_ATTRS`), rather than losing non-default fields upon rollback.
- **`/add` commands:** Captures the returned RouterOS `.id` (`extractCreatedResourceId`) and pushes `{ createdId, basePath, rollbackWords: ['${basePath}/remove', '=.id=${createdId}'] }` onto `rollbackStack`, persisting `rollbackJournal` metadata to `provisioning_operations.verificationResult` as steps execute.

### 1.2 Rollback Triggers & Reconnect Retry (`runTrackedRollback`)
Rollback executes in strict LIFO order (`[...rollbackStack].reverse()`) on:
1. Any command failure inside a planned stage (`stageError`).
2. User cancellation (`requestCancellation` / `cancelRequested === true` read from DB before every stage and every command -> `handleCancellationRollback`).
3. Post-provisioning independent verification failure (`verification.overallStatus === 'VERIFICATION_FAILED'`).
4. Any unexpected runtime exception caught by the outer `catch` block when `activeClient && rollbackStack.length > 0`.

Each rollback command runs with an 8,000 ms timeout; if a transient network/socket failure occurs (`timeout|ECONNRESET|ETIMEDOUT|socket|disconnect|Not connected`), `runTrackedRollback` attempts `client.connect()` and retries the rollback step once.

### 1.3 Post-Rollback Live Verification (`ROLLED_BACK` vs `FAILED`)
After executing `rollbackStack`:
- Checks router reachability via `client.ping()`.
- Queries `${basePath}/print` for every `createdId` pushed to `rollbackStack` and verifies the resource `.id` is no longer present on the router (`verify gone`).
- **Truthful Terminal Status:**
  - `ROLLED_BACK` is recorded **only** when `rollbackReport.attempted > 0 && rollbackReport.allSucceeded === true` (zero rollback failures and post-rollback verification succeeded).
  - If any rollback item fails or a created resource still exists on the router, status is marked `FAILED` (never falsely `ROLLED_BACK`).

---

## 2. Concurrency Lock, Orphan Quarantine, and Timeout Idempotency (`H-3`, `H-5`)

- **Startup & Pre-Start Orphan Quarantine (`quarantineOrphanedOperations`):**
  - Invoked on NestJS `onModuleInit()` and before checking active device locks in `startPlanExecution`.
  - Finds any `PENDING`, `CONNECTING`, `BACKING_UP`, `EXECUTING`, `VERIFYING`, or `CANCELLING` rows left over from a prior process crash/restart and marks them `FAILED` with diagnostic reason (including any persisted `rollbackJournal` note if present) and clears in-memory lock set if needed.
- **Persistent Device Concurrency Lock:**
  - `startPlanExecution` checks both `DevicesService.activeDeviceOperations` and DB `provisioningOperation.findFirst` (`status: { in: ACTIVE_OPERATION_STATUSES }`), throwing `409 Conflict` (`DEVICE_OPERATION_IN_PROGRESS`) if an active operation exists.
- **Idempotent `/add` Timeout / Socket-Drop Recovery (`executeSingleCommandWithTimeoutAndSafeRetry` & `verifyIfAddAlreadyApplied`):**
  - When a command fails with a transient timeout or socket disconnect after dispatch:
    1. Attempts reconnection (`client.connect()`).
    2. For `/add` commands, inspects `${basePath}/print` matching identifying keys (`name`, `bridge+interface`, `address+interface`, `host`, or `comment`).
    3. If the resource already exists on the router with a valid RouterOS `.id`, returns `{ ret: found['.id'] }` so `rollbackStack` still captures it **without re-sending `/add`** (preventing duplicate rules).
    4. Only re-sends the command if `cmd.safeToRetry === true`.

---

## 3. Off-Router Backup Policy & SHA-256 Verification (`C-5`)

Implemented in `ProvisioningBackupService` (`provisioning-backup.service.ts`) and `ProvisioningBackupStorageService` (`provisioning-backup-storage.service.ts`):
- **Pre-Backup Checks:** Verifies live `client.ping()` (`ROUTER_UNREACHABLE`) and sufficient router free disk (`< 128 KB` -> `INSUFFICIENT_ROUTER_DISK`).
- **AES Password Encryption:** Encrypted binary `.backup` password derived deterministically per tenant/device or caller-supplied password; plaintext backups are rejected by API/REST clients.
- **Cloud Upload & Status Separation:**
  - Uploads binary backup and `.rsc` export (when available) to private Supabase Storage bucket (`router-backups`).
  - Records `RouterBackup.status = 'VERIFIED'` **only** if `cloudStored && checksumSha256`; otherwise persists `'READY'`.
- **Mandatory `CLEAN_SETUP` Gate:** When `template === 'CLEAN_SETUP'`, `CommandExecutorService` passes `requireOffRouterBackup: true`. If binary backup download or off-router cloud upload/SHA-256 fails, `ProvisioningBackupService` throws `OFF_ROUTER_BACKUP_REQUIRED` (`BadGatewayException`), aborting **before** any configuration mutation executes.
- **Download Integrity (`downloadBackupById`):** Recomputes SHA-256 over downloaded bytes and throws `BACKUP_CHECKSUM_MISMATCH` if tampered or corrupted.

---

## 4. Disaster Recovery & Cloud Fallback (`ProvisioningRecoveryService`)

Implemented in `apps/api/src/modules/mikrotik-provisioning/services/provisioning-recovery.service.ts`:
- **Safety Preconditions:** Requires explicit confirmations (`confirmed`, `acknowledgeReboot`, `acknowledgeDisconnect`), acquires device concurrency lock (`DEVICE_OPERATION_IN_PROGRESS`), rejects `.rsc` auto-restore (`RSC_MANUAL_REVIEW_REQUIRED`), and blocks filenames with `..` or non-`.backup` extensions (`INVALID_BACKUP_FILENAME`).
- **Model & ROS Version Compatibility Warning (`H-2`):** Compares `backupRecord.deviceModel` and `backupRecord.routerOsVersion` against live `/system/resource` + `/system/routerboard` values and records `compatibilityWarning` on `RecoveryOperation`.
- **Automatic Cloud HTTPS `/tool/fetch` Fallback:** If `/file/print` shows the `.backup` file was deleted from router flash:
  1. Verifies backup exists in private cloud storage (`backupRecord.storagePath`). If missing, throws `BACKUP_MISSING_ON_ROUTER`.
  2. Downloads cloud bytes and verifies SHA-256 against `backupRecord.checksumSha256` (`BACKUP_CHECKSUM_MISMATCH` aborts before transfer).
  3. Generates a short-lived signed HTTPS download URL (180s) and calls `client.fetchFileFromUrl(signedUrl, targetFilename)` before running `client.restoreBackup(targetFilename, effectivePassword)`.
- **Persistent Failure Accounting (`M-2`):** Any recovery exception updates the created `RecoveryOperation` row to `status: 'FAILED'` with `errorMessage` and `completedAt` inside the `catch` block before freeing `DevicesService.activeDeviceOperations`.
