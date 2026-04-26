-- AlterTable
ALTER TABLE "Affiliate" ADD COLUMN "name" TEXT;

-- CreateTable
CREATE TABLE "Click" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliateId" TEXT NOT NULL,
    "refCode" TEXT NOT NULL,
    "shop" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Click_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "AppBilling" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "subscriptionId" TEXT NOT NULL,
    "subscriptionLineItemId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'ACTIVE',
    "cappedAmount" REAL NOT NULL DEFAULT 100,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "ReferralSession" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "refCode" TEXT NOT NULL,
    "shop" TEXT,
    "sessionId" TEXT,
    "landedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Conversion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "orderId" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "affiliateId" TEXT,
    "totalAmount" REAL NOT NULL,
    "currency" TEXT NOT NULL DEFAULT 'USD',
    "email" TEXT,
    "commissionApp" REAL NOT NULL,
    "commissionAffiliate" REAL NOT NULL,
    "refCode" TEXT,
    "billingChargeId" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversion_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Conversion" ("affiliateId", "commissionAffiliate", "commissionApp", "createdAt", "id", "orderId", "shop", "totalAmount") SELECT "affiliateId", "commissionAffiliate", "commissionApp", "createdAt", "id", "orderId", "shop", "totalAmount" FROM "Conversion";
DROP TABLE "Conversion";
ALTER TABLE "new_Conversion" RENAME TO "Conversion";
CREATE UNIQUE INDEX "Conversion_orderId_key" ON "Conversion"("orderId");
CREATE INDEX "Conversion_affiliateId_idx" ON "Conversion"("affiliateId");
CREATE INDEX "Conversion_orderId_idx" ON "Conversion"("orderId");
CREATE INDEX "Conversion_refCode_idx" ON "Conversion"("refCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "Click_affiliateId_idx" ON "Click"("affiliateId");

-- CreateIndex
CREATE INDEX "Click_refCode_idx" ON "Click"("refCode");

-- CreateIndex
CREATE UNIQUE INDEX "AppBilling_shop_key" ON "AppBilling"("shop");

-- CreateIndex
CREATE INDEX "AppBilling_shop_idx" ON "AppBilling"("shop");

-- CreateIndex
CREATE INDEX "ReferralSession_refCode_idx" ON "ReferralSession"("refCode");
