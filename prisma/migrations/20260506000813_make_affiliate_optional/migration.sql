-- DropIndex
DROP INDEX "Conversion_refCode_idx";

-- DropIndex
DROP INDEX "Conversion_orderId_idx";

-- DropIndex
DROP INDEX "Conversion_affiliateId_idx";

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Click" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "affiliateId" TEXT,
    "refCode" TEXT NOT NULL,
    "shop" TEXT,
    "ip" TEXT,
    "userAgent" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Click_affiliateId_fkey" FOREIGN KEY ("affiliateId") REFERENCES "Affiliate" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_Click" ("affiliateId", "createdAt", "id", "ip", "refCode", "shop", "userAgent") SELECT "affiliateId", "createdAt", "id", "ip", "refCode", "shop", "userAgent" FROM "Click";
DROP TABLE "Click";
ALTER TABLE "new_Click" RENAME TO "Click";
CREATE INDEX "Click_affiliateId_idx" ON "Click"("affiliateId");
CREATE INDEX "Click_refCode_idx" ON "Click"("refCode");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
