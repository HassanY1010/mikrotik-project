-- CreateEnum
CREATE TYPE "AgentCommandStatus" AS ENUM ('PENDING', 'DISPATCHED', 'COMPLETED', 'FAILED', 'EXPIRED');

-- CreateTable
CREATE TABLE "agent_commands" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "agentId" TEXT NOT NULL,
    "operationId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "payload" JSONB NOT NULL,
    "status" "AgentCommandStatus" NOT NULL DEFAULT 'PENDING',
    "result" JSONB,
    "errorMessage" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 3,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "dispatchedAt" TIMESTAMP(3),
    "completedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "agent_commands_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "agent_commands_operationId_key" ON "agent_commands"("operationId");
CREATE INDEX "agent_commands_tenantId_idx" ON "agent_commands"("tenantId");
CREATE INDEX "agent_commands_deviceId_idx" ON "agent_commands"("deviceId");
CREATE INDEX "agent_commands_agentId_idx" ON "agent_commands"("agentId");
CREATE INDEX "agent_commands_status_idx" ON "agent_commands"("status");
CREATE INDEX "agent_commands_agentId_status_idx" ON "agent_commands"("agentId", "status");

-- AddForeignKey
ALTER TABLE "agent_commands" ADD CONSTRAINT "agent_commands_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_commands" ADD CONSTRAINT "agent_commands_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "agent_commands" ADD CONSTRAINT "agent_commands_agentId_fkey" FOREIGN KEY ("agentId") REFERENCES "device_agents"("id") ON DELETE CASCADE ON UPDATE CASCADE;
