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
  zone?: string;
  payload?: Record<string, unknown>;
  actorUserId?: string;
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
