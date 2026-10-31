-- AlterTable
ALTER TABLE "Town" ADD COLUMN "checkbookSettings" TEXT NOT NULL DEFAULT '';

-- CreateTable
CREATE TABLE "CheckbookBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "townId" TEXT NOT NULL,
    "fileName" TEXT NOT NULL,
    "fileHash" TEXT NOT NULL,
    "uploadedBy" TEXT,
    "rowCount" INTEGER NOT NULL DEFAULT 0,
    "newCount" INTEGER NOT NULL DEFAULT 0,
    "duplicateCount" INTEGER NOT NULL DEFAULT 0,
    "changedCount" INTEGER NOT NULL DEFAULT 0,
    "heldCount" INTEGER NOT NULL DEFAULT 0,
    "excludedCount" INTEGER NOT NULL DEFAULT 0,
    "flaggedCount" INTEGER NOT NULL DEFAULT 0,
    "totalAmount" REAL NOT NULL DEFAULT 0,
    "summary" TEXT NOT NULL DEFAULT '{}',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "CheckbookBatch_townId_fkey" FOREIGN KEY ("townId") REFERENCES "Town" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CheckbookVendor" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "townId" TEXT NOT NULL,
    "erpVendorId" TEXT NOT NULL,
    "rawName" TEXT NOT NULL,
    "displayName" TEXT NOT NULL,
    "kind" TEXT NOT NULL DEFAULT 'review',
    "suggestedKind" TEXT,
    "decidedBy" TEXT,
    "decidedAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CheckbookVendor_townId_fkey" FOREIGN KEY ("townId") REFERENCES "Town" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CheckbookPayment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "townId" TEXT NOT NULL,
    "batchId" TEXT NOT NULL,
    "vendorId" TEXT NOT NULL,
    "erpVendorId" TEXT NOT NULL,
    "naturalKey" TEXT NOT NULL,
    "contentHash" TEXT NOT NULL,
    "fiscalYear" TEXT NOT NULL,
    "period" INTEGER,
    "warrant" TEXT,
    "paymentType" TEXT NOT NULL DEFAULT 'payment',
    "amount" REAL NOT NULL,
    "invoiceDate" DATETIME,
    "invoiceNo" TEXT,
    "functionArea" TEXT,
    "department" TEXT,
    "category" TEXT,
    "glAccount" TEXT,
    "memo" TEXT,
    "status" TEXT NOT NULL DEFAULT 'published',
    "holdReason" TEXT,
    "flags" TEXT NOT NULL DEFAULT '[]',
    "reviewed" BOOLEAN NOT NULL DEFAULT false,
    "revision" INTEGER NOT NULL DEFAULT 1,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CheckbookPayment_townId_fkey" FOREIGN KEY ("townId") REFERENCES "Town" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CheckbookPayment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "CheckbookBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "CheckbookPayment_vendorId_fkey" FOREIGN KEY ("vendorId") REFERENCES "CheckbookVendor" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "CheckbookPaymentRaw" (
    "paymentId" TEXT NOT NULL PRIMARY KEY,
    "memoRaw" TEXT,
    "invoiceRaw" TEXT,
    "checkNo" TEXT,
    "document" TEXT NOT NULL,
    "voucher" TEXT,
    "po" TEXT,
    CONSTRAINT "CheckbookPaymentRaw_paymentId_fkey" FOREIGN KEY ("paymentId") REFERENCES "CheckbookPayment" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "CheckbookBatch_townId_createdAt_idx" ON "CheckbookBatch"("townId", "createdAt");

-- CreateIndex
CREATE INDEX "CheckbookBatch_townId_fileHash_idx" ON "CheckbookBatch"("townId", "fileHash");

-- CreateIndex
CREATE INDEX "CheckbookVendor_townId_kind_idx" ON "CheckbookVendor"("townId", "kind");

-- CreateIndex
CREATE UNIQUE INDEX "CheckbookVendor_townId_erpVendorId_key" ON "CheckbookVendor"("townId", "erpVendorId");

-- CreateIndex
CREATE INDEX "CheckbookPayment_townId_status_fiscalYear_idx" ON "CheckbookPayment"("townId", "status", "fiscalYear");

-- CreateIndex
CREATE INDEX "CheckbookPayment_townId_status_warrant_idx" ON "CheckbookPayment"("townId", "status", "warrant");

-- CreateIndex
CREATE INDEX "CheckbookPayment_townId_vendorId_idx" ON "CheckbookPayment"("townId", "vendorId");

-- CreateIndex
CREATE INDEX "CheckbookPayment_townId_invoiceNo_idx" ON "CheckbookPayment"("townId", "invoiceNo");

-- CreateIndex
CREATE INDEX "CheckbookPayment_batchId_idx" ON "CheckbookPayment"("batchId");

-- CreateIndex
CREATE UNIQUE INDEX "CheckbookPayment_townId_naturalKey_key" ON "CheckbookPayment"("townId", "naturalKey");
