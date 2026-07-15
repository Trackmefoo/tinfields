-- CreateTable
CREATE TABLE "AutonomyRecommendation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "recipePhaseId" TEXT,
    "metric" TEXT NOT NULL,
    "currentValue" REAL NOT NULL,
    "targetValue" REAL NOT NULL,
    "deviation" REAL NOT NULL,
    "riskLevel" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'proposed',
    "title" TEXT NOT NULL,
    "rationale" TEXT NOT NULL,
    "recommendedAction" TEXT NOT NULL,
    "command" TEXT NOT NULL,
    "payload" JSONB,
    "requiresApproval" BOOLEAN NOT NULL DEFAULT false,
    "commandId" TEXT,
    "blockedReason" TEXT,
    "decidedByUserId" TEXT,
    "decidedAt" DATETIME,
    "executedAt" DATETIME,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "AutonomyRecommendation_farmId_idx" ON "AutonomyRecommendation"("farmId");

-- CreateIndex
CREATE INDEX "AutonomyRecommendation_zoneId_idx" ON "AutonomyRecommendation"("zoneId");

-- CreateIndex
CREATE INDEX "AutonomyRecommendation_status_idx" ON "AutonomyRecommendation"("status");

-- CreateIndex
CREATE INDEX "AutonomyRecommendation_riskLevel_idx" ON "AutonomyRecommendation"("riskLevel");

-- CreateIndex
CREATE INDEX "AutonomyRecommendation_createdAt_idx" ON "AutonomyRecommendation"("createdAt");
