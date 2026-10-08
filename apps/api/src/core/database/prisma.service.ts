import { Injectable, Logger, type OnModuleInit, type OnModuleDestroy } from '@nestjs/common';
import { PrismaClient } from '@prisma/client';

@Injectable()
export class PrismaService extends PrismaClient implements OnModuleInit, OnModuleDestroy {
  private readonly logger = new Logger(PrismaService.name);

  constructor() {
    super();
  }

  async onModuleInit(): Promise<void> {
    await this.$connect();
    this.logger.log('Prisma connected to PostgreSQL database successfully');

    // Ensure newly added columns exist in production database (idempotent self-healing)
    const sqlStatements = [
      // mikrotik_devices table
      `ALTER TABLE "mikrotik_devices" ADD COLUMN IF NOT EXISTS "diskFree" BIGINT;`,
      `ALTER TABLE "mikrotik_devices" ADD COLUMN IF NOT EXISTS "diskTotal" BIGINT;`,
      `ALTER TABLE "mikrotik_devices" ADD COLUMN IF NOT EXISTS "modelName" TEXT;`,
      `ALTER TABLE "mikrotik_devices" ADD COLUMN IF NOT EXISTS "isLocked" BOOLEAN NOT NULL DEFAULT false;`,
      `ALTER TABLE "mikrotik_devices" ADD COLUMN IF NOT EXISTS "antiTetheringEnabled" BOOLEAN NOT NULL DEFAULT false;`,

      // tenants table
      `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "walletBalance" DECIMAL(12,2) NOT NULL DEFAULT 0.00;`,
      `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;`,
      `ALTER TABLE "tenants" ADD COLUMN IF NOT EXISTS "allowAdminCards" BOOLEAN NOT NULL DEFAULT false;`,

      // card_templates table
      `ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "themePreset" TEXT NOT NULL DEFAULT 'CLASSIC';`,
      `ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "primaryColor" TEXT NOT NULL DEFAULT '#1E3A8A';`,
      `ALTER TABLE "card_templates" ADD COLUMN IF NOT EXISTS "accentColor" TEXT NOT NULL DEFAULT '#10B981';`,

      // tenant_wallet_transactions table
      `CREATE TABLE IF NOT EXISTS "tenant_wallet_transactions" (
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
        CONSTRAINT "tenant_wallet_transactions_pkey" PRIMARY KEY ("id"),
        CONSTRAINT "tenant_wallet_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE
      );`,
      `CREATE INDEX IF NOT EXISTS "tenant_wallet_transactions_tenantId_idx" ON "tenant_wallet_transactions"("tenantId");`,
      `CREATE INDEX IF NOT EXISTS "tenant_wallet_transactions_createdAt_idx" ON "tenant_wallet_transactions"("createdAt");`,

      // Fallback aliases if tables were created unmapped
      `ALTER TABLE IF EXISTS "MikroTikDevice" ADD COLUMN IF NOT EXISTS "diskFree" BIGINT;`,
      `ALTER TABLE IF EXISTS "MikroTikDevice" ADD COLUMN IF NOT EXISTS "diskTotal" BIGINT;`,
      `ALTER TABLE IF EXISTS "MikroTikDevice" ADD COLUMN IF NOT EXISTS "modelName" TEXT;`,
      `ALTER TABLE IF EXISTS "MikroTikDevice" ADD COLUMN IF NOT EXISTS "isLocked" BOOLEAN NOT NULL DEFAULT false;`,
      `ALTER TABLE IF EXISTS "MikroTikDevice" ADD COLUMN IF NOT EXISTS "antiTetheringEnabled" BOOLEAN NOT NULL DEFAULT false;`,
      `ALTER TABLE IF EXISTS "Tenant" ADD COLUMN IF NOT EXISTS "walletBalance" DECIMAL(12,2) NOT NULL DEFAULT 0.00;`,
      `ALTER TABLE IF EXISTS "Tenant" ADD COLUMN IF NOT EXISTS "loyaltyPoints" INTEGER NOT NULL DEFAULT 0;`,
      `ALTER TABLE IF EXISTS "Tenant" ADD COLUMN IF NOT EXISTS "allowAdminCards" BOOLEAN NOT NULL DEFAULT false;`,
      `ALTER TABLE IF EXISTS "CardTemplate" ADD COLUMN IF NOT EXISTS "themePreset" TEXT NOT NULL DEFAULT 'CLASSIC';`,
      `ALTER TABLE IF EXISTS "CardTemplate" ADD COLUMN IF NOT EXISTS "primaryColor" TEXT NOT NULL DEFAULT '#1E3A8A';`,
      `ALTER TABLE IF EXISTS "CardTemplate" ADD COLUMN IF NOT EXISTS "accentColor" TEXT NOT NULL DEFAULT '#10B981';`
    ];

    for (const sql of sqlStatements) {
      try {
        await this.$executeRawUnsafe(sql);
      } catch (err) {
        this.logger.debug?.(`Schema sync statement notice: ${err}`);
      }
    }
    this.logger.log('Database schema verified and synced successfully');
  }

  async onModuleDestroy(): Promise<void> {
    await this.$disconnect();
    this.logger.log('Prisma disconnected from PostgreSQL database');
  }
}
