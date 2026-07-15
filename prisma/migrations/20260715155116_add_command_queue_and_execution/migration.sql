-- CreateTable
CREATE TABLE "Command" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "zoneId" TEXT,
    "actuatorId" TEXT,
    "source" TEXT NOT NULL,
    "lifecycle" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "requestedByUserId" TEXT NOT NULL,
    "requestedByRole" TEXT NOT NULL,
    "validationMessage" TEXT,
    "blockedReason" TEXT,
    "cooldownUntil" DATETIME,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "CommandExecution" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "commandId" TEXT NOT NULL,
    "lifecycle" TEXT NOT NULL,
    "validationMessage" TEXT,
    "dispatchedAt" DATETIME,
    "acknowledgedAt" DATETIME,
    "failedAt" DATETIME,
    "timeoutAt" DATETIME,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CommandExecution_commandId_fkey" FOREIGN KEY ("commandId") REFERENCES "Command" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Command_createdAt_idx" ON "Command"("createdAt");

-- CreateIndex
CREATE INDEX "Command_farmId_idx" ON "Command"("farmId");

-- CreateIndex
CREATE INDEX "Command_zoneId_idx" ON "Command"("zoneId");

-- CreateIndex
CREATE INDEX "Command_source_idx" ON "Command"("source");

-- CreateIndex
CREATE INDEX "Command_lifecycle_idx" ON "Command"("lifecycle");

-- CreateIndex
CREATE INDEX "CommandExecution_commandId_idx" ON "CommandExecution"("commandId");

-- CreateIndex
CREATE INDEX "CommandExecution_createdAt_idx" ON "CommandExecution"("createdAt");

-- CreateIndex
CREATE INDEX "CommandExecution_lifecycle_idx" ON "CommandExecution"("lifecycle");
