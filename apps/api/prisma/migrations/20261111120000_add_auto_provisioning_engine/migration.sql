-- CreateEnum
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProvisioningOperationStatus') THEN
        CREATE TYPE "ProvisioningOperationStatus" AS ENUM ('PENDING', 'BACKING_UP', 'RUNNING', 'VERIFYING', 'COMPLETED', 'FAILED', 'CANCELLED', 'ROLLED_BACK');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProvisioningStepStatus') THEN
        CREATE TYPE "ProvisioningStepStatus" AS ENUM ('PENDING', 'RUNNING', 'COMPLETED', 'FAILED', 'SKIPPED', 'ROLLED_BACK');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'ProvisioningCommandStatus') THEN
        CREATE TYPE "ProvisioningCommandStatus" AS ENUM ('PENDING', 'RUNNING', 'SUCCESS', 'FAILED', 'SKIPPED', 'ROLLED_BACK');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RouterBackupType') THEN
        CREATE TYPE "RouterBackupType" AS ENUM ('BINARY', 'RSC_EXPORT');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RouterBackupStatus') THEN
        CREATE TYPE "RouterBackupStatus" AS ENUM ('CREATING', 'READY', 'VERIFIED', 'RESTORING', 'RESTORED', 'FAILED');
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_type WHERE typname = 'RecoveryOperationStatus') THEN
        CREATE TYPE "RecoveryOperationStatus" AS ENUM ('CONFIRMED', 'EXECUTING', 'REBOOTING', 'VERIFIED', 'FAILED');
    END IF;
END $$;

-- CreateTable
CREATE TABLE IF NOT EXISTS "provisioning_operations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "initiatedById" TEXT,
    "status" "ProvisioningOperationStatus" NOT NULL DEFAULT 'PENDING',
    "template" TEXT NOT NULL DEFAULT 'CLEAN_SETUP',
    "executionMode" TEXT NOT NULL DEFAULT 'CLOUD',
    "routerOsVersion" TEXT,
    "routerMajorVersion" INTEGER,
    "boardName" TEXT,
    "modelName" TEXT,
    "architecture" TEXT,
    "progressPercent" INTEGER NOT NULL DEFAULT 0,
    "currentStepOrder" INTEGER NOT NULL DEFAULT 0,
    "totalSteps" INTEGER NOT NULL DEFAULT 0,
    "totalCommands" INTEGER NOT NULL DEFAULT 0,
    "succeededCommands" INTEGER NOT NULL DEFAULT 0,
    "failedCommands" INTEGER NOT NULL DEFAULT 0,
    "skippedCommands" INTEGER NOT NULL DEFAULT 0,
    "planHash" TEXT,
    "preBackupId" TEXT,
    "rscBackupId" TEXT,
    "capabilitiesSnapshot" JSONB,
    "configSnapshot" JSONB,
    "verificationResult" JSONB,
    "failureReason" TEXT,
    "cancelRequested" BOOLEAN NOT NULL DEFAULT false,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "cancelledAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provisioning_operations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "provisioning_steps" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "stepOrder" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "description" TEXT,
    "status" "ProvisioningStepStatus" NOT NULL DEFAULT 'PENDING',
    "dependsOn" JSONB,
    "preconditions" JSONB,
    "requiredCapabilities" JSONB,
    "expectedResult" TEXT,
    "validationRule" TEXT,
    "rollbackAction" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provisioning_steps_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "provisioning_command_logs" (
    "id" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "stepId" TEXT,
    "tenantId" TEXT NOT NULL,
    "commandOrder" INTEGER NOT NULL,
    "stage" TEXT NOT NULL,
    "description" TEXT NOT NULL,
    "commandMasked" TEXT NOT NULL,
    "status" "ProvisioningCommandStatus" NOT NULL DEFAULT 'PENDING',
    "routerResponse" TEXT,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "durationMs" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "provisioning_command_logs_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "router_backups" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "operationId" TEXT,
    "createdById" TEXT,
    "backupType" "RouterBackupType" NOT NULL DEFAULT 'BINARY',
    "fileName" TEXT NOT NULL,
    "routerFileName" TEXT NOT NULL,
    "storageBucket" TEXT,
    "storagePath" TEXT,
    "fileSizeBytes" INTEGER NOT NULL DEFAULT 0,
    "checksumSha256" TEXT,
    "routerOsVersion" TEXT,
    "boardName" TEXT,
    "deviceModel" TEXT,
    "architecture" TEXT,
    "isEncrypted" BOOLEAN NOT NULL DEFAULT true,
    "status" "RouterBackupStatus" NOT NULL DEFAULT 'CREATING',
    "metadata" JSONB,
    "restoredAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "router_backups_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "provisioning_configurations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "operationId" TEXT,
    "createdById" TEXT,
    "configName" TEXT NOT NULL DEFAULT 'default',
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "wanConfig" JSONB NOT NULL,
    "lanConfig" JSONB NOT NULL,
    "wirelessConfig" JSONB,
    "hotspotConfig" JSONB NOT NULL,
    "systemConfig" JSONB,
    "securityConfig" JSONB,
    "schedulerConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "provisioning_configurations_pkey" PRIMARY KEY ("id")
);

CREATE TABLE IF NOT EXISTS "recovery_operations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "backupId" TEXT,
    "operationId" TEXT,
    "initiatedById" TEXT,
    "status" "RecoveryOperationStatus" NOT NULL DEFAULT 'CONFIRMED',
    "backupFileName" TEXT NOT NULL,
    "rebootTriggered" BOOLEAN NOT NULL DEFAULT false,
    "warningAcknowledged" BOOLEAN NOT NULL DEFAULT false,
    "compatibilityWarning" TEXT,
    "preCheckSnapshot" JSONB,
    "postCheckResult" JSONB,
    "errorMessage" TEXT,
    "startedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "recovery_operations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "provisioning_operations_tenantId_idx" ON "provisioning_operations"("tenantId");
CREATE INDEX IF NOT EXISTS "provisioning_operations_tenantId_deviceId_createdAt_idx" ON "provisioning_operations"("tenantId", "deviceId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "provisioning_operations_status_idx" ON "provisioning_operations"("status");

CREATE INDEX IF NOT EXISTS "provisioning_steps_operationId_stepOrder_idx" ON "provisioning_steps"("operationId", "stepOrder");
CREATE INDEX IF NOT EXISTS "provisioning_steps_tenantId_idx" ON "provisioning_steps"("tenantId");

CREATE INDEX IF NOT EXISTS "provisioning_command_logs_operationId_commandOrder_idx" ON "provisioning_command_logs"("operationId", "commandOrder");
CREATE INDEX IF NOT EXISTS "provisioning_command_logs_tenantId_idx" ON "provisioning_command_logs"("tenantId");

CREATE INDEX IF NOT EXISTS "router_backups_tenantId_idx" ON "router_backups"("tenantId");
CREATE INDEX IF NOT EXISTS "router_backups_tenantId_deviceId_createdAt_idx" ON "router_backups"("tenantId", "deviceId", "createdAt" DESC);
CREATE INDEX IF NOT EXISTS "router_backups_operationId_idx" ON "router_backups"("operationId");

CREATE INDEX IF NOT EXISTS "provisioning_configurations_tenantId_idx" ON "provisioning_configurations"("tenantId");
CREATE INDEX IF NOT EXISTS "provisioning_configurations_tenantId_deviceId_idx" ON "provisioning_configurations"("tenantId", "deviceId");

CREATE INDEX IF NOT EXISTS "recovery_operations_tenantId_idx" ON "recovery_operations"("tenantId");
CREATE INDEX IF NOT EXISTS "recovery_operations_tenantId_deviceId_createdAt_idx" ON "recovery_operations"("tenantId", "deviceId", "createdAt" DESC);

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provisioning_operations_tenantId_fkey') THEN
        ALTER TABLE "provisioning_operations" ADD CONSTRAINT "provisioning_operations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provisioning_operations_deviceId_fkey') THEN
        ALTER TABLE "provisioning_operations" ADD CONSTRAINT "provisioning_operations_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provisioning_operations_initiatedById_fkey') THEN
        ALTER TABLE "provisioning_operations" ADD CONSTRAINT "provisioning_operations_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provisioning_steps_operationId_fkey') THEN
        ALTER TABLE "provisioning_steps" ADD CONSTRAINT "provisioning_steps_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "provisioning_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provisioning_steps_tenantId_fkey') THEN
        ALTER TABLE "provisioning_steps" ADD CONSTRAINT "provisioning_steps_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provisioning_command_logs_operationId_fkey') THEN
        ALTER TABLE "provisioning_command_logs" ADD CONSTRAINT "provisioning_command_logs_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "provisioning_operations"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provisioning_command_logs_stepId_fkey') THEN
        ALTER TABLE "provisioning_command_logs" ADD CONSTRAINT "provisioning_command_logs_stepId_fkey" FOREIGN KEY ("stepId") REFERENCES "provisioning_steps"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provisioning_command_logs_tenantId_fkey') THEN
        ALTER TABLE "provisioning_command_logs" ADD CONSTRAINT "provisioning_command_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'router_backups_tenantId_fkey') THEN
        ALTER TABLE "router_backups" ADD CONSTRAINT "router_backups_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'router_backups_deviceId_fkey') THEN
        ALTER TABLE "router_backups" ADD CONSTRAINT "router_backups_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'router_backups_operationId_fkey') THEN
        ALTER TABLE "router_backups" ADD CONSTRAINT "router_backups_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "provisioning_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'router_backups_createdById_fkey') THEN
        ALTER TABLE "router_backups" ADD CONSTRAINT "router_backups_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provisioning_configurations_tenantId_fkey') THEN
        ALTER TABLE "provisioning_configurations" ADD CONSTRAINT "provisioning_configurations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provisioning_configurations_deviceId_fkey') THEN
        ALTER TABLE "provisioning_configurations" ADD CONSTRAINT "provisioning_configurations_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provisioning_configurations_operationId_fkey') THEN
        ALTER TABLE "provisioning_configurations" ADD CONSTRAINT "provisioning_configurations_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "provisioning_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'provisioning_configurations_createdById_fkey') THEN
        ALTER TABLE "provisioning_configurations" ADD CONSTRAINT "provisioning_configurations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;

    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recovery_operations_tenantId_fkey') THEN
        ALTER TABLE "recovery_operations" ADD CONSTRAINT "recovery_operations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recovery_operations_deviceId_fkey') THEN
        ALTER TABLE "recovery_operations" ADD CONSTRAINT "recovery_operations_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recovery_operations_backupId_fkey') THEN
        ALTER TABLE "recovery_operations" ADD CONSTRAINT "recovery_operations_backupId_fkey" FOREIGN KEY ("backupId") REFERENCES "router_backups"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recovery_operations_operationId_fkey') THEN
        ALTER TABLE "recovery_operations" ADD CONSTRAINT "recovery_operations_operationId_fkey" FOREIGN KEY ("operationId") REFERENCES "provisioning_operations"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'recovery_operations_initiatedById_fkey') THEN
        ALTER TABLE "recovery_operations" ADD CONSTRAINT "recovery_operations_initiatedById_fkey" FOREIGN KEY ("initiatedById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Enable Row Level Security (RLS) for multi-tenant isolation
ALTER TABLE "provisioning_operations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provisioning_steps" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provisioning_command_logs" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "router_backups" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "provisioning_configurations" ENABLE ROW LEVEL SECURITY;
ALTER TABLE "recovery_operations" ENABLE ROW LEVEL SECURITY;

-- Tenant isolation policies (works identically in Supabase with auth.jwt() and standalone PostgreSQL via app.current_tenant_id GUC)
DO $$
DECLARE
    tbl TEXT;
    has_auth_jwt BOOLEAN;
    policy_expr TEXT;
BEGIN
    SELECT to_regprocedure('auth.jwt()') IS NOT NULL INTO has_auth_jwt;
    IF has_auth_jwt THEN
        policy_expr := '"tenantId" = COALESCE(NULLIF(current_setting(''app.current_tenant_id'', true), ''''), (auth.jwt() ->> ''tenantId''))';
    ELSE
        policy_expr := '"tenantId" = NULLIF(current_setting(''app.current_tenant_id'', true), '''')';
    END IF;

    FOREACH tbl IN ARRAY ARRAY[
        'provisioning_operations',
        'provisioning_steps',
        'provisioning_command_logs',
        'router_backups',
        'provisioning_configurations',
        'recovery_operations'
    ]
    LOOP
        IF NOT EXISTS (
            SELECT 1 FROM pg_policies WHERE schemaname = 'public' AND tablename = tbl AND policyname = tbl || '_tenant_isolation'
        ) THEN
            EXECUTE format(
                'CREATE POLICY %I ON %I FOR ALL USING (%s) WITH CHECK (%s)',
                tbl || '_tenant_isolation',
                tbl,
                policy_expr,
                policy_expr
            );
        END IF;
    END LOOP;
END $$;
