# Security Audit Report — SudaFi Remediation

**Assessment Basis:** Static inspection of source files on disk, Jest security/topology regression suites (`248/248` tests across 11 targeted suites), Dart widget/socket loopback tests (`44/44` tests across 7 targeted suites), `flutter analyze --no-pub` (`No issues found!`), and ephemeral local PostgreSQL 18.1 RLS verification. Live customer routers and cloud production Supabase/Render deployments were **not** touched.

---

## 1. Cryptographic Plan Integrity & Anti-Replay (`C-1`)

- **Signing Algorithm & Key Derivation (`apps/api/src/core/security/signing.service.ts`):**
  - Ed25519 keypair derived via HMAC-SHA256 from `ENCRYPTION_KEY` with domain string `sudafi-ed25519-plan-signing-v1` and ASN.1 PKCS#8 DER prefix (`302e020100300506032b657004220420`).
  - Fail-fast guard in `PlanSigningService` constructor: in `NODE_ENV=production`, missing, `<32`-character, or known dev/fallback `ENCRYPTION_KEY` values (`KNOWN_DEV_FALLBACK_KEYS`) throw an immediate startup error.
- **Canonical Binding & Execution Gate (`apps/api/src/modules/mikrotik-provisioning/mikrotik-provisioning.service.ts`):**
  - `assertAndConsumePlanToken` binds every `apply` execution to:
    1. Non-empty mandatory token fields (`tenantId`, `deviceId`, `sessionId`, `nonce`, `snapshotHash`, `canonicalPayload`, `signature`, `publicKey`, `expiresAt`).
    2. Tenant/Device scope (`tokenTenantId === tenantId && tokenDeviceId === deviceId` + canonical prefix `SUDAFI-PLAN-V1:${tenantId}:${deviceId}:`).
    3. Plan digest integrity (`token.planHash === rebuiltPlan.planHash`, else `PLAN_DRIFT_DETECTED`).
    4. Live router state hash (`tokenSnapshotHash === liveSnapshotHash`, computed from a fresh `forceRefresh: true` discovery before execution; else `ROUTER_STATE_DRIFT_DETECTED`).
    5. Token TTL (`Date.now() <= Date.parse(expiresAt)`, else `PLAN_TOKEN_EXPIRED`).
    6. Exact rebuilt command digest (`canonicalPayload === expectedCanonical`) and Ed25519 signature verification (`PLAN_TOKEN_SIGNATURE_INVALID`).
    7. Anti-replay: checked against both in-memory `consumedPlanNonces` and DB `provisioningOperation` records (`configSnapshot._planNonceId`), throwing `PLAN_TOKEN_REPLAY_DETECTED`.

---

## 2. Credential & Secret Redaction (`C-4`)

- **Centralized Redactor (`apps/api/src/modules/mikrotik-provisioning/utils/secret-redactor.util.ts`):**
  - Recognizes sensitive field names (`password`, `passphrase`, `wpa-pre-shared-key`, `wpa2-pre-shared-key`, `preshared-key`, `pre-shared-key`, `shared-secret`, `radius-secret`, `backuppassword`, `backup-password`, `apikey`, `api-key`, `privatekey`, `private-key`, `token`, `accesstoken`, `refreshtoken`, `authorization`) plus dotted/hyphenated suffixes such as `security.passphrase` and `wifi.password`.
  - `maskExecutionWords`: redacts completeRouterOS API words (`=key=********`), preventing leaks when passphrases contain spaces.
  - `maskSecretsInText`: redacts multi-word RouterOS parameters (`(^|\s)=<key>=...(?=\s+=|$)`), JSON values, unprefixed `key=value`, and HTTP `Authorization: Basic/Bearer ...` headers.
  - `sanitizeStructuredSecrets`: recursively scrubs stored `configSnapshot` and error payloads while preserving non-secret correlation metadata such as `_planNonceId`.

---

## 3. Transport, SSRF, and Path Traversal Protections (`C-5`)

- **Hardened File Download (`apps/api/src/core/mikrotik/utils/router-file-transfer.util.ts`):**
  - Enforces TLS (`useSsl: true`, `https://`) for all non-loopback hosts before sending Basic Auth headers or downloading router `.backup`/`.rsc` files.
  - Strips path traversal (`..` sequences and disallowed characters) from filenames.
  - Rejects unexpected `text/html` / `application/json` responses, HTML error pages, and `Content-Length` truncation mismatches.
- **Path Traversal Guard in Recovery (`apps/api/src/modules/mikrotik-provisioning/services/provisioning-recovery.service.ts`):**
  - Rejects filenames not ending in `.backup` or containing `..` (`INVALID_BACKUP_FILENAME`).
- **Cryptographic Integrity on Backups (`provisioning-backup.service.ts` & `provisioning-recovery.service.ts`):**
  - Requires non-empty AES encryption password on `.backup` creation (`routeros-api.client.ts` / `routeros-rest.client.ts`).
  - Computes SHA-256 on upload/download (`checksumSha256`) and rejects mismatch with `BACKUP_CHECKSUM_MISMATCH`.
  - Blocks `CLEAN_SETUP` before any mutation if mandatory off-router cloud storage & SHA-256 verification cannot be confirmed (`OFF_ROUTER_BACKUP_REQUIRED`).

---

## 4. Multi-Tenant PostgreSQL RLS & Concurrency Controls (`H-3`, `H-6`)

- **Database RLS (`apps/api/prisma/migrations/20261111120000_add_auto_provisioning_engine/migration.sql` & `apps/api/src/core/database/prisma.service.ts`):**
  - Enables Row Level Security on all 6 provisioning tables (`provisioning_operations`, `provisioning_steps`, `provisioning_command_logs`, `router_backups`, `provisioning_configurations`, `recovery_operations`).
  - Dual policy support: uses transaction-local `current_setting('app.current_tenant_id', true)` bound by `PrismaService.withTenantRls` (safe for connection pools via `set_config(..., ..., true)`), and merges `auth.jwt() ->> 'tenantId'` when Supabase's `auth.jwt()` function is present.
- **Wildcard Command Prevention (`command-executor.service.ts`):**
  - `assertCommandSafeToExecute` rejects any execution command containing `[find` (`UNSAFE_WILDCARD_COMMAND_BLOCKED`), ensuring all deletions/updates target explicit `.id` references validated with `isValidRouterOsId`.

---

## 5. Production Environment Guard & Residual Security Advisories (`LOW`)

### Implemented Guard (`apps/api/src/config/env.validation.ts`)
- In `NODE_ENV=production`, `validateConfig` rejects startup unless all `REQUIRED_PROD_ENV_VARS` (`DATABASE_URL`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `AGENT_PAIRING_SECRET`, `COOKIE_SECRET`, `SUPABASE_URL`, `SUPABASE_SECRET_KEY`) and Redis (`REDIS_URL` or `REDIS_HOST`) are explicitly provided and do **not** match `INSECURE_PRODUCTION_SECRET_VALUES`.

### Documented Residual Risks & Required Operational Actions
1. **Pre-existing Hardcoded `.default(...)` Credentials in `envSchema` (`apps/api/src/config/env.validation.ts` L14–61):**
   - While `validateConfig` blocks known default secrets in `NODE_ENV=production`, `envSchema` still defines pre-existing Zod `.default(...)` values for `DATABASE_URL`/`DATABASE_PASSWORD`, `REDIS_URL`/`REDIS_PASSWORD`, `JWT_ACCESS_SECRET`, `JWT_REFRESH_SECRET`, `ENCRYPTION_KEY`, `AGENT_PAIRING_SECRET`, and `COOKIE_SECRET` for non-production fallback.
   - **Action Required:** Treat those dev/legacy pooler & Redis strings as compromised in git history — rotate database, Redis, and signing credentials before production cutover and provide secrets strictly via `.env`/secret manager (never rely on schema defaults in staging or production).
2. **Database Role Privilege for RLS Enforcement:**
   - Verified on local PostgreSQL 18.1 that a non-superuser role with `NOBYPASSRLS` (`sudafi_app_user`) strictly enforces tenant isolation and blocks cross-tenant `INSERT`s. If production Prisma connects as a `SUPERUSER` or `BYPASSRLS` role (`postgres`), PostgreSQL bypasses RLS policies automatically; production deployment should connect API workloads with a least-privilege `NOBYPASSRLS` role.
3. **Self-Signed Router TLS Certificates (`apps/mobile/lib/core/services/mikrotik_discovery_service.dart`):**
   - Local mobile LAN verification uses `badCertificateCallback = (cert, host, port) => true` on private LAN HTTP(S) REST checks so MikroTik routers without CA-signed certs work locally over TLS; LAN MITM risks apply on untrusted Wi-Fi unless API-SSL certificate pinning or backend proxy is used.
