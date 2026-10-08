-- AlterTable
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "walletBalance" DECIMAL(12,2) NOT NULL DEFAULT 0;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "allowAdminCards" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "mikrotik_devices" ADD COLUMN IF NOT EXISTS "diskFree" BIGINT;
ALTER TABLE "mikrotik_devices" ADD COLUMN IF NOT EXISTS "diskTotal" BIGINT;
ALTER TABLE "mikrotik_devices" ADD COLUMN IF NOT EXISTS "modelName" TEXT;
ALTER TABLE "mikrotik_devices" ADD COLUMN IF NOT EXISTS "isLocked" BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE "mikrotik_devices" ADD COLUMN IF NOT EXISTS "antiTetheringEnabled" BOOLEAN NOT NULL DEFAULT false;

-- AlterTable
ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "themePreset" TEXT DEFAULT 'CLASSIC';
ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "primaryColor" TEXT DEFAULT '#1E3A8A';
ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "accentColor" TEXT DEFAULT '#10B981';

-- CreateTable
CREATE TABLE IF NOT EXISTS "tenant_wallet_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "amount" DECIMAL(12,2) NOT NULL,
    "type" TEXT NOT NULL,
    "pointsDelta" INTEGER NOT NULL DEFAULT 0,
    "balanceAfter" DECIMAL(12,2) NOT NULL,
    "reference" TEXT,
    "notes" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "tenant_wallet_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "tenant_wallet_transactions_tenantId_idx" ON "tenant_wallet_transactions"("tenantId");
CREATE INDEX IF NOT EXISTS "tenant_wallet_transactions_createdAt_idx" ON "tenant_wallet_transactions"("createdAt");

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'tenant_wallet_transactions_tenantId_fkey'
    ) THEN
        ALTER TABLE "tenant_wallet_transactions" ADD CONSTRAINT "tenant_wallet_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
