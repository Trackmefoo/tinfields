import type {
  AlertComparison,
  AlertEvent,
  AlertRule,
  DeviceHeartbeat,
  TelemetryPoint,
} from "@/types";
import { prisma } from "@/lib/prisma";
import { appendAuditEvent } from "@/lib/audit-store";
import type { ApprovedRole } from "@/lib/authz";
import { sendAlertEventNotification } from "@/lib/notifications";
import { Prisma } from "@prisma/client";

type IngestTelemetryPoint = {
  farmId: string;
  zoneId: string;
  deviceId?: string;
  sensorType?: string;
  metric: string;
  value: number;
  unit?: string;
  recordedAt?: string;
};

type RuleInput = {
  farmId: string;
  zoneId?: string;
  metric: string;
  comparison: AlertComparison;
  threshold: number;
  durationSeconds?: number;
  severity: "info" | "warning" | "critical";
  enabled?: boolean;
  createdByUserId: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toInputJsonValue(value: Record<string, unknown> | undefined) {
  if (!value) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function telemetryRetentionDays() {
  const raw = process.env.TELEMETRY_RETENTION_DAYS;
  const parsed = Number(raw);
  if (!Number.isFinite(parsed)) {
    return 30;
  }

  return Math.max(1, Math.min(Math.floor(parsed), 3650));
}

function toTelemetryPoint(row: {
  id: string;
  farmId: string;
  zoneId: string;
  deviceId: string | null;
  sensorType: string | null;
  metric: string;
  value: number;
  unit: string | null;
  recordedAt: Date;
  createdAt: Date;
}): TelemetryPoint {
  return {
    id: row.id,
    farmId: row.farmId,
    zoneId: row.zoneId,
    deviceId: row.deviceId ?? undefined,
    sensorType: row.sensorType ?? undefined,
    metric: row.metric,
    value: row.value,
    unit: row.unit ?? undefined,
    recordedAt: row.recordedAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toAlertRule(row: {
  id: string;
  farmId: string;
  zoneId: string | null;
  metric: string;
  comparison: AlertComparison;
  threshold: number;
  durationSeconds: number;
  severity: "info" | "warning" | "critical";
  enabled: boolean;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
}): AlertRule {
  return {
    id: row.id,
    farmId: row.farmId,
    zoneId: row.zoneId ?? undefined,
    metric: row.metric,
    comparison: row.comparison,
    threshold: row.threshold,
    durationSeconds: row.durationSeconds,
    severity: row.severity,
    enabled: row.enabled,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toAlertEvent(row: {
  id: string;
  ruleId: string;
  farmId: string;
  zoneId: string | null;
  severity: "info" | "warning" | "critical";
  status: "open" | "acknowledged" | "resolved";
  message: string;
  triggeredValue: number;
  acknowledgedAt: Date | null;
  acknowledgedByUserId: string | null;
  resolvedAt: Date | null;
  resolvedByUserId: string | null;
  triggeredAt: Date;
  createdAt: Date;
}): AlertEvent {
  return {
    id: row.id,
    ruleId: row.ruleId,
    farmId: row.farmId,
    zoneId: row.zoneId ?? undefined,
    severity: row.severity,
    status: row.status,
    message: row.message,
    triggeredValue: row.triggeredValue,
    acknowledgedAt: row.acknowledgedAt?.toISOString(),
    acknowledgedByUserId: row.acknowledgedByUserId ?? undefined,
    resolvedAt: row.resolvedAt?.toISOString(),
    resolvedByUserId: row.resolvedByUserId ?? undefined,
    triggeredAt: row.triggeredAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
  };
}

function toHeartbeat(row: {
  id: string;
  farmId: string;
  zoneId: string | null;
  deviceId: string;
  status: string;
  lastSeenAt: Date;
  metadata: unknown;
  createdAt: Date;
  updatedAt: Date;
}): DeviceHeartbeat {
  return {
    id: row.id,
    farmId: row.farmId,
    zoneId: row.zoneId ?? undefined,
    deviceId: row.deviceId,
    status: row.status,
    lastSeenAt: row.lastSeenAt.toISOString(),
    metadata: isRecord(row.metadata) ? row.metadata : undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function compareValue(value: number, comparison: AlertComparison, threshold: number) {
  switch (comparison) {
    case "gt":
      return value > threshold;
    case "gte":
      return value >= threshold;
    case "lt":
      return value < threshold;
    case "lte":
      return value <= threshold;
    default:
      return false;
  }
}

async function ruleIsActiveForDuration(point: TelemetryPoint, rule: AlertRule) {
  if (rule.durationSeconds <= 0) {
    return true;
  }

  const cutoff = new Date(new Date(point.recordedAt).getTime() - rule.durationSeconds * 1000);
  const violatingSamples = await prisma.telemetryPoint.count({
    where: {
      farmId: point.farmId,
      zoneId: point.zoneId,
      metric: point.metric,
      recordedAt: {
        gte: cutoff,
      },
      value:
        rule.comparison === "gt"
          ? { gt: rule.threshold }
          : rule.comparison === "gte"
            ? { gte: rule.threshold }
            : rule.comparison === "lt"
              ? { lt: rule.threshold }
              : { lte: rule.threshold },
    },
  });

  return violatingSamples > 0;
}

async function createAlertEventFromRule(point: TelemetryPoint, rule: AlertRule) {
  const existingOpenEvent = await prisma.alertEvent.findFirst({
    where: {
      ruleId: rule.id,
      farmId: point.farmId,
      zoneId: point.zoneId,
      status: "open",
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (existingOpenEvent) {
    return null;
  }

  const now = new Date();
  const event = await prisma.alertEvent.create({
    data: {
      id: crypto.randomUUID(),
      ruleId: rule.id,
      farmId: point.farmId,
      zoneId: point.zoneId,
      severity: rule.severity,
      status: "open",
      message: `Metric ${point.metric} breached ${rule.comparison} ${rule.threshold} in zone ${point.zoneId}`,
      triggeredValue: point.value,
      triggeredAt: new Date(point.recordedAt),
      createdAt: now,
    },
  });

  if (event.severity === "critical") {
    await sendAlertEventNotification({
      severity: event.severity,
      message: event.message,
      farmId: event.farmId,
      zoneId: event.zoneId ?? undefined,
      metric: point.metric,
      threshold: rule.threshold,
      value: point.value,
      ruleId: rule.id,
    });
  }

  return toAlertEvent(event);
}

async function evaluateRulesForPoint(point: TelemetryPoint) {
  const rules = await prisma.alertRule.findMany({
    where: {
      enabled: true,
      farmId: point.farmId,
      metric: point.metric,
      OR: [{ zoneId: null }, { zoneId: point.zoneId }],
    },
    orderBy: {
      createdAt: "asc",
    },
  });

  const triggeredEvents: AlertEvent[] = [];

  for (const row of rules) {
    const rule = toAlertRule(row);
    if (!compareValue(point.value, rule.comparison, rule.threshold)) {
      continue;
    }

    const activeForDuration = await ruleIsActiveForDuration(point, rule);
    if (!activeForDuration) {
      continue;
    }

    const created = await createAlertEventFromRule(point, rule);
    if (created) {
      triggeredEvents.push(created);
    }
  }

  return triggeredEvents;
}

export async function ingestTelemetryPoints(points: IngestTelemetryPoint[], actor?: { userId: string; role: ApprovedRole }) {
  const now = new Date();
  const rows = await Promise.all(
    points.map((point) => {
      const recordedAt = point.recordedAt ? new Date(point.recordedAt) : now;
      const safeRecordedAt = Number.isNaN(recordedAt.getTime()) ? now : recordedAt;

      return prisma.telemetryPoint.create({
        data: {
          id: crypto.randomUUID(),
          farmId: point.farmId,
          zoneId: point.zoneId,
          deviceId: point.deviceId,
          sensorType: point.sensorType,
          metric: point.metric,
          value: point.value,
          unit: point.unit,
          recordedAt: safeRecordedAt,
          createdAt: now,
        },
      });
    }),
  );

  const createdPoints = rows.map((row) => toTelemetryPoint(row));
  const triggeredEvents = (
    await Promise.all(createdPoints.map((point) => evaluateRulesForPoint(point)))
  ).flat();

  const retentionCutoff = new Date(now.getTime() - telemetryRetentionDays() * 24 * 60 * 60 * 1000);
  await prisma.telemetryPoint.deleteMany({
    where: {
      recordedAt: {
        lt: retentionCutoff,
      },
    },
  });

  if (actor) {
    await appendAuditEvent({
      id: crypto.randomUUID(),
      actorUserId: actor.userId,
      role: actor.role,
      createdAt: now.toISOString(),
      eventType: "command",
      action: "ingest-telemetry",
      targetType: "telemetry_point",
      details: {
        count: createdPoints.length,
        triggeredEvents: triggeredEvents.length,
      },
    });
  }

  return {
    items: createdPoints,
    triggeredEvents,
  };
}

export async function listTelemetryPoints(limit = 100, filters?: { farmId?: string; zoneId?: string; metric?: string }) {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 500));
  const rows = await prisma.telemetryPoint.findMany({
    where: {
      farmId: filters?.farmId,
      zoneId: filters?.zoneId,
      metric: filters?.metric,
    },
    orderBy: {
      recordedAt: "desc",
    },
    take: safeLimit,
  });

  return rows.map((row) => toTelemetryPoint(row));
}

export async function createAlertRule(input: RuleInput) {
  const now = new Date();
  const row = await prisma.alertRule.create({
    data: {
      id: crypto.randomUUID(),
      farmId: input.farmId,
      zoneId: input.zoneId,
      metric: input.metric,
      comparison: input.comparison,
      threshold: input.threshold,
      durationSeconds: input.durationSeconds ?? 0,
      severity: input.severity,
      enabled: input.enabled ?? true,
      createdByUserId: input.createdByUserId,
      createdAt: now,
      updatedAt: now,
    },
  });

  return toAlertRule(row);
}

export async function listAlertRules(limit = 100, filters?: { farmId?: string; zoneId?: string; enabled?: boolean }) {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 250));
  const rows = await prisma.alertRule.findMany({
    where: {
      farmId: filters?.farmId,
      zoneId: filters?.zoneId,
      enabled: filters?.enabled,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: safeLimit,
  });

  return rows.map((row) => toAlertRule(row));
}

export async function listAlertEvents(limit = 100, filters?: { farmId?: string; zoneId?: string; status?: "open" | "acknowledged" | "resolved"; severity?: "info" | "warning" | "critical" }) {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 250));
  const rows = await prisma.alertEvent.findMany({
    where: {
      farmId: filters?.farmId,
      zoneId: filters?.zoneId,
      status: filters?.status,
      severity: filters?.severity,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: safeLimit,
  });

  return rows.map((row) => toAlertEvent(row));
}

export async function acknowledgeAlertEvent(eventId: string, userId: string) {
  const now = new Date();
  const row = await prisma.alertEvent.update({
    where: { id: eventId },
    data: {
      status: "acknowledged",
      acknowledgedAt: now,
      acknowledgedByUserId: userId,
    },
  });

  return toAlertEvent(row);
}

export async function upsertHeartbeat(input: { farmId: string; zoneId?: string; deviceId: string; status: string; metadata?: Record<string, unknown>; }) {
  const now = new Date();
  const row = await prisma.deviceHeartbeat.upsert({
    where: {
      deviceId: input.deviceId,
    },
    create: {
      id: crypto.randomUUID(),
      farmId: input.farmId,
      zoneId: input.zoneId,
      deviceId: input.deviceId,
      status: input.status,
      metadata: toInputJsonValue(input.metadata),
      lastSeenAt: now,
      createdAt: now,
      updatedAt: now,
    },
    update: {
      farmId: input.farmId,
      zoneId: input.zoneId,
      status: input.status,
      metadata: toInputJsonValue(input.metadata),
      lastSeenAt: now,
      updatedAt: now,
    },
  });

  return toHeartbeat(row);
}

export async function listHeartbeats(limit = 100, farmId?: string) {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 250));
  const rows = await prisma.deviceHeartbeat.findMany({
    where: {
      farmId,
    },
    orderBy: {
      lastSeenAt: "desc",
    },
    take: safeLimit,
  });

  return rows.map((row) => toHeartbeat(row));
}