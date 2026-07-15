-- CreateTable
CREATE TABLE "Zone" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "zoneType" TEXT NOT NULL,
    "memberIds" JSONB NOT NULL,
    "actuatorGroup" TEXT,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RecipeDefinition" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "cropName" TEXT,
    "topologyMode" TEXT NOT NULL,
    "notes" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "RecipePhase" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "recipeId" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "phaseOrder" INTEGER NOT NULL,
    "durationDays" INTEGER,
    "setpoints" JSONB NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "RecipePhase_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "RecipeDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "ZoneRecipeAssignment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "recipeId" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'active',
    "startedAt" DATETIME NOT NULL,
    "endedAt" DATETIME,
    "notes" TEXT,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ZoneRecipeAssignment_zoneId_fkey" FOREIGN KEY ("zoneId") REFERENCES "Zone" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ZoneRecipeAssignment_recipeId_fkey" FOREIGN KEY ("recipeId") REFERENCES "RecipeDefinition" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "Zone_farmId_idx" ON "Zone"("farmId");

-- CreateIndex
CREATE INDEX "Zone_name_idx" ON "Zone"("name");

-- CreateIndex
CREATE INDEX "Zone_zoneType_idx" ON "Zone"("zoneType");

-- CreateIndex
CREATE INDEX "Zone_actuatorGroup_idx" ON "Zone"("actuatorGroup");

-- CreateIndex
CREATE INDEX "RecipeDefinition_farmId_idx" ON "RecipeDefinition"("farmId");

-- CreateIndex
CREATE INDEX "RecipeDefinition_name_idx" ON "RecipeDefinition"("name");

-- CreateIndex
CREATE INDEX "RecipeDefinition_topologyMode_idx" ON "RecipeDefinition"("topologyMode");

-- CreateIndex
CREATE INDEX "RecipePhase_recipeId_idx" ON "RecipePhase"("recipeId");

-- CreateIndex
CREATE INDEX "RecipePhase_phaseOrder_idx" ON "RecipePhase"("phaseOrder");

-- CreateIndex
CREATE INDEX "ZoneRecipeAssignment_farmId_idx" ON "ZoneRecipeAssignment"("farmId");

-- CreateIndex
CREATE INDEX "ZoneRecipeAssignment_zoneId_idx" ON "ZoneRecipeAssignment"("zoneId");

-- CreateIndex
CREATE INDEX "ZoneRecipeAssignment_recipeId_idx" ON "ZoneRecipeAssignment"("recipeId");

-- CreateIndex
CREATE INDEX "ZoneRecipeAssignment_status_idx" ON "ZoneRecipeAssignment"("status");

-- CreateIndex
CREATE INDEX "ZoneRecipeAssignment_startedAt_idx" ON "ZoneRecipeAssignment"("startedAt");
