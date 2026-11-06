-- CreateTable
CREATE TABLE IF NOT EXISTS "card_pdf_archives" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "storagePath" TEXT NOT NULL,
    "fileSize" INTEGER NOT NULL,
    "cardCount" INTEGER NOT NULL DEFAULT 0,
    "templateType" TEXT,
    "networkName" TEXT,
    "profileName" TEXT,
    "batchId" TEXT,
    "metadata" JSONB,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "card_pdf_archives_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX IF NOT EXISTS "card_pdf_archives_tenantId_idx" ON "card_pdf_archives"("tenantId");

-- CreateIndex
CREATE INDEX IF NOT EXISTS "card_pdf_archives_tenantId_createdAt_idx" ON "card_pdf_archives"("tenantId", "createdAt" DESC);

-- AddForeignKey
DO $$
BEGIN
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'card_pdf_archives_tenantId_fkey'
    ) THEN
        ALTER TABLE "card_pdf_archives" ADD CONSTRAINT "card_pdf_archives_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;
    END IF;
    IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'card_pdf_archives_createdById_fkey'
    ) THEN
        ALTER TABLE "card_pdf_archives" ADD CONSTRAINT "card_pdf_archives_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
    END IF;
END $$;

-- Enable Row Level Security (RLS) for defense-in-depth
ALTER TABLE "card_pdf_archives" ENABLE ROW LEVEL SECURITY;
