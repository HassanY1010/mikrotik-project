-- CreateEnum
CREATE TYPE "ExpenseCategory" AS ENUM ('INTERNET_UPSTREAM', 'ELECTRICITY', 'PAPER_AND_INK', 'HARDWARE_MAINTENANCE', 'SALARIES', 'COMMISSIONS', 'RENT', 'OTHER');

-- CreateEnum
CREATE TYPE "PaymentStatus" AS ENUM ('PAID', 'PARTIAL', 'UNPAID', 'REFUNDED');

-- AlterTable
ALTER TABLE "card_batches" ADD COLUMN "unitCost" DECIMAL(10,2) DEFAULT 0;

-- AlterTable
ALTER TABLE "cards" ADD COLUMN "unitCost" DECIMAL(10,2) DEFAULT 0,
ADD COLUMN "isPrinted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "printedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "sale_transactions" ADD COLUMN "discountAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "paidAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "remainingAmount" DECIMAL(10,2) NOT NULL DEFAULT 0,
ADD COLUMN "paymentStatus" "PaymentStatus" NOT NULL DEFAULT 'PAID',
ADD COLUMN "distributorName" TEXT,
ADD COLUMN "notes" TEXT;

-- CreateTable
CREATE TABLE "expenses" (
    "id" TEXT NOT NULL,
    "tenantId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "category" "ExpenseCategory" NOT NULL DEFAULT 'OTHER',
    "amount" DECIMAL(10,2) NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'SDG',
    "expenseDate" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "paymentMethod" "PaymentMethod" NOT NULL DEFAULT 'CASH',
    "vendor" TEXT,
    "description" TEXT,
    "receiptUrl" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "expenses_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "cards_isPrinted_idx" ON "cards"("isPrinted");

-- CreateIndex
CREATE INDEX "sale_transactions_paymentStatus_idx" ON "sale_transactions"("paymentStatus");

-- CreateIndex
CREATE INDEX "expenses_tenantId_idx" ON "expenses"("tenantId");

-- CreateIndex
CREATE INDEX "expenses_tenantId_expenseDate_idx" ON "expenses"("tenantId", "expenseDate");

-- CreateIndex
CREATE INDEX "expenses_tenantId_category_idx" ON "expenses"("tenantId", "category");

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_tenantId_fkey" FOREIGN KEY ("tenantId") REFERENCES "tenants"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "expenses" ADD CONSTRAINT "expenses_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
