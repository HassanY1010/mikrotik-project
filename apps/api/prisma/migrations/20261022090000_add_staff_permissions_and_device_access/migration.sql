-- CreateTable
CREATE TABLE IF NOT EXISTS "user_device_access" (
    "userId" TEXT NOT NULL,
    "deviceId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_device_access_pkey" PRIMARY KEY ("userId","deviceId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "user_permissions" (
    "userId" TEXT NOT NULL,
    "permissionId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "user_permissions_pkey" PRIMARY KEY ("userId","permissionId")
);

-- CreateTable
CREATE TABLE IF NOT EXISTS "staff_invitations" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "fullName" TEXT NOT NULL,
    "phone" TEXT,
    "roleId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "acceptedAt" TIMESTAMP(3),
    "createdById" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "staff_invitations_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_device_access_userId_idx" ON "user_device_access"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_device_access_deviceId_idx" ON "user_device_access"("deviceId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_permissions_userId_idx" ON "user_permissions"("userId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "user_permissions_permissionId_idx" ON "user_permissions"("permissionId");

-- CreateIndex
CREATE UNIQUE INDEX IF NOT EXISTS "staff_invitations_tokenHash_key" ON "staff_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_invitations_tenantId_idx" ON "staff_invitations"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_invitations_tokenHash_idx" ON "staff_invitations"("tokenHash");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "staff_invitations_email_idx" ON "staff_invitations"("email");

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_device_access_userId_fkey') THEN
        ALTER TABLE "user_device_access" ADD CONSTRAINT "user_device_access_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_device_access_deviceId_fkey') THEN
        ALTER TABLE "user_device_access" ADD CONSTRAINT "user_device_access_deviceId_fkey" FOREIGN KEY ("deviceId") REFERENCES "mikrotik_devices"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_permissions_userId_fkey') THEN
        ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'user_permissions_permissionId_fkey') THEN
        ALTER TABLE "user_permissions" ADD CONSTRAINT "user_permissions_permissionId_fkey" FOREIGN KEY ("permissionId") REFERENCES "permissions"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_invitations_tenantId_fkey') THEN
        ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_invitations_roleId_fkey') THEN
        ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "roles"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
    END IF;
END $$;

-- AddForeignKey
DO $$ BEGIN
    IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = 'staff_invitations_createdById_fkey') THEN
        ALTER TABLE "staff_invitations" ADD CONSTRAINT "staff_invitations_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
END $$;
