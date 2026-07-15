-- CreateTable
CREATE TABLE "AuditEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "actorUserId" TEXT NOT NULL,
    "role" TEXT NOT NULL,
    "eventType" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "targetType" TEXT NOT NULL,
    "targetId" TEXT,
    "details" JSONB,
    "createdAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "PlantingBatch" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchCode" TEXT NOT NULL,
    "cropName" TEXT NOT NULL,
    "cultivar" TEXT,
    "zoneId" TEXT NOT NULL,
    "plantedAt" DATETIME NOT NULL,
    "expectedHarvestStartAt" DATETIME,
    "expectedHarvestEndAt" DATETIME,
    "status" TEXT NOT NULL,
    "startedByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "HarvestRecord" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "batchId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "harvestedAt" DATETIME NOT NULL,
    "operatorUserId" TEXT NOT NULL,
    "usableWeightKg" REAL NOT NULL,
    "rejectWeightKg" REAL NOT NULL,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "HarvestRecord_batchId_fkey" FOREIGN KEY ("batchId") REFERENCES "PlantingBatch" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "AuditEvent_createdAt_idx" ON "AuditEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AuditEvent_actorUserId_idx" ON "AuditEvent"("actorUserId");

-- CreateIndex
CREATE UNIQUE INDEX "PlantingBatch_batchCode_key" ON "PlantingBatch"("batchCode");

-- CreateIndex
CREATE INDEX "PlantingBatch_createdAt_idx" ON "PlantingBatch"("createdAt");

-- CreateIndex
CREATE INDEX "PlantingBatch_zoneId_idx" ON "PlantingBatch"("zoneId");

-- CreateIndex
CREATE INDEX "HarvestRecord_batchId_idx" ON "HarvestRecord"("batchId");

-- CreateIndex
CREATE INDEX "HarvestRecord_createdAt_idx" ON "HarvestRecord"("createdAt");

-- CreateIndex
CREATE INDEX "HarvestRecord_zoneId_idx" ON "HarvestRecord"("zoneId");
