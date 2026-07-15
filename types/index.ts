export type SensorType = "temperature" | "humidity" | "soilMoisture" | "ph";

export interface SensorData {
  id: string;
  sensorType: SensorType;
  value: number;
  unit: string;
  timestamp: string;
}

export interface SensorHistoryPoint {
  time: string;
  temperature: number;
  humidity: number;
  soilMoisture: number;
  ph: number;
}

export interface CropRecipe {
  id: string;
  cropName: string;
  targetTemperatureC: number;
  targetHumidityPercent: number;
  irrigationPerDayMl: number;
  photoperiodHours: number;
}

export interface ActuatorCommand {
  deviceId: string;
  command: "on" | "off" | "pulse";
  farmId?: string;
  zone?: string;
  payload?: Record<string, unknown>;
  actorUserId?: string;
  source?: "manual" | "autonomous";
}

export type AuditEventType = "command" | "planting" | "harvest";

export interface AuditEventPayload {
  eventType: AuditEventType;
  action: string;
  targetType: string;
  targetId?: string;
  details?: Record<string, unknown>;
}

export interface StoredAuditEvent extends AuditEventPayload {
  id: string;
  actorUserId: string;
  role: "operator" | "grow_manager" | "admin";
  createdAt: string;
}

export type CropBatchStatus = "planned" | "active" | "harvested" | "archived";
export type QualityGrade = "A" | "B" | "C" | "reject";

export interface CropCatalogItem {
  id: string;
  cropName: string;
  cultivar?: string;
  seedSupplier?: string;
  seedLotCode?: string;
  targetCycleDays?: number;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface BatchZoneAssignment {
  id: string;
  batchId: string;
  zoneId: string;
  assignedAt: string;
  unassignedAt?: string;
  assignmentReason?: string;
  createdAt: string;
}

export interface PlantingBatch {
  id: string;
  batchCode: string;
  cropCatalogId?: string;
  cropName: string;
  cultivar?: string;
  zoneId: string;
  plantedAt: string;
  expectedHarvestStartAt?: string;
  expectedHarvestEndAt?: string;
  status: CropBatchStatus;
  startedByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface HarvestRecord {
  id: string;
  batchId: string;
  zoneId: string;
  harvestedAt: string;
  operatorUserId: string;
  usableWeightKg: number;
  rejectWeightKg: number;
  wetWeightKg?: number;
  dryWeightKg?: number;
  qualityGrade?: QualityGrade;
  defectNotes?: string;
  finalized: boolean;
  finalizedAt?: string;
  notes?: string;
  createdAt: string;
}

export interface YieldKpiItem {
  batchId: string;
  batchCode: string;
  cropName: string;
  cultivar?: string;
  zoneId: string;
  plantedAt: string;
  firstHarvestAt: string;
  lastHarvestAt: string;
  cycleDays: number;
  usableWeightKg: number;
  rejectWeightKg: number;
  rejectRatePct: number;
}

export interface YieldKpiSummary {
  harvestedBatchCount: number;
  totalUsableWeightKg: number;
  totalRejectWeightKg: number;
  avgCycleDays: number;
  avgRejectRatePct: number;
}

export interface YieldKpiResponse {
  windowDays: number;
  windowStart: string;
  windowEnd: string;
  generatedAt: string;
  summary: YieldKpiSummary;
  items: YieldKpiItem[];
}

export interface MessagingReadinessStatus {
  provider: "resend" | "fallback";
  providerConfigured: boolean;
  fromConfigured: boolean;
  toConfigured: boolean;
  healthy: boolean;
}

export type FarmTopologyMode = "tier-as-zone" | "column-as-zone" | "custom";
export type FarmNodeKind = "farm" | "system" | "column" | "tier" | "zone";
export type CommandLifecycle = "queued" | "validated" | "blocked" | "sent" | "acked" | "failed" | "timed_out";
export type AlertSeverity = "info" | "warning" | "critical";
export type AlertComparison = "gt" | "gte" | "lt" | "lte";
export type AlertEventStatus = "open" | "acknowledged" | "resolved";

export interface Farm {
  id: string;
  name: string;
  description?: string;
  topologyMode: FarmTopologyMode;
  createdAt: string;
  updatedAt: string;
}

export interface FarmSystem {
  id: string;
  farmId: string;
  name: string;
  kind?: string;
  createdAt: string;
  updatedAt: string;
}

export interface FarmColumn {
  id: string;
  systemId: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

export interface FarmTier {
  id: string;
  columnId: string;
  label: string;
  createdAt: string;
  updatedAt: string;
}

export interface FarmZone {
  id: string;
  farmId: string;
  name: string;
  zoneType: FarmTopologyMode;
  memberIds: string[];
  actuatorGroup?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Device {
  id: string;
  farmId: string;
  zoneId?: string;
  label: string;
  model?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Sensor {
  id: string;
  deviceId: string;
  sensorType: SensorType;
  label?: string;
  unit?: string;
  createdAt: string;
  updatedAt: string;
}

export interface Actuator {
  id: string;
  deviceId: string;
  label: string;
  capability: string;
  createdAt: string;
  updatedAt: string;
}

export interface RecipePhase {
  id: string;
  recipeId: string;
  name: string;
  order: number;
  durationDays?: number;
  setpoints: Record<string, number>;
}

export interface Recipe {
  id: string;
  farmId: string;
  name: string;
  cropName?: string;
  topologyMode: FarmTopologyMode;
  notes?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  phases: RecipePhase[];
}

export interface ZoneRecipeAssignment {
  id: string;
  farmId: string;
  zoneId: string;
  recipeId: string;
  status: "active" | "completed" | "cancelled";
  startedAt: string;
  endedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
}

export interface ZoneAssignmentPlan {
  id: string;
  farmId: string;
  zoneId: string;
  recipeId?: string;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface TelemetryPoint {
  id: string;
  farmId: string;
  zoneId: string;
  deviceId?: string;
  sensorType?: string;
  metric: string;
  value: number;
  unit?: string;
  recordedAt: string;
  createdAt: string;
}

export interface AlertRule {
  id: string;
  farmId: string;
  zoneId?: string;
  metric: string;
  comparison: AlertComparison;
  threshold: number;
  durationSeconds: number;
  severity: AlertSeverity;
  enabled: boolean;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
}

export interface AlertEvent {
  id: string;
  ruleId: string;
  farmId: string;
  zoneId?: string;
  severity: AlertSeverity;
  status: AlertEventStatus;
  message: string;
  triggeredValue: number;
  acknowledgedByUserId?: string;
  resolvedAt?: string;
  resolvedByUserId?: string;
  triggeredAt: string;
  acknowledgedAt?: string;
  createdAt: string;
}

export interface DeviceHeartbeat {
  id: string;
  farmId: string;
  zoneId?: string;
  deviceId: string;
  status: string;
  lastSeenAt: string;
  metadata?: Record<string, unknown>;
  createdAt: string;
  updatedAt: string;
}

export interface Command {
  id: string;
  farmId: string;
  zoneId?: string;
  actuatorId?: string;
  requestedByUserId: string;
  requestedByRole: "operator" | "grow_manager" | "admin";
  source: "manual" | "autonomous";
  lifecycle: CommandLifecycle;
  action: string;
  payload?: Record<string, unknown>;
  validationMessage?: string;
  blockedReason?: string;
  cooldownUntil?: string;
  createdAt: string;
  updatedAt: string;
}

export interface CommandExecution {
  id: string;
  commandId: string;
  lifecycle: CommandLifecycle;
  validationMessage?: string;
  dispatchedAt?: string;
  acknowledgedAt?: string;
  failedAt?: string;
  timeoutAt?: string;
  createdAt: string;
  updatedAt: string;
}
