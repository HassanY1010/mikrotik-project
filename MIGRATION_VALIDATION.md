# Migration & RLS Validation Report (`20261111120000_add_auto_provisioning_engine`)

> **Environment Note:** Validation ran against an isolated ephemeral **PostgreSQL 18.1** cluster initialized locally on `127.0.0.1:55432` and destroyed after validation (`pg18_verify` deleted). **Production databases and Supabase Cloud were NOT touched.**

---

## 1. Schema & Migration Inventory

- **Prisma Schema:** `apps/api/prisma/schema.prisma`
- **Migration Script:** `apps/api/prisma/migrations/20261111120000_add_auto_provisioning_engine/migration.sql`
- **Migration Sequence Executed (`ON_ERROR_STOP=1`):**
  1. `20261003000000_init`
  2. `20261008120000_add_monitoring_lock_wallet`
  3. `20261010230000_add_device_agent_and_pairing`
  4. `20261011080000_add_agent_commands`
  5. `20261011190000_add_pppoe_support`
  6. `20261021180000_add_expenses_and_enhanced_reporting`
  7. `20261022090000_add_staff_permissions_and_device_access`
  8. `20261025200000_add_hotspot_profile_quota_price_display_name`
  9. `20261106120000_add_card_pdf_archives`
  10. `20261111120000_add_auto_provisioning_engine`
- **Result:** All 10 migrations applied sequentially cleanly with zero SQL errors.

---

## 2. Tables, Foreign Keys, and RLS Policies Verified

PostgreSQL 18 system catalog queries confirmed **21 foreign key constraints** across the 6 new provisioning tables, and **6 active `FOR ALL` RLS policies**:

| Table | RLS Policy Name | Policy Scope |
| :--- | :--- | :--- |
| `provisioning_operations` | `provisioning_operations_tenant_isolation` | `ALL` (`USING` & `WITH CHECK`) |
| `provisioning_steps` | `provisioning_steps_tenant_isolation` | `ALL` (`USING` & `WITH CHECK`) |
| `provisioning_command_logs` | `provisioning_command_logs_tenant_isolation` | `ALL` (`USING` & `WITH CHECK`) |
| `router_backups` | `router_backups_tenant_isolation` | `ALL` (`USING` & `WITH CHECK`) |
| `provisioning_configurations` | `provisioning_configurations_tenant_isolation` | `ALL` (`USING` & `WITH CHECK`) |
| `recovery_operations` | `recovery_operations_tenant_isolation` | `ALL` (`USING` & `WITH CHECK`) |

### Policy Compatibility Design (`migration.sql` L280–315)
- Checks `to_regprocedure('auth.jwt()') IS NOT NULL` dynamically during migration execution:
  - **On Supabase:** binds `"tenantId" = COALESCE(NULLIF(current_setting('app.current_tenant_id', true), ''), (auth.jwt() ->> 'tenantId'))`.
  - **On Standalone PostgreSQL (without Supabase `auth` schema):** binds `"tenantId" = NULLIF(current_setting('app.current_tenant_id', true), '')`.
- **Backend Binding (`apps/api/src/core/database/prisma.service.ts` L104–116):**
  - `PrismaService.withTenantRls(tenantId, fn)` opens an interactive `$transaction`, rejects empty `tenantId`, and sets transaction-local `SELECT set_config('app.current_tenant_id', normalizedTenant, true)` so pooled connections never leak tenant context across requests.

---

## 3. Live Cross-Tenant Isolation Proof (Non-Superuser `sudafi_app_user`)

Executed in PostgreSQL 18.1 under non-superuser role `sudafi_app_user` (`NOBYPASSRLS`):
- Seeded two isolated tenants (`tenant-a` with `op-a` / `bk-a`, `tenant-b` with `op-b`).
- Verified queries under `sudafi_app_user`:
  - **Unset `app.current_tenant_id`:** `unset_tenant_ops_count = 0`, `unset_tenant_backups_count = 0`.
  - **Set `app.current_tenant_id = 'tenant-a'`:** returns only `op-a` and `bk-a`.
  - **Set `app.current_tenant_id = 'tenant-b'`:** returns only `op-b`.
  - **Cross-tenant write (`tenant-b` context attempting `INSERT` into `provisioning_operations` with `"tenantId" = 'tenant-a'`):** blocked by PostgreSQL RLS (`insufficient_privilege`), emitting `NOTICE: CROSS_TENANT_INSERT_BLOCKED_BY_RLS`.

---

## 4. Remaining Constraints / Production Pre-Flight Notes

1. **Non-`BYPASSRLS` Runtime Database Role Required:** PostgreSQL superusers and roles with `BYPASSRLS` skip RLS policies automatically. Production `DATABASE_URL` used by Prisma at runtime must authenticate as a least-privilege `NOBYPASSRLS` application role for row-level policies to enforce defense-in-depth at the DB layer.
2. **Untested Cloud-Specific Extensions:** Supabase Cloud-hosted `auth.jwt()` claims, Supabase Storage bucket ACLs (`router-backups`), and Render staging DB cutover were not executed locally.
3. **Production Migration Not Run:** Per safety rules, `prisma migrate deploy` was NOT executed on staging/production databases.
