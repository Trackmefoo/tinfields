-- CreateTable
CREATE TABLE "CropCatalogItem" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "cropName" TEXT NOT NULL,
    "cultivar" TEXT,
    "seedSupplier" TEXT,
    "seedLotCode" TEXT,
    "targetCycleDays" INTEGER,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "BatchZoneAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "assignedAt" DATETIME NOT NULL,
    "unassignedAt" DATETIME,
    "assignmentReason" TEXT,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "BatchZoneAssignment_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PlantingBatch" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlantingBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchCode" TEXT NOT NULL,
    "cropCatalogId" TEXT,
    "cropName" TEXT NOT NULL,
    "cultivar" TEXT,
    "zoneId" TEXT NOT NULL,
    "plantedAt" DATETIME NOT NULL,
    "expectedHarvestStartAt" DATETIME,
    "expectedHarvestEndAt" DATETIME,
    "status" TEXT NOT NULL,
    "startedByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlantingBatch_cropCatalogId_fkey" FOREIGN KEY ("cropCatalogId") REFERENCES "CropCatalogItem" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_PlantingBatch" ("batchCode", "createdAt", "cropName", "cultivar", "expectedHarvestEndAt", "expectedHarvestStartAt", "id", "plantedAt", "startedByUserId", "status", "updatedAt", "zoneId") SELECT "batchCode", "createdAt", "cropName", "cultivar", "expectedHarvestEndAt", "expectedHarvestStartAt", "id", "plantedAt", "startedByUserId", "status", "updatedAt", "zoneId" FROM "PlantingBatch";
DROP TABLE "PlantingBatch";
ALTER TABLE "new_PlantingBatch" RENAME TO "PlantingBatch";
CREATE UNIQUE INDEX "PlantingBatch_batchCode_key" ON "PlantingBatch"("batchCode");
CREATE INDEX "PlantingBatch_createdAt_idx" ON "PlantingBatch"("createdAt");
CREATE INDEX "PlantingBatch_cropCatalogId_idx" ON "PlantingBatch"("cropCatalogId");
CREATE INDEX "PlantingBatch_zoneId_idx" ON "PlantingBatch"("zoneId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateIndex
CREATE INDEX "CropCatalogItem_createdAt_idx" ON "CropCatalogItem"("createdAt");

-- CreateIndex
CREATE INDEX "CropCatalogItem_cropName_idx" ON "CropCatalogItem"("cropName");

-- CreateIndex
CREATE INDEX "BatchZoneAssignment_batchId_idx" ON "BatchZoneAssignment"("batchId");

-- CreateIndex
CREATE INDEX "BatchZoneAssignment_assignedAt_idx" ON "BatchZoneAssignment"("assignedAt");

-- CreateIndex
CREATE INDEX "BatchZoneAssignment_zoneId_idx" ON "BatchZoneAssignment"("zoneId");
