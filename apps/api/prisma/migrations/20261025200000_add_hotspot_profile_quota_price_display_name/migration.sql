-- AlterTable: Add dataLimitBytes, displayName, price to hotspot_profiles if they do not exist
ALTER TABLE "hotspot_profiles" 
ADD COLUMN IF NOT EXISTS "dataLimitBytes" BIGINT,
ADD COLUMN IF NOT EXISTS "displayName" TEXT,
ADD COLUMN IF NOT EXISTS "price" DECIMAL(10, 2) DEFAULT 0;
