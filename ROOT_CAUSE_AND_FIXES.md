# Root Causes and Engineering Fixes — SudaFi Remediation

This document records the root causes, affected files, implemented fixes, and automated verification coverage for all audit findings (`C-1`–`C-5`, `H-1`–`H-7`, `M-1`–`M-3`, `LOW`, and Legacy `RouterSetupScreen` ROS7/«التالي» flow).

---

## 1. Critical Findings (`C-1` to `C-5`)

### C-1: Plan Signing, Integrity, Anti-Replay, and Production Secret Enforcement
- **Root Cause:**
  1. Missing mandatory `planToken` enforcement and incomplete field checks in execution paths could allow unsigned, expired, cross-tenant, cross-device, or drift-stale plans to proceed.
  2. Plan digest comparison (`planHash`) needed explicit binding in addition to canonical payload + Ed25519 verification, and nonce consumption needed persistence beyond volatile memory alone.
  3. Default fallback signing secrets were accepted regardless of `NODE_ENV`.
- **Affected Files:**
  - `apps/api/src/modules/mikrotik-provisioning/mikrotik-provisioning.service.ts` (`assertAndConsumePlanToken`, `applyProvisioning`, `consumedPlanNonces`)
  - `apps/api/src/core/security/signing.service.ts` (`PlanSigningService`, `KNOWN_DEV_FALLBACK_KEYS`, `buildCanonicalPayload`, `signPlan`, `verifyPlan`)
  - `apps/api/src/config/env.validation.ts` (`REQUIRED_PROD_ENV_VARS`, `INSECURE_PRODUCTION_SECRET_VALUES`, `validateConfig`)
  - `apps/api/src/modules/mikrotik-provisioning/services/router-discovery-engine.service.ts` (`discover`)
- **Fix Implemented:**
  - Enforced mandatory `planToken` object validation in `MikrotikProvisioningService.assertAndConsumePlanToken`, rejecting missing/empty `tenantId`, `deviceId`, `sessionId`, `nonce`, `snapshotHash`, `canonicalPayload`, `signature`, `publicKey`, or `expiresAt` (`PLAN_TOKEN_REQUIRED` / `INVALID_PLAN_TOKEN`).
  - Bound `tenantId` & `deviceId` (`PLAN_TOKEN_SCOPE_MISMATCH`), `token.planHash` vs rebuilt `rebuiltPlan.planHash` (`PLAN_DRIFT_DETECTED`), expiration timestamp (`PLAN_TOKEN_EXPIRED`), live router `snapshotHash` (`ROUTER_STATE_DRIFT_DETECTED`), canonical command payload digest, and Ed25519 cryptographic signature (`PLAN_TOKEN_SIGNATURE_INVALID`).
  - Enforced replay protection both in-memory (`consumedPlanNonces`) and in PostgreSQL (`provisioningOperation.findMany` checking `configSnapshot._planNonceId`), raising `PLAN_TOKEN_REPLAY_DETECTED`.
  - Refused `NODE_ENV=production` boot in both `PlanSigningService` and `validateConfig` when `ENCRYPTION_KEY` or required production secrets are missing or match known development/fallback keys.
- **Verification:** Covered in `apps/api/src/modules/mikrotik-provisioning/remediation-security-and-topology.spec.ts` (`C-1` describe block: 2 tests, passed in Jest).

### C-2: Complete Tracked Rollback Across `/add`, `/set`, `/remove`, Disconnects, and Post-Verification
- **Root Cause:**
  1. Rollback did not dynamically snapshot original attribute values for `/set` (including singleton paths like `/ip/dns`, `/system/identity`, `/system/clock`, `/system/ntp/client`, `/system/note`) or full attribute sets before `/remove`.
  2. Transient socket drops during rollback or unhandled execution exceptions (`catch` block in `runPreparedExecution`) could leave partial mutations or inaccurately report `ROLLED_BACK` without verifying that created resources were actually deleted from the router.
- **Affected Files:**
  - `apps/api/src/modules/mikrotik-provisioning/services/command-executor.service.ts` (`captureDynamicPreChangeRollback`, `runTrackedRollback`, `persistRollbackJournal`, `runPreparedExecution`, `handleCancellationRollback`)
  - `apps/mobile/lib/features/auto_provisioning/models/auto_provisioning_models.dart` (`AutoProvisionOperationModel.isTerminal`)
  - `apps/mobile/lib/features/auto_provisioning/widgets/provisioning_common_widgets.dart` (`translateProvisionStatus`, `statusColorForProvision`)
- **Fix Implemented:**
  - Implemented `captureDynamicPreChangeRollback`: queries `[basePath/print]` before executing `/set` or `/remove`, reconstructing full `basePath/add` attributes on `/remove` (filtering `READONLY_ROUTEROS_ATTRS`) and exact prior attribute values on `/set` (handling singletons and `.id`/`numbers` resources).
  - Updated `runPreparedExecution` stage-failure, post-verification failure, cancellation, and outer `catch` handlers to execute `runTrackedRollback` in reverse stack order.
  - Added reconnect-and-single-retry on transient socket errors inside `runTrackedRollback` (`timeout|ECONNRESET|ETIMEDOUT|socket|disconnect|Not connected`), followed by live verification (`client.ping()` and `basePath/print` checking `createdId` absence).
  - Enforced status discipline: sets `ROLLED_BACK` only when `rollbackReport.attempted > 0 && rollbackReport.allSucceeded` is true; otherwise persists `FAILED` (`verificationResult.rollbackReport` persisted in DB).
- **Verification:** Covered in `remediation-security-and-topology.spec.ts`, `backup-recovery-and-executor.spec.ts`, and `apps/mobile/test/remediation_mobile_test.dart`.

### C-3: RouterOS 7 REST API & Binary API Normalization
- **Root Cause:**
  - RouterOS 7 REST differs from Binary API in path & verb conventions (`/add` -> `PUT base`, `/remove` -> `POST` with `numbers`, `/set` -> `PATCH` on `.id` with fallback to CLI `POST .../set` on 400/405/501, singleton `/set` paths without `.id`), `/file` returning a single object instead of an array when 1 file exists, legacy `/export show-sensitive=no` incompatibility on ROS6, and ROS7 `/interface/wifi` vs ROS6 `/interface/wireless` vs ROS7 `/system/ntp/client/servers/add`.
- **Affected Files:**
  - `apps/api/src/core/mikrotik/clients/routeros-rest.client.ts` (`runRawCommand`, `toArray`, `SINGLETON_SET_PATHS`, `listFiles`, `createRscExport`, `downloadFile`)
  - `apps/api/src/core/mikrotik/clients/routeros-api.client.ts` (`createBackup`, `restoreBackup`, `createRscExport`, `listNatRules`, `listMangleRules`, `listFilterRules`, `listRoutes`, `listBondingInterfaces`, `fetchFileFromUrl`, `downloadFile`)
  - `apps/api/src/modules/mikrotik-provisioning/adapters/routeros6.adapter.ts`
  - `apps/api/src/modules/mikrotik-provisioning/adapters/routeros7.adapter.ts`
  - `apps/api/src/modules/mikrotik-provisioning/adapters/base-routeros.adapter.ts`
- **Fix Implemented:** Unified `runRawCommand` translation, added `toArray()` normalization across REST list endpoints (including `/file`), added ROS6/ROS7 `/export show-sensitive=no` graceful fallback, and aligned adapter stages per detected capabilities (`WIFI_QCOM`, `WIFIWAVE2`, `LEGACY_WIRELESS`, `NTP_V7`, `SNTP_V6`, `NTP_PKG_V6`).
- **Verification:** Verified in Jest (`routeros-rest.client.spec.ts`, `router-capability-and-compatibility.spec.ts`); **note:** live RouterOS 6/7 hardware or CHR routers were not available in this Windows environment (documented in `ROUTEROS_COMPATIBILITY_REPORT.md`).

### C-4: Secret Redaction Across Previews, Logs, Errors, and Persistence
- **Root Cause:** Multi-word secrets containing spaces (e.g., WiFi `security.passphrase` / `wpa2-pre-shared-key`), JSON secret properties, and HTTP `Authorization` headers could leak into `commandMasked`, API responses, DB `configSnapshot`, or error logs.
- **Affected Files:**
  - `apps/api/src/modules/mikrotik-provisioning/utils/secret-redactor.util.ts` (`isSensitiveFieldName`, `maskExecutionWords`, `maskSecretsInText`, `sanitizeStructuredSecrets`)
  - `apps/api/src/modules/mikrotik-provisioning/adapters/base-routeros.adapter.ts` (`makeCmd`)
  - `apps/api/src/modules/mikrotik-provisioning/services/provisioning-logger.service.ts` (`createOperationRecord`)
- **Fix Implemented:**
  - `maskExecutionWords` redacts full RouterOS `=key=value` tokens per word before joining spaces.
  - `maskSecretsInText` captures multi-word CLI secrets up to the next ` =<key>=` boundary, JSON secrets, query/KV secrets, and `Basic`/`Bearer` Authorization headers, while `_planNonceId` is preserved by `sanitizeStructuredSecrets` (tested explicitly).
- **Verification:** Unit/integration tests in `remediation-security-and-topology.spec.ts` (`C-4` test passed in Jest).

### C-5: Backup & Recovery Reliability, Off-Router Enforcement, SHA-256 Verification, and Cloud Fallback
- **Root Cause:**
  1. `CLEAN_SETUP` could proceed even when off-router cloud backup failed.
  2. Unverified local-only backups risked appearing `VERIFIED`, and downloaded backups lacked strict SHA-256 verification.
  3. Recovery failed completely if the `.backup` file had been removed from router flash even though a verified copy existed in private cloud storage.
- **Affected Files:**
  - `apps/api/src/modules/mikrotik-provisioning/services/provisioning-backup.service.ts` (`createBackupBundle`, `downloadBackupById`)
  - `apps/api/src/modules/mikrotik-provisioning/services/provisioning-backup-storage.service.ts` (`ProvisioningBackupStorageService`)
  - `apps/api/src/modules/mikrotik-provisioning/services/provisioning-recovery.service.ts` (`restoreBackup`)
  - `apps/api/src/core/mikrotik/utils/router-file-transfer.util.ts` (`downloadRouterFileOverHttp`)
- **Fix Implemented:**
  - Enforced `requireOffRouterBackup: true` when `template === 'CLEAN_SETUP'` (`OFF_ROUTER_BACKUP_REQUIRED` before any mutation).
  - Status is `VERIFIED` only when `cloudStored && checksumSha256`, otherwise `READY`.
  - `downloadBackupById` verifies SHA-256 and throws `BACKUP_CHECKSUM_MISMATCH` on tamper/corruption.
  - `downloadRouterFileOverHttp` blocks plaintext HTTP file downloads for non-loopback hosts and rejects HTML error pages / length mismatches.
  - `ProvisioningRecoveryService.restoreBackup` detects missing router flash file -> downloads cloud object -> verifies SHA-256 -> generates short-lived signed HTTPS URL -> calls `client.fetchFileFromUrl` (`/tool/fetch`), and blocks path traversal (`..`).
- **Verification:** Jest tests in `backup-recovery-and-executor.spec.ts` and `remediation-security-and-topology.spec.ts` (`C-2 & C-5 & M-2` block: 4 tests passed).

---

## 2. High Findings (`H-1` to `H-7`)

| ID | Summary of Root Cause | Remediation Applied | Key Files |
| :--- | :--- | :--- | :--- |
| **H-1** | Hardcoded/optimistic verification flags (`securityPoliciesVerified: true`) and boolean default mismatches could mark broken/unsecured deployments `COMPLETED` (`VERIFIED_READY`). | `CommandExecutorService.verifyPostProvisioning` queries live `listNatRules`, `listMangleRules`, `listFilterRules`, `listRoutes`, `listHotspotServers`, and `pingHost`; aligned `protectManagementAccess !== false` default; separates `VERIFIED_READY`, `PARTIALLY_VERIFIED`, `DEGRADED`, and `VERIFICATION_FAILED` (triggering automatic rollback on `VERIFICATION_FAILED`). | `command-executor.service.ts` |
| **H-2** | Recovery compatibility check referenced wrong/mismatched Prisma device model property instead of `deviceModel`. | Standardized on `deviceModel` in Prisma schema, `ProvisioningBackupService` creation, `ProvisioningRecoveryService` compatibility checks, and Jest mocks. | `schema.prisma`, `provisioning-backup.service.ts`, `provisioning-recovery.service.ts` |
| **H-3** | Concurrency & cancellation relied only on in-memory `Set`; backend restarts left orphaned `EXECUTING`/`PENDING` operations permanently locking devices. | `CommandExecutorService.quarantineOrphanedOperations` (`onModuleInit` + pre-start check) marks orphaned operations `FAILED`; active lock checks both `DevicesService.activeDeviceOperations` and DB `ACTIVE_OPERATION_STATUSES`; `cancelRequested` polled from DB before every stage & command (`handleCancellationRollback`). | `command-executor.service.ts`, `provisioning-logger.service.ts` |
| **H-4** | Management/WAN overlap checks missed PPPoE-over-Ethernet, VLAN-over-Bridge, Bonding, link-down surviving ports, and multi-route/ECMP egress attribution. | Added `traceToPhysicalPorts` recursion (`pppoe-client` -> parent, `vlan` -> parent, `bonding` -> `slaves` with strict String/Array validation, `bridge` -> active `bridgePorts`) and `resolveActiveDefaultRoutesEgress` (`gateway-status`, `immediate-gw`, strict unambiguous subnet attribution, ECMP list); fail-closed on ambiguity, link-down-only survivors, or non-WAN egress. | `topology-helpers.util.ts`, `provisioning-validator.service.ts`, `router-discovery-engine.service.ts` |
| **H-5** | Retry blindly re-sent `/add` after network timeout/socket drop, causing duplicate rules or silent inconsistency. | `executeSingleCommandWithTimeoutAndSafeRetry` reconnects after transient errors, runs `verifyIfAddAlreadyApplied` (querying `/print` by `name`/`bridge+interface`/`address+interface`/`host`/`comment`) to recover `.id` without duplicate creation, and only retries when `cmd.safeToRetry` is explicitly `true`. | `command-executor.service.ts` |
| **H-6** | Database migration, FK integrity, and multi-tenant Postgres RLS policies lacked verification and request-scoped GUC binding. | Reviewed `migration.sql` (6 tables, 21 FKs, 6 RLS policies supporting both `app.current_tenant_id` GUC and optional `auth.jwt()`), implemented `PrismaService.withTenantRls` transaction-local `set_config(..., true)`, and executed full validation on an isolated local PostgreSQL 18.1 instance. | `migration.sql`, `prisma.service.ts`, `mikrotik-provisioning.service.ts` |
| **H-7** | Discovery swallowed core query failures silently and could plan/apply against incomplete or cached topologies. | Added `discoveryCompleteness` (`isComplete`, `failedCoreQueries`) distinguishing core vs optional queries -> throws `DISCOVERY_INCOMPLETE` fail-closed; discovery cache TTL tightened (30s) and bypassed (`forceRefresh: true`) before `applyProvisioning`; `snapshotHash` bound into signed `planToken`. | `router-discovery-engine.service.ts`, `mikrotik-provisioning.service.ts` |

---

## 3. Medium Findings (`M-1` to `M-3`), `LOW` Environment Hardening, and Legacy `RouterSetupScreen`

- **M-1 (`enableLocalUsageScript` vs `[find]` guard):** `CommandExecutorService.assertCommandSafeToExecute` specifically blocks wildcard `[find` syntax (`UNSAFE_WILDCARD_COMMAND_BLOCKED`) while allowing safe date logging commands (`[/system clock get date]`) in `RouterOs7Adapter` / `RouterOs6Adapter`.
- **M-2 (WAN Switch State Reset & Failed Recovery Audit Status):**
  - `apps/mobile/lib/features/auto_provisioning/presentation/auto_provisioning_screen.dart` resets `_confirmWanChange = false` and `_preview = null` immediately when changing WAN interface or WAN mode.
  - `ProvisioningRecoveryService.restoreBackup` wraps recovery execution in a persistent `RecoveryOperation` update (`status: 'FAILED'`, `errorMessage`, `completedAt`) in its `catch` handler rather than leaving `EXECUTING` dangling.
- **M-3 (Single-Object REST Normalization & Cache Clearing):** `RouterOsRestClient.toArray()` normalizes single JSON object responses from `/file` and list endpoints into 1-element arrays; `CommandExecutorService` clears discovery cache (`this.discoveryService.clearCache`) upon completion.
- **LOW (Production Env Guard):** `apps/api/src/config/env.validation.ts` (`validateConfig`) blocks startup in `NODE_ENV=production` if any key in `REQUIRED_PROD_ENV_VARS` or `REDIS_URL`/`REDIS_HOST` is missing or equals any `INSECURE_PRODUCTION_SECRET_VALUES`. *(See `SECURITY_AUDIT.md` regarding pre-existing dev `.default(...)` values in `envSchema` for non-production.)*
- **Legacy `RouterSetupScreen` & ROS7 «التالي» Flow:**
  - Root cause: `RouterSetupScreen` allowed stale/unauthenticated TCP reachability or version misclassification to downgrade ROS7 devices to `V6`, mishandled empty local passwords in `ACCOUNT` mode on private LAN IPs, and risked skipping prerequisite test/discovery/clean-setup gates. Meanwhile `MikrotikDiscoveryService._writeAndReadSentences` used an invalid `sock.addByte(0)` / ternary defect that could break Binary API sentence framing on Dart sockets.
  - Fixes implemented:
    - `apps/mobile/lib/features/router_setup/presentation/router_setup_screen.dart`: In `ACCOUNT` mode (`pass.isEmpty`), delegates connection tests on private IPs to backend `testConnectionDirect` without downgrading `_rosVersion` to `V6`; `_canAdvance()` enforces verified connection test on Step 0, complete non-empty discovery on Step 1, WAN+LAN selection on Step 3, valid non-empty preview + clean confirmation on Step 4.
    - `apps/mobile/lib/core/services/mikrotik_discovery_service.dart`: `verifyCredentialsLocally` attempts authenticated REST (`/rest/system/resource`) and falls back to authenticated `_LocalMikrotikBinaryApiClient` (supporting both post-6.43 `/login` plaintext and legacy `< 6.43` MD5 challenge-response, with atomic `BytesBuilder` sentence framing via `sock.add(frame.takeBytes())`), never treating raw TCP port open as valid login.
  - Verification: `apps/mobile/test/remediation_mobile_test.dart` (Dart loopback `ServerSocket` tests + `RouterSetupScreen` widget test) + full `flutter analyze --no-pub` + 7 targeted Flutter test files (44/44 passed).
