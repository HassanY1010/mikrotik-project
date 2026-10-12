-- CreateEnum
DO $$ BEGIN
    CREATE TYPE "PppoeAccountStatus" AS ENUM ('ACTIVE', 'DISABLED', 'EXPIRED', 'SUSPENDED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AlterTable (Add themePreset if missing)
ALTER TABLE "card_batches" ADD COLUMN IF NOT EXISTS "themePreset" TEXT DEFAULT 'FOOTBALL';

-- AlterTable (Defaults)
ALTER TABLE "sale_transactions" ALTER COLUMN "currency" SET DEFAULT 'SDG';
ALTER TABLE "tenants" ALTER COLUMN "currency" SET DEFAULT 'SDG';

-- CreateTable: pppoe_profiles
CREATE TABLE IF NOT EXISTS "pppoe_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rateLimit" TEXT,
    "localAddress" TEXT,
    "remoteAddress" TEXT,
    "dnsServers" TEXT,
    "onlyOne" BOOLEAN NOT NULL DEFAULT true,
    "price" DECIMAL(10,2) NOT NULL DEFAULT 0,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pppoe_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable: pppoe_accounts
CREATE TABLE IF NOT EXISTS "pppoe_accounts" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "status" "PppoeAccountStatus" NOT NULL DEFAULT 'ACTIVE',
    "callerId" TEXT,
    "staticIp" TEXT,
    "customerName" TEXT,
    "customerPhone" TEXT,
    "price" DECIMAL(10,2) NOT NULL,
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "expiresAt" TIMESTAMP(3),
    "notes" TEXT,
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pppoe_accounts_pkey" PRIMARY KEY ("id")
);

-- CreateTable: pppoe_active_sessions
CREATE TABLE IF NOT EXISTS "pppoe_active_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "accountId" TEXT,
    "username" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "macAddress" TEXT,
    "uptimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "bytesIn" BIGINT NOT NULL DEFAULT 0,
    "bytesOut" BIGINT NOT NULL DEFAULT 0,
    "sessionId" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "pppoe_active_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex: pppoe_profiles
CREATE INDEX IF NOT EXISTS "pppoe_profiles_tenantId_idx" ON "pppoe_profiles"("tenantId");
CREATE INDEX IF NOT EXISTS "pppoe_profiles_deviceId_idx" ON "pppoe_profiles"("deviceId");
CREATE UNIQUE INDEX IF NOT EXISTS "pppoe_profiles_tenantId_deviceId_name_key" ON "pppoe_profiles"("tenantId", "deviceId", "name");

-- CreateIndex: pppoe_accounts
CREATE INDEX IF NOT EXISTS "pppoe_accounts_tenantId_idx" ON "pppoe_accounts"("tenantId");
CREATE INDEX IF NOT EXISTS "pppoe_accounts_deviceId_idx" ON "pppoe_accounts"("deviceId");
CREATE INDEX IF NOT EXISTS "pppoe_accounts_profileId_idx" ON "pppoe_accounts"("profileId");
CREATE INDEX IF NOT EXISTS "pppoe_accounts_status_idx" ON "pppoe_accounts"("status");
CREATE INDEX IF NOT EXISTS "pppoe_accounts_syncStatus_idx" ON "pppoe_accounts"("syncStatus");
CREATE INDEX IF NOT EXISTS "pppoe_accounts_expiresAt_idx" ON "pppoe_accounts"("expiresAt");
CREATE INDEX IF NOT EXISTS "pppoe_accounts_tenantId_status_idx" ON "pppoe_accounts"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "pppoe_accounts_tenantId_deviceId_status_idx" ON "pppoe_accounts"("tenantId", "deviceId", "status");
CREATE UNIQUE INDEX IF NOT EXISTS "pppoe_accounts_tenantId_deviceId_username_key" ON "pppoe_accounts"("tenantId", "deviceId", "username");

-- CreateIndex: pppoe_active_sessions
CREATE INDEX IF NOT EXISTS "pppoe_active_sessions_tenantId_idx" ON "pppoe_active_sessions"("tenantId");
CREATE INDEX IF NOT EXISTS "pppoe_active_sessions_deviceId_idx" ON "pppoe_active_sessions"("deviceId");
CREATE INDEX IF NOT EXISTS "pppoe_active_sessions_accountId_idx" ON "pppoe_active_sessions"("accountId");
CREATE INDEX IF NOT EXISTS "pppoe_active_sessions_username_idx" ON "pppoe_active_sessions"("username");

-- Additional performance indexes if missing
CREATE INDEX IF NOT EXISTS "agent_pairing_codes_codeHash_idx" ON "agent_pairing_codes"("codeHash");
CREATE INDEX IF NOT EXISTS "cards_tenantId_status_idx" ON "cards"("tenantId", "status");
CREATE INDEX IF NOT EXISTS "cards_tenantId_batchId_status_idx" ON "cards"("tenantId", "batchId", "status");
CREATE INDEX IF NOT EXISTS "cards_tenantId_deviceId_status_idx" ON "cards"("tenantId", "deviceId", "status");
CREATE INDEX IF NOT EXISTS "cards_tenantId_createdAt_idx" ON "cards"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "sale_transactions_tenantId_createdAt_idx" ON "sale_transactions"("tenantId", "createdAt");
CREATE INDEX IF NOT EXISTS "sale_transactions_tenantId_cashierId_createdAt_idx" ON "sale_transactions"("tenantId", "cashierId", "createdAt");
CREATE INDEX IF NOT EXISTS "sale_transactions_tenantId_deviceId_createdAt_idx" ON "sale_transactions"("tenantId", "deviceId", "createdAt");

-- AddForeignKey: pppoe_profiles
DO $$ BEGIN
    ALTER TABLE "pppoe_profiles" ADD CONSTRAINT "pppoe_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "pppoe_profiles" ADD CONSTRAINT "pppoe_profiles_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: pppoe_accounts
DO $$ BEGIN
    ALTER TABLE "pppoe_accounts" ADD CONSTRAINT "pppoe_accounts_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "pppoe_accounts" ADD CONSTRAINT "pppoe_accounts_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "pppoe_accounts" ADD CONSTRAINT "pppoe_accounts_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "pppoe_profiles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- AddForeignKey: pppoe_active_sessions
DO $$ BEGIN
    ALTER TABLE "pppoe_active_sessions" ADD CONSTRAINT "pppoe_active_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "pppoe_active_sessions" ADD CONSTRAINT "pppoe_active_sessions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "pppoe_active_sessions" ADD CONSTRAINT "pppoe_active_sessions_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "pppoe_accounts"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;
