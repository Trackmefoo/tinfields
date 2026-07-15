-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_HarvestRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "harvestedAt" DATETIME NOT NULL,
    "operatorUserId" TEXT NOT NULL,
    "usableWeightKg" REAL NOT NULL,
    "rejectWeightKg" REAL NOT NULL,
    "wetWeightKg" REAL,
    "dryWeightKg" REAL,
    "qualityGrade" TEXT,
    "defectNotes" TEXT,
    "finalized" BOOLEAN NOT NULL DEFAULT false,
    "finalizedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "HarvestRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PlantingBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);
INSERT INTO "new_HarvestRecord" ("batchId", "createdAt", "harvestedAt", "id", "notes", "operatorUserId", "rejectWeightKg", "usableWeightKg", "zoneId") SELECT "batchId", "createdAt", "harvestedAt", "id", "notes", "operatorUserId", "rejectWeightKg", "usableWeightKg", "zoneId" FROM "HarvestRecord";
DROP TABLE "HarvestRecord";
ALTER TABLE "new_HarvestRecord" RENAME TO "HarvestRecord";
CREATE INDEX "HarvestRecord_batchId_idx" ON "HarvestRecord"("batchId");
CREATE INDEX "HarvestRecord_createdAt_idx" ON "HarvestRecord"("createdAt");
CREATE INDEX "HarvestRecord_zoneId_idx" ON "HarvestRecord"("zoneId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
