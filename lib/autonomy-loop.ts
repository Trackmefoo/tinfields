import { Prisma } from "@prisma/client";
import { appendAuditEvent } from "@/lib/audit-store";
import type { ApprovedRole } from "@/lib/authz";
import { enqueueCommand } from "@/lib/command-queue";
import { prisma } from "@/lib/prisma";

type Actor = {
  userId: string;
  role: ApprovedRole;
};

type RecommendationRisk = "low" | "high";
type RecommendationStatus = "proposed" | "approved" | "rejected" | "executed" | "blocked";

type RecommendationItem = {
  id: string;
  farmId: string;
  zoneId: string;
  recipeId: string;
  recipePhaseId?: string;
  metric: string;
  currentValue: number;
  targetValue: number;
  deviation: number;
  riskLevel: RecommendationRisk;
  status: RecommendationStatus;
  title: string;
  rationale: string;
  recommendedAction: string;
  command: string;
  payload?: Record<string, unknown>;
  requiresApproval: boolean;
  commandId?: string;
  blockedReason?: string;
  decidedByUserId?: string;
  decidedAt?: string;
  executedAt?: string;
  createdAt: string;
  updatedAt: string;
};

type EvaluateResult = {
  created: RecommendationItem[];
  executed: RecommendationItem[];
  pendingApproval: RecommendationItem[];
  blocked: RecommendationItem[];
};

type DecisionResult = {
  item: RecommendationItem;
  queueResult?: {
    commandId: string;
    lifecycle: string;
    blockedReason?: string;
  };
};

type RuleMapping = {
  tolerance: number;
  criticalDeviation: number;
  getAction: (deviation: number) => {
    recommendedAction: string;
    command: "on" | "off" | "pulse";
    actuatorId: string;
    payload?: Record<string, unknown>;
    onlyIf: (deviation: number) => boolean;
  };
};

const METRIC_RULES: Record<string, RuleMapping> = {
  temperature: {
    tolerance: 1,
    criticalDeviation: 4,
    getAction: (deviation) => ({
      recommendedAction: "Increase ventilation pulse to cool zone",
      command: "pulse",
      actuatorId: "ventilation-main",
      payload: { seconds: Math.max(10, Math.min(45, Math.round(10 + deviation * 4))) },
      onlyIf: (value) => value > 0,
    }),
  },
  soilMoisture: {
    tolerance: 5,
    criticalDeviation: 20,
    getAction: (deviation) => ({
      recommendedAction: "Run irrigation pulse to raise moisture",
      command: "pulse",
      actuatorId: "irrigation-a",
      payload: { seconds: Math.max(8, Math.min(20, Math.round(8 + Math.abs(deviation) / 2))) },
      onlyIf: (value) => value < 0,
    }),
  },
  humidity: {
    tolerance: 5,
    criticalDeviation: 15,
    getAction: (deviation) => ({
      recommendedAction: "Run short irrigation pulse to recover humidity",
      command: "pulse",
      actuatorId: "irrigation-a",
      payload: { seconds: Math.max(5, Math.min(12, Math.round(5 + Math.abs(deviation) / 4))) },
      onlyIf: (value) => value < 0,
    }),
  },
  ph: {
    tolerance: 0.2,
    criticalDeviation: 0.4,
    getAction: (deviation) => ({
      recommendedAction: "Run nutrient correction pulse",
      command: "pulse",
      actuatorId: "irrigation-a",
      payload: { seconds: Math.max(3, Math.min(8, Math.round(3 + Math.abs(deviation) * 6))) },
      onlyIf: () => true,
    }),
  },
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toInputJson(value: Record<string, unknown> | undefined) {
  if (!value) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toSetpoints(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  const entries = Object.entries(value)
    .map(([key, raw]) => {
      const parsed = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(parsed)) {
        return null;
      }
      return [key, parsed] as const;
    })
    .filter((entry): entry is readonly [string, number] => !!entry);

  return Object.fromEntries(entries);
}

function selectActivePhase(phases: Array<{ id: string; phaseOrder: number; durationDays: number | null; setpoints: unknown }>, startedAt: Date, now: Date) {
  const ordered = [...phases].sort((a, b) => a.phaseOrder - b.phaseOrder);
  if (ordered.length === 0) {
    return null;
  }

  let cursor = startedAt.getTime();
  for (const phase of ordered) {
    const durationDays = phase.durationDays ?? 0;
    if (durationDays <= 0) {
      return phase;
    }

    const phaseEnd = cursor + durationDays * 24 * 60 * 60 * 1000;
    if (now.getTime() <= phaseEnd) {
      return phase;
    }

    cursor = phaseEnd;
  }

  return ordered[ordered.length - 1];
}

async function latestTelemetryForZoneMetrics(farmId: string, zoneId: string, metrics: string[]) {
  const points = await prisma.telemetryPoint.findMany({
    where: {
      farmId,
      zoneId,
      metric: { in: metrics },
    },
    orderBy: {
      recordedAt: "desc",
    },
    take: 300,
  });

  const latestByMetric = new Map<string, { value: number; recordedAt: Date }>();
  points.forEach((point) => {
    if (!latestByMetric.has(point.metric)) {
      latestByMetric.set(point.metric, { value: point.value, recordedAt: point.recordedAt });
    }
  });

  return latestByMetric;
}

function toRecommendationItem(row: {
  id: string;
  farmId: string;
  zoneId: string;
  recipeId: string;
  recipePhaseId: string | null;
  metric: string;
  currentValue: number;
  targetValue: number;
  deviation: number;
  riskLevel: RecommendationRisk;
  status: RecommendationStatus;
  title: string;
  rationale: string;
  recommendedAction: string;
  command: string;
  payload: unknown;
  requiresApproval: boolean;
  commandId: string | null;
  blockedReason: string | null;
  decidedByUserId: string | null;
  decidedAt: Date | null;
  executedAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): RecommendationItem {
  return {
    id: row.id,
    farmId: row.farmId,
    zoneId: row.zoneId,
    recipeId: row.recipeId,
    recipePhaseId: row.recipePhaseId ?? undefined,
    metric: row.metric,
    currentValue: row.currentValue,
    targetValue: row.targetValue,
    deviation: row.deviation,
    riskLevel: row.riskLevel,
    status: row.status,
    title: row.title,
    rationale: row.rationale,
    recommendedAction: row.recommendedAction,
    command: row.command,
    payload: isRecord(row.payload) ? row.payload : undefined,
    requiresApproval: row.requiresApproval,
    commandId: row.commandId ?? undefined,
    blockedReason: row.blockedReason ?? undefined,
    decidedByUserId: row.decidedByUserId ?? undefined,
    decidedAt: row.decidedAt?.toISOString(),
    executedAt: row.executedAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function persistRecommendation(input: {
  farmId: string;
  zoneId: string;
  recipeId: string;
  recipePhaseId?: string;
  metric: string;
  currentValue: number;
  targetValue: number;
  deviation: number;
  riskLevel: RecommendationRisk;
  title: string;
  rationale: string;
  recommendedAction: string;
  command: "on" | "off" | "pulse";
  payload?: Record<string, unknown>;
  requiresApproval: boolean;
}) {
  const now = new Date();
  const row = await prisma.autonomyRecommendation.create({
    data: {
      id: crypto.randomUUID(),
      farmId: input.farmId,
      zoneId: input.zoneId,
      recipeId: input.recipeId,
      recipePhaseId: input.recipePhaseId,
      metric: input.metric,
      currentValue: input.currentValue,
      targetValue: input.targetValue,
      deviation: input.deviation,
      riskLevel: input.riskLevel,
      status: "proposed",
      title: input.title,
      rationale: input.rationale,
      recommendedAction: input.recommendedAction,
      command: input.command,
      payload: toInputJson(input.payload),
      requiresApproval: input.requiresApproval,
      createdAt: now,
      updatedAt: now,
    },
  });

  return row;
}

export async function runAutonomyEvaluation(actor: Actor, farmId?: string): Promise<EvaluateResult> {
  const now = new Date();
  const activeAssignments = await prisma.zoneRecipeAssignment.findMany({
    where: {
      farmId: farmId || undefined,
      status: "active",
      endedAt: null,
    },
    include: {
      recipe: {
        include: {
          phases: true,
        },
      },
      zone: true,
    },
    orderBy: {
      startedAt: "desc",
    },
  });

  const created: RecommendationItem[] = [];
  const executed: RecommendationItem[] = [];
  const pendingApproval: RecommendationItem[] = [];
  const blocked: RecommendationItem[] = [];

  for (const assignment of activeAssignments) {
    const activePhase = selectActivePhase(assignment.recipe.phases, assignment.startedAt, now);
    if (!activePhase) {
      continue;
    }

    const setpoints = toSetpoints(activePhase.setpoints);
    const metrics = Object.keys(setpoints).filter((metric) => metric in METRIC_RULES);
    if (metrics.length === 0) {
      continue;
    }

    const latestByMetric = await latestTelemetryForZoneMetrics(assignment.farmId, assignment.zoneId, metrics);

    for (const metric of metrics) {
      const latest = latestByMetric.get(metric);
      if (!latest) {
        continue;
      }

      const targetValue = setpoints[metric];
      const deviation = Number((latest.value - targetValue).toFixed(3));
      const mapping = METRIC_RULES[metric];

      if (Math.abs(deviation) <= mapping.tolerance) {
        continue;
      }

      const action = mapping.getAction(deviation);
      if (!action.onlyIf(deviation)) {
        continue;
      }

      const riskLevel: RecommendationRisk = Math.abs(deviation) >= mapping.criticalDeviation ? "high" : "low";
      const requiresApproval = riskLevel === "high";
      const recommendationRow = await persistRecommendation({
        farmId: assignment.farmId,
        zoneId: assignment.zoneId,
        recipeId: assignment.recipeId,
        recipePhaseId: activePhase.id,
        metric,
        currentValue: latest.value,
        targetValue,
        deviation,
        riskLevel,
        title: `${metric} drift in zone ${assignment.zone.name}`,
        rationale: `Current ${metric} value ${latest.value} differs from target ${targetValue} by ${deviation}.`,
        recommendedAction: action.recommendedAction,
        command: action.command,
        payload: action.payload,
        requiresApproval,
      });

      let recommendation = toRecommendationItem(recommendationRow);
      created.push(recommendation);

      if (!requiresApproval) {
        const queue = await enqueueCommand({
          farmId: assignment.farmId,
          zoneId: assignment.zoneId,
          actuatorId: action.actuatorId,
          source: "autonomous",
          action: `autonomy-${metric}-adjust`,
          command: action.command,
          payload: {
            ...(action.payload ?? {}),
            recommendationId: recommendation.id,
            reason: recommendation.rationale,
          },
          requestedByUserId: actor.userId,
          requestedByRole: actor.role,
          safetyContext: {
            lastTelemetryAt: latest.recordedAt.toISOString(),
            manualOverrideLocked: false,
          },
        });

        const updated = await prisma.autonomyRecommendation.update({
          where: { id: recommendation.id },
          data: {
            status: queue.command.lifecycle === "blocked" ? "blocked" : "executed",
            commandId: queue.command.id,
            blockedReason: queue.command.blockedReason,
            executedAt: queue.command.lifecycle === "blocked" ? null : now,
            updatedAt: now,
          },
        });

        recommendation = toRecommendationItem(updated);
        if (updated.status === "blocked") {
          blocked.push(recommendation);
        } else {
          executed.push(recommendation);
        }
      } else {
        pendingApproval.push(recommendation);
      }
    }
  }

  await appendAuditEvent({
    id: crypto.randomUUID(),
    actorUserId: actor.userId,
    role: actor.role,
    createdAt: now.toISOString(),
    eventType: "command",
    action: "autonomy-evaluator-run",
    targetType: "autonomy",
    details: {
      farmId: farmId || null,
      created: created.length,
      executed: executed.length,
      pendingApproval: pendingApproval.length,
      blocked: blocked.length,
    },
  });

  return {
    created,
    executed,
    pendingApproval,
    blocked,
  };
}

export async function listAutonomyRecommendations(limit = 100, filters?: {
  farmId?: string;
  zoneId?: string;
  status?: RecommendationStatus;
  riskLevel?: RecommendationRisk;
}) {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 250));
  const rows = await prisma.autonomyRecommendation.findMany({
    where: {
      farmId: filters?.farmId,
      zoneId: filters?.zoneId,
      status: filters?.status,
      riskLevel: filters?.riskLevel,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: safeLimit,
  });

  return rows.map((row) => toRecommendationItem(row));
}

export async function decideAutonomyRecommendation(
  recommendationId: string,
  decision: "approve" | "reject",
  actor: Actor,
): Promise<DecisionResult> {
  const now = new Date();
  const recommendation = await prisma.autonomyRecommendation.findUnique({
    where: { id: recommendationId },
  });

  if (!recommendation) {
    throw new Error("Recommendation not found");
  }

  if (recommendation.status !== "proposed") {
    throw new Error("Recommendation is no longer awaiting decision");
  }

  if (!recommendation.requiresApproval) {
    throw new Error("Low-risk recommendation does not require approval");
  }

  if (decision === "reject") {
    const updated = await prisma.autonomyRecommendation.update({
      where: { id: recommendationId },
      data: {
        status: "rejected",
        decidedByUserId: actor.userId,
        decidedAt: now,
        updatedAt: now,
      },
    });

    await appendAuditEvent({
      id: crypto.randomUUID(),
      actorUserId: actor.userId,
      role: actor.role,
      createdAt: now.toISOString(),
      eventType: "command",
      action: "autonomy-recommendation-rejected",
      targetType: "autonomy_recommendation",
      targetId: recommendationId,
    });

    return { item: toRecommendationItem(updated) };
  }

  const payload = isRecord(recommendation.payload) ? recommendation.payload : {};
  const queue = await enqueueCommand({
    farmId: recommendation.farmId,
    zoneId: recommendation.zoneId,
    actuatorId: typeof payload.actuatorId === "string" ? payload.actuatorId : "irrigation-a",
    source: "autonomous",
    action: `autonomy-approved-${recommendation.metric}`,
    command: recommendation.command === "on" || recommendation.command === "off" || recommendation.command === "pulse"
      ? recommendation.command
      : "pulse",
    payload: {
      ...payload,
      recommendationId,
      decisionBy: actor.userId,
    },
    requestedByUserId: actor.userId,
    requestedByRole: actor.role,
    safetyContext: {
      lastTelemetryAt: new Date().toISOString(),
      manualOverrideLocked: false,
    },
  });

  const updated = await prisma.autonomyRecommendation.update({
    where: { id: recommendationId },
    data: {
      status: queue.command.lifecycle === "blocked" ? "blocked" : "executed",
      commandId: queue.command.id,
      blockedReason: queue.command.blockedReason,
      decidedByUserId: actor.userId,
      decidedAt: now,
      executedAt: queue.command.lifecycle === "blocked" ? null : now,
      updatedAt: now,
    },
  });

  await appendAuditEvent({
    id: crypto.randomUUID(),
    actorUserId: actor.userId,
    role: actor.role,
    createdAt: now.toISOString(),
    eventType: "command",
    action: "autonomy-recommendation-approved",
    targetType: "autonomy_recommendation",
    targetId: recommendationId,
    details: {
      commandId: queue.command.id,
      commandLifecycle: queue.command.lifecycle,
      blockedReason: queue.command.blockedReason,
    },
  });

  return {
    item: toRecommendationItem(updated),
    queueResult: {
      commandId: queue.command.id,
      lifecycle: queue.command.lifecycle,
      blockedReason: queue.command.blockedReason,
    },
  };
}
