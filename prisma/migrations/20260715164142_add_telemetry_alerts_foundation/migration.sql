-- CreateTable
CREATE TABLE "TelemetryPoint" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "zoneId" TEXT NOT NULL,
    "deviceId" TEXT,
    "sensorType" TEXT,
    "metric" TEXT NOT NULL,
    "value" REAL NOT NULL,
    "unit" TEXT,
    "recordedAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AlertRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "zoneId" TEXT,
    "metric" TEXT NOT NULL,
    "comparison" TEXT NOT NULL,
    "threshold" REAL NOT NULL,
    "durationSeconds" INTEGER NOT NULL DEFAULT 0,
    "severity" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateTable
CREATE TABLE "AlertEvent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ruleId" TEXT NOT NULL,
    "farmId" TEXT NOT NULL,
    "zoneId" TEXT,
    "severity" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'open',
    "message" TEXT NOT NULL,
    "triggeredValue" REAL NOT NULL,
    "acknowledgedAt" DATETIME,
    "acknowledgedByUserId" TEXT,
    "resolvedAt" DATETIME,
    "resolvedByUserId" TEXT,
    "triggeredAt" DATETIME NOT NULL,
    "createdAt" DATETIME NOT NULL,
    CONSTRAINT "AlertEvent_ruleId_fkey" FOREIGN KEY ("ruleId") REFERENCES "AlertRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateTable
CREATE TABLE "DeviceHeartbeat" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "farmId" TEXT NOT NULL,
    "zoneId" TEXT,
    "deviceId" TEXT NOT NULL,
    "status" TEXT NOT NULL,
    "lastSeenAt" DATETIME NOT NULL,
    "metadata" JSONB,
    "createdAt" DATETIME NOT NULL,
    "updatedAt" DATETIME NOT NULL
);

-- CreateIndex
CREATE INDEX "TelemetryPoint_createdAt_idx" ON "TelemetryPoint"("createdAt");

-- CreateIndex
CREATE INDEX "TelemetryPoint_farmId_idx" ON "TelemetryPoint"("farmId");

-- CreateIndex
CREATE INDEX "TelemetryPoint_zoneId_idx" ON "TelemetryPoint"("zoneId");

-- CreateIndex
CREATE INDEX "TelemetryPoint_metric_idx" ON "TelemetryPoint"("metric");

-- CreateIndex
CREATE INDEX "TelemetryPoint_recordedAt_idx" ON "TelemetryPoint"("recordedAt");

-- CreateIndex
CREATE INDEX "AlertRule_farmId_idx" ON "AlertRule"("farmId");

-- CreateIndex
CREATE INDEX "AlertRule_zoneId_idx" ON "AlertRule"("zoneId");

-- CreateIndex
CREATE INDEX "AlertRule_metric_idx" ON "AlertRule"("metric");

-- CreateIndex
CREATE INDEX "AlertRule_enabled_idx" ON "AlertRule"("enabled");

-- CreateIndex
CREATE INDEX "AlertEvent_createdAt_idx" ON "AlertEvent"("createdAt");

-- CreateIndex
CREATE INDEX "AlertEvent_farmId_idx" ON "AlertEvent"("farmId");

-- CreateIndex
CREATE INDEX "AlertEvent_zoneId_idx" ON "AlertEvent"("zoneId");

-- CreateIndex
CREATE INDEX "AlertEvent_status_idx" ON "AlertEvent"("status");

-- CreateIndex
CREATE INDEX "AlertEvent_severity_idx" ON "AlertEvent"("severity");

-- CreateIndex
CREATE UNIQUE INDEX "DeviceHeartbeat_deviceId_key" ON "DeviceHeartbeat"("deviceId");

-- CreateIndex
CREATE INDEX "DeviceHeartbeat_farmId_idx" ON "DeviceHeartbeat"("farmId");

-- CreateIndex
CREATE INDEX "DeviceHeartbeat_zoneId_idx" ON "DeviceHeartbeat"("zoneId");

-- CreateIndex
CREATE INDEX "DeviceHeartbeat_lastSeenAt_idx" ON "DeviceHeartbeat"("lastSeenAt");
