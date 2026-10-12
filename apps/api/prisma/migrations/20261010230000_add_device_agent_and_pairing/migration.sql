-- CreateEnum
CREATE TYPE "AgentStatus" AS ENUM ('ONLINE', 'OFFLINE', 'REVOKED');

-- CreateTable
CREATE TABLE "device_agents" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "status" "AgentStatus" NOT NULL DEFAULT 'OFFLINE',
    "version" TEXT,
    "ipAddress" TEXT,
    "lastPingAt" TIMESTAMP(3),
    "pairedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "device_agents_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_pairing_codes" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "salt" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "isConsumed" BOOLEAN NOT NULL DEFAULT false,
    "consumedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "agent_pairing_codes_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "agent_pairing_attempts" (
    "id" TEXT NOT NULL,
    "clientKey" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "lockedUntil" TIMESTAMP(3),
    "lastAttemptAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_pairing_attempts_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "device_agents_tokenHash_key" ON "device_agents"("tokenHash");
CREATE INDEX "device_agents_tenantId_idx" ON "device_agents"("tenantId");
CREATE INDEX "device_agents_deviceId_idx" ON "device_agents"("deviceId");
CREATE INDEX "device_agents_status_idx" ON "device_agents"("status");

-- Partial Unique Index guaranteeing strictly one active (non-revoked) agent per router
CREATE UNIQUE INDEX "device_agents_active_device_idx" ON "device_agents"("deviceId") WHERE "status" != 'REVOKED';

-- CreateIndex
CREATE UNIQUE INDEX "agent_pairing_codes_codeHash_key" ON "agent_pairing_codes"("codeHash");
CREATE INDEX "agent_pairing_codes_tenantId_idx" ON "agent_pairing_codes"("tenantId");
CREATE INDEX "agent_pairing_codes_deviceId_idx" ON "agent_pairing_codes"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "agent_pairing_attempts_clientKey_key" ON "agent_pairing_attempts"("clientKey");
CREATE INDEX "agent_pairing_attempts_clientKey_idx" ON "agent_pairing_attempts"("clientKey");
CREATE INDEX "agent_pairing_attempts_lockedUntil_idx" ON "agent_pairing_attempts"("lockedUntil");

-- AddForeignKey
ALTER TABLE "device_agents" ADD CONSTRAINT "device_agents_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "device_agents" ADD CONSTRAINT "device_agents_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "agent_pairing_codes" ADD CONSTRAINT "agent_pairing_codes_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_pairing_codes" ADD CONSTRAINT "agent_pairing_codes_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
