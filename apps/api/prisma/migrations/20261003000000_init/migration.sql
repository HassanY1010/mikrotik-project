-- CreateEnum
CREATE TYPE "TenantStatus" AS ENUM ('ACTIVE', 'SUSPENDED', 'PENDING', 'EXPIRED');

-- CreateEnum
CREATE TYPE "UserStatus" AS ENUM ('ACTIVE', 'INACTIVE', 'SUSPENDED');

-- CreateEnum
CREATE TYPE "RoleName" AS ENUM ('SUPER_ADMIN', 'TENANT_ADMIN', 'MANAGER', 'CASHIER');

-- CreateEnum
CREATE TYPE "BillingCycle" AS ENUM ('MONTHLY', 'YEARLY');

-- CreateEnum
CREATE TYPE "SubscriptionStatus" AS ENUM ('TRIAL', 'ACTIVE', 'EXPIRED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "RouterOsVersion" AS ENUM ('V6', 'V7');

-- CreateEnum
CREATE TYPE "DeviceStatus" AS ENUM ('ONLINE', 'OFFLINE', 'ERROR', 'CONNECTING');

-- CreateEnum
CREATE TYPE "CardStatus" AS ENUM ('GENERATED', 'AVAILABLE', 'SOLD', 'ACTIVE', 'EXPIRED', 'DISABLED');

-- CreateEnum
CREATE TYPE "CardBatchStatus" AS ENUM ('PROCESSING', 'COMPLETED', 'FAILED', 'CANCELLED');

-- CreateEnum
CREATE TYPE "PaymentMethod" AS ENUM ('CASH', 'CARD', 'MOBILE_WALLET', 'TRANSFER');

-- CreateEnum
CREATE TYPE "PrintJobStatus" AS ENUM ('PENDING', 'PRINTING', 'COMPLETED', 'FAILED');

-- CreateEnum
CREATE TYPE "SyncStatus" AS ENUM ('PENDING', 'SYNCED', 'FAILED');

-- CreateTable
CREATE TABLE "tenants" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "logoUrl" TEXT,
    "status" "TenantStatus" NOT NULL DEFAULT 'ACTIVE',
    "currency" TEXT NOT NULL DEFAULT 'YER',
    "address" TEXT,
    "phone" TEXT,
    "contactEmail" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "tenants_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscription_plans" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "nameAr" TEXT NOT NULL,
    "description" TEXT,
    "maxRouters" INTEGER NOT NULL DEFAULT 1,
    "priceMonthly" DECIMAL(10,2) NOT NULL,
    "priceYearly" DECIMAL(10,2) NOT NULL,
    "features" JSONB,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscription_plans_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "subscriptions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "planId" TEXT NOT NULL,
    "status" "SubscriptionStatus" NOT NULL DEFAULT 'ACTIVE',
    "billingCycle" "BillingCycle" NOT NULL DEFAULT 'MONTHLY',
    "startsAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "maxRouters" INTEGER NOT NULL DEFAULT 1,
    "price" DECIMAL(10,2) NOT NULL,
    "approvedBy" TEXT,
    "notes" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "subscriptions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "users" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "email" TEXT NOT NULL,
    "passwordHash" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "roleId" TEXT NOT NULL,
    "status" "UserStatus" NOT NULL DEFAULT 'ACTIVE',
    "lastLoginAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "users_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "roles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "isSystem" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "roles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "permissions" (
    "id" TEXT NOT NULL,
    "code" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "module" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "permissions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "role_permissions" (
    "roleId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,

    CONSTRAINT "role_permissions_pkey" PRIMARY KEY ("roleId","permissionId")
);

-- CreateTable
CREATE TABLE "refresh_tokens" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "revokedAt" TIMESTAMP(3),
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "refresh_tokens_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT,
    "userId" TEXT,
    "action" TEXT NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" TEXT,
    "oldValues" JSONB,
    "newValues" JSONB,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "mikrotik_devices" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "host" TEXT NOT NULL,
    "apiPort" INTEGER NOT NULL DEFAULT 8728,
    "restPort" INTEGER NOT NULL DEFAULT 443,
    "useSsl" BOOLEAN NOT NULL DEFAULT false,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "rosVersion" "RouterOsVersion" NOT NULL DEFAULT 'V7',
    "isOnline" BOOLEAN NOT NULL DEFAULT false,
    "status" "DeviceStatus" NOT NULL DEFAULT 'OFFLINE',
    "lastSyncAt" TIMESTAMP(3),
    "lastError" TEXT,
    "cpuLoad" INTEGER,
    "memoryFree" BIGINT,
    "memoryTotal" BIGINT,
    "uptime" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "mikrotik_devices_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotspot_profiles" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "rateLimit" TEXT,
    "sessionTimeout" TEXT,
    "idleTimeout" TEXT,
    "keepaliveTimeout" TEXT,
    "sharedUsers" INTEGER NOT NULL DEFAULT 1,
    "addressPool" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotspot_profiles_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "hotspot_active_sessions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "cardId" TEXT,
    "username" TEXT NOT NULL,
    "ipAddress" TEXT NOT NULL,
    "macAddress" TEXT NOT NULL,
    "uptimeSeconds" INTEGER NOT NULL DEFAULT 0,
    "bytesIn" BIGINT NOT NULL DEFAULT 0,
    "bytesOut" BIGINT NOT NULL DEFAULT 0,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "hotspot_active_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_templates" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "widthMm" INTEGER NOT NULL DEFAULT 85,
    "heightMm" INTEGER NOT NULL DEFAULT 54,
    "orientation" TEXT NOT NULL DEFAULT 'landscape',
    "backgroundDesign" TEXT,
    "layoutConfig" JSONB NOT NULL,
    "isDefault" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_templates_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "card_batches" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "batchNumber" TEXT NOT NULL,
    "totalCards" INTEGER NOT NULL,
    "prefix" TEXT,
    "length" INTEGER NOT NULL DEFAULT 8,
    "pattern" TEXT NOT NULL DEFAULT 'NUMERIC',
    "price" DECIMAL(10,2) NOT NULL,
    "validityDays" INTEGER,
    "timeLimit" TEXT,
    "dataLimitBytes" BIGINT,
    "status" "CardBatchStatus" NOT NULL DEFAULT 'PROCESSING',
    "expiresAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_batches_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "cards" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "profileId" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "passwordEncrypted" TEXT NOT NULL,
    "iv" TEXT NOT NULL,
    "authTag" TEXT NOT NULL,
    "pinCode" TEXT,
    "serialNumber" TEXT NOT NULL,
    "price" DECIMAL(10,2) NOT NULL,
    "validityDays" INTEGER,
    "timeLimit" TEXT,
    "dataLimitBytes" BIGINT,
    "status" "CardStatus" NOT NULL DEFAULT 'AVAILABLE',
    "soldAt" TIMESTAMP(3),
    "soldById" TEXT,
    "activatedAt" TIMESTAMP(3),
    "expiresAt" TIMESTAMP(3),
    "syncStatus" "SyncStatus" NOT NULL DEFAULT 'PENDING',
    "syncError" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "cards_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "sale_transactions" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "cardId" TEXT NOT NULL,
    "cashierId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'YER',
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "customerPhone" TEXT,
    "customerName" TEXT,
    "invoiceNumber" TEXT NOT NULL,
    "printedCount" INTEGER NOT NULL DEFAULT 0,
    "lastPrintedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "sale_transactions_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "print_jobs" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "templateId" TEXT NOT NULL,
    "cardBatchId" TEXT,
    "singleCardId" TEXT,
    "printerType" TEXT NOT NULL DEFAULT 'THERMAL',
    "status" "PrintJobStatus" NOT NULL DEFAULT 'PENDING',
    "totalCards" INTEGER NOT NULL DEFAULT 1,
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "print_jobs_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "tenants_slug_key" ON "tenants"("slug");

-- CreateIndex
CREATE INDEX "tenants_status_idx" ON "tenants"("status");

-- CreateIndex
CREATE INDEX "tenants_createdAt_idx" ON "tenants"("createdAt");

-- CreateIndex
CREATE UNIQUE INDEX "subscription_plans_name_key" ON "subscription_plans"("name");

-- CreateIndex
CREATE INDEX "subscriptions_tenantId_idx" ON "subscriptions"("tenantId");

-- CreateIndex
CREATE INDEX "subscriptions_status_idx" ON "subscriptions"("status");

-- CreateIndex
CREATE INDEX "subscriptions_expiresAt_idx" ON "subscriptions"("expiresAt");

-- CreateIndex
CREATE UNIQUE INDEX "users_email_key" ON "users"("email");

-- CreateIndex
CREATE INDEX "users_tenantId_idx" ON "users"("tenantId");

-- CreateIndex
CREATE INDEX "users_roleId_idx" ON "users"("roleId");

-- CreateIndex
CREATE INDEX "users_status_idx" ON "users"("status");

-- CreateIndex
CREATE INDEX "roles_tenantId_idx" ON "roles"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "roles_tenantId_name_key" ON "roles"("tenantId", "name");

-- CreateIndex
CREATE UNIQUE INDEX "permissions_code_key" ON "permissions"("code");

-- CreateIndex
CREATE UNIQUE INDEX "refresh_tokens_tokenHash_key" ON "refresh_tokens"("tokenHash");

-- CreateIndex
CREATE INDEX "refresh_tokens_userId_idx" ON "refresh_tokens"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_tenantId_idx" ON "audit_logs"("tenantId");

-- CreateIndex
CREATE INDEX "audit_logs_userId_idx" ON "audit_logs"("userId");

-- CreateIndex
CREATE INDEX "audit_logs_entity_entityId_idx" ON "audit_logs"("entity", "entityId");

-- CreateIndex
CREATE INDEX "audit_logs_createdAt_idx" ON "audit_logs"("createdAt");

-- CreateIndex
CREATE INDEX "mikrotik_devices_tenantId_idx" ON "mikrotik_devices"("tenantId");

-- CreateIndex
CREATE INDEX "mikrotik_devices_status_idx" ON "mikrotik_devices"("status");

-- CreateIndex
CREATE INDEX "mikrotik_devices_isOnline_idx" ON "mikrotik_devices"("isOnline");

-- CreateIndex
CREATE UNIQUE INDEX "mikrotik_devices_tenantId_host_apiPort_key" ON "mikrotik_devices"("tenantId", "host", "apiPort");

-- CreateIndex
CREATE INDEX "hotspot_profiles_tenantId_idx" ON "hotspot_profiles"("tenantId");

-- CreateIndex
CREATE INDEX "hotspot_profiles_deviceId_idx" ON "hotspot_profiles"("deviceId");

-- CreateIndex
CREATE UNIQUE INDEX "hotspot_profiles_tenantId_deviceId_name_key" ON "hotspot_profiles"("tenantId", "deviceId", "name");

-- CreateIndex
CREATE INDEX "hotspot_active_sessions_tenantId_idx" ON "hotspot_active_sessions"("tenantId");

-- CreateIndex
CREATE INDEX "hotspot_active_sessions_deviceId_idx" ON "hotspot_active_sessions"("deviceId");

-- CreateIndex
CREATE INDEX "hotspot_active_sessions_cardId_idx" ON "hotspot_active_sessions"("cardId");

-- CreateIndex
CREATE INDEX "hotspot_active_sessions_macAddress_idx" ON "hotspot_active_sessions"("macAddress");

-- CreateIndex
CREATE INDEX "card_templates_tenantId_idx" ON "card_templates"("tenantId");

-- CreateIndex
CREATE UNIQUE INDEX "card_batches_batchNumber_key" ON "card_batches"("batchNumber");

-- CreateIndex
CREATE INDEX "card_batches_tenantId_idx" ON "card_batches"("tenantId");

-- CreateIndex
CREATE INDEX "card_batches_deviceId_idx" ON "card_batches"("deviceId");

-- CreateIndex
CREATE INDEX "card_batches_profileId_idx" ON "card_batches"("profileId");

-- CreateIndex
CREATE INDEX "card_batches_status_idx" ON "card_batches"("status");

-- CreateIndex
CREATE UNIQUE INDEX "cards_serialNumber_key" ON "cards"("serialNumber");

-- CreateIndex
CREATE INDEX "cards_tenantId_idx" ON "cards"("tenantId");

-- CreateIndex
CREATE INDEX "cards_batchId_idx" ON "cards"("batchId");

-- CreateIndex
CREATE INDEX "cards_deviceId_idx" ON "cards"("deviceId");

-- CreateIndex
CREATE INDEX "cards_status_idx" ON "cards"("status");

-- CreateIndex
CREATE INDEX "cards_syncStatus_idx" ON "cards"("syncStatus");

-- CreateIndex
CREATE INDEX "cards_soldAt_idx" ON "cards"("soldAt");

-- CreateIndex
CREATE UNIQUE INDEX "cards_tenantId_deviceId_username_key" ON "cards"("tenantId", "deviceId", "username");

-- CreateIndex
CREATE UNIQUE INDEX "sale_transactions_invoiceNumber_key" ON "sale_transactions"("invoiceNumber");

-- CreateIndex
CREATE INDEX "sale_transactions_tenantId_idx" ON "sale_transactions"("tenantId");

-- CreateIndex
CREATE INDEX "sale_transactions_cashierId_idx" ON "sale_transactions"("cashierId");

-- CreateIndex
CREATE INDEX "sale_transactions_deviceId_idx" ON "sale_transactions"("deviceId");

-- CreateIndex
CREATE INDEX "sale_transactions_cardId_idx" ON "sale_transactions"("cardId");

-- CreateIndex
CREATE INDEX "sale_transactions_createdAt_idx" ON "sale_transactions"("createdAt");

-- CreateIndex
CREATE INDEX "print_jobs_tenantId_idx" ON "print_jobs"("tenantId");

-- CreateIndex
CREATE INDEX "print_jobs_status_idx" ON "print_jobs"("status");

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "subscriptions" ADD CONSTRAINT "subscriptions_planId_fkey" FOREIGN KEY ("planId") REFERENCES "subscription_plans"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "roles" ADD CONSTRAINT "roles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "role_permissions" ADD CONSTRAINT "role_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "refresh_tokens" ADD CONSTRAINT "refresh_tokens_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "mikrotik_devices" ADD CONSTRAINT "mikrotik_devices_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotspot_profiles" ADD CONSTRAINT "hotspot_profiles_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotspot_profiles" ADD CONSTRAINT "hotspot_profiles_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotspot_active_sessions" ADD CONSTRAINT "hotspot_active_sessions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotspot_active_sessions" ADD CONSTRAINT "hotspot_active_sessions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "hotspot_active_sessions" ADD CONSTRAINT "hotspot_active_sessions_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_templates" ADD CONSTRAINT "card_templates_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_batches" ADD CONSTRAINT "card_batches_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_batches" ADD CONSTRAINT "card_batches_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_batches" ADD CONSTRAINT "card_batches_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "hotspot_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "card_batches" ADD CONSTRAINT "card_batches_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "card_batches"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_profileId_fkey" FOREIGN KEY ("profileId") REFERENCES "hotspot_profiles"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "cards" ADD CONSTRAINT "cards_soldById_fkey" FOREIGN KEY ("soldById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_transactions" ADD CONSTRAINT "sale_transactions_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_transactions" ADD CONSTRAINT "sale_transactions_cardId_fkey" FOREIGN KEY ("cardId") REFERENCES "cards"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_transactions" ADD CONSTRAINT "sale_transactions_cashierId_fkey" FOREIGN KEY ("cashierId") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "sale_transactions" ADD CONSTRAINT "sale_transactions_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_templateId_fkey" FOREIGN KEY ("templateId") REFERENCES "card_templates"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_cardBatchId_fkey" FOREIGN KEY ("cardBatchId") REFERENCES "card_batches"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "print_jobs" ADD CONSTRAINT "print_jobs_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

