import { Prisma } from "@prisma/client";
import { appendAuditEvent } from "@/lib/audit-store";
import { prisma } from "@/lib/prisma";
import type { ApprovedRole } from "@/lib/authz";
import type { Command, CommandExecution } from "@/types";

type CommandSource = "manual" | "autonomous";
type CommandAction = "on" | "off" | "pulse";
type ValidationOutcome = { blockedReason: string; cooldownUntil?: Date } | null;

export type CommandSafetyContext = {
  lastTelemetryAt?: string;
  manualOverrideLocked?: boolean;
};

export type EnqueueCommandInput = {
  farmId: string;
  zoneId?: string;
  actuatorId: string;
  source: CommandSource;
  action: string;
  command: CommandAction;
  payload?: Record<string, unknown>;
  requestedByUserId: string;
  requestedByRole: ApprovedRole;
  safetyContext?: CommandSafetyContext;
};

export type EnqueueCommandResult = {
  command: Command;
  execution: CommandExecution;
  shouldPublish: boolean;
};

const ACTUATOR_COOLDOWN_MS: Record<string, number> = {
  "lights-main": 45_000,
  "irrigation-a": 120_000,
  "ventilation-main": 60_000,
};

const MAX_PULSE_SECONDS: Record<string, number> = {
  "lights-main": 5,
  "irrigation-a": 20,
  "ventilation-main": 30,
};

const MUTUALLY_EXCLUSIVE_ACTUATOR_PAIRS: Array<[string, string]> = [["lights-main", "ventilation-main"]];
const SENSOR_TIMEOUT_MS = 2 * 60 * 1000;

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toJsonValue(value: Record<string, unknown>) {
  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toDate(value: string | undefined) {
  if (!value) {
    return undefined;
  }

  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return undefined;
  }

  return date;
}

function getPulseSeconds(payload?: Record<string, unknown>) {
  if (!payload) {
    return undefined;
  }

  const seconds = payload.seconds ?? payload.durationSeconds ?? payload.runtimeSeconds;
  if (typeof seconds === "number" && Number.isFinite(seconds)) {
    return seconds;
  }

  if (typeof seconds === "string") {
    const parsed = Number(seconds);
    if (Number.isFinite(parsed)) {
      return parsed;
    }
  }

  return null;
}

function getCooldownMs(actuatorId: string) {
  return ACTUATOR_COOLDOWN_MS[actuatorId] ?? 30_000;
}

function getMaxPulseSeconds(actuatorId: string) {
  return MAX_PULSE_SECONDS[actuatorId] ?? 10;
}

function isConflictPair(firstActuatorId: string, secondActuatorId: string) {
  return MUTUALLY_EXCLUSIVE_ACTUATOR_PAIRS.some(
    ([left, right]) =>
      (left === firstActuatorId && right === secondActuatorId) ||
      (left === secondActuatorId && right === firstActuatorId),
  );
}

function isActiveLifecycle(lifecycle: string) {
  return lifecycle === "queued" || lifecycle === "validated" || lifecycle === "sent" || lifecycle === "acked";
}

function toCommand(row: {
  id: string;
  farmId: string;
  zoneId: string | null;
  actuatorId: string | null;
  source: CommandSource;
  lifecycle: string;
  action: string;
  payload: Prisma.JsonValue | null;
  requestedByUserId: string;
  requestedByRole: ApprovedRole;
  validationMessage: string | null;
  blockedReason: string | null;
  cooldownUntil: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): Command {
  return {
    id: row.id,
    farmId: row.farmId,
    zoneId: row.zoneId ?? undefined,
    actuatorId: row.actuatorId ?? undefined,
    requestedByUserId: row.requestedByUserId,
    requestedByRole: row.requestedByRole,
    source: row.source,
    lifecycle: row.lifecycle as Command["lifecycle"],
    action: row.action,
    payload: isRecord(row.payload) ? row.payload : undefined,
    validationMessage: row.validationMessage ?? undefined,
    blockedReason: row.blockedReason ?? undefined,
    cooldownUntil: row.cooldownUntil?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toExecution(row: {
  id: string;
  commandId: string;
  lifecycle: string;
  validationMessage: string | null;
  dispatchedAt: Date | null;
  acknowledgedAt: Date | null;
  failedAt: Date | null;
  timeoutAt: Date | null;
  createdAt: Date;
  updatedAt: Date;
}): CommandExecution {
  return {
    id: row.id,
    commandId: row.commandId,
    lifecycle: row.lifecycle as CommandExecution["lifecycle"],
    validationMessage: row.validationMessage ?? undefined,
    dispatchedAt: row.dispatchedAt?.toISOString(),
    acknowledgedAt: row.acknowledgedAt?.toISOString(),
    failedAt: row.failedAt?.toISOString(),
    timeoutAt: row.timeoutAt?.toISOString(),
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

async function findBlockingCommand(actuatorId: string, source: CommandSource, now: Date): Promise<ValidationOutcome> {
  const cooldownMs = getCooldownMs(actuatorId);
  const cutoff = new Date(now.getTime() - cooldownMs);

  const recentCommand = await prisma.command.findFirst({
    where: {
      actuatorId,
      lifecycle: { in: ["queued", "validated", "sent", "acked"] },
      createdAt: {
        gte: cutoff,
      },
    },
    orderBy: {
      createdAt: "desc",
    },
  });

  if (recentCommand && isActiveLifecycle(recentCommand.lifecycle)) {
    return {
      blockedReason: `Actuator cooldown active for ${actuatorId}`,
      cooldownUntil: new Date(recentCommand.createdAt.getTime() + cooldownMs),
    };
  }

  const exclusiveActuators = MUTUALLY_EXCLUSIVE_ACTUATOR_PAIRS.flatMap(([left, right]) => {
    if (left === actuatorId) {
      return [right];
    }

    if (right === actuatorId) {
      return [left];
    }

    return [];
  });

  if (exclusiveActuators.length > 0) {
    const conflictingCommand = await prisma.command.findFirst({
      where: {
        actuatorId: { in: exclusiveActuators },
        lifecycle: { in: ["queued", "validated", "sent", "acked"] },
      },
      orderBy: {
        createdAt: "desc",
      },
    });

    if (conflictingCommand && conflictingCommand.actuatorId && isConflictPair(actuatorId, conflictingCommand.actuatorId)) {
      return {
        blockedReason: `Mutual exclusion active with ${conflictingCommand.actuatorId ?? "another actuator"}`,
      };
    }
  }

  if (source === "autonomous") {
    return null;
  }

  return null;
}

function validateCommand(input: EnqueueCommandInput, now: Date): ValidationOutcome {
  const pulseSeconds = getPulseSeconds(input.payload);

  if (input.source === "autonomous") {
    if (input.safetyContext?.manualOverrideLocked) {
      return { blockedReason: "Manual override is locked for this actuator" };
    }

    const lastTelemetryAt = toDate(input.safetyContext?.lastTelemetryAt);
    if (!lastTelemetryAt || now.getTime() - lastTelemetryAt.getTime() > SENSOR_TIMEOUT_MS) {
      return { blockedReason: "Sensor timeout failsafe active" };
    }
  }

  if (input.command === "pulse") {
    const limit = getMaxPulseSeconds(input.actuatorId);
    const seconds = pulseSeconds ?? 1;
    if (seconds > limit) {
      return {
        blockedReason: `Pulse duration exceeds ${limit} seconds for ${input.actuatorId}`,
      };
    }
  }

  return null;
}

function buildAuditDetails(input: EnqueueCommandInput, lifecycle: Command["lifecycle"], extra?: Record<string, unknown>) {
  return {
    farmId: input.farmId,
    zoneId: input.zoneId,
    actuatorId: input.actuatorId,
    source: input.source,
    action: input.action,
    command: input.command,
    lifecycle,
    ...extra,
    ...(input.payload ? { payload: input.payload } : {}),
  };
}

export async function enqueueCommand(input: EnqueueCommandInput): Promise<EnqueueCommandResult> {
  const now = new Date();
  const initialCommandId = crypto.randomUUID();
  const initialExecutionId = crypto.randomUUID();
  const validation = validateCommand(input, now) ?? (await findBlockingCommand(input.actuatorId, input.source, now));
  const lifecycle: Command["lifecycle"] = validation?.blockedReason ? "blocked" : "validated";

  const queuedCommand = await prisma.command.create({
    data: {
      id: initialCommandId,
      farmId: input.farmId,
      zoneId: input.zoneId,
      actuatorId: input.actuatorId,
      source: input.source,
      lifecycle: "queued",
      action: input.action,
      payload: input.payload ? toJsonValue(input.payload) : undefined,
      requestedByUserId: input.requestedByUserId,
      requestedByRole: input.requestedByRole,
      createdAt: now,
      updatedAt: now,
    },
  });

  const updatedCommand = await prisma.command.update({
    where: { id: queuedCommand.id },
    data: {
      lifecycle,
      validationMessage: validation?.blockedReason ? validation.blockedReason : "Command validated",
      blockedReason: validation?.blockedReason,
      cooldownUntil: validation?.cooldownUntil,
      updatedAt: now,
    },
  });

  const execution = await prisma.commandExecution.create({
    data: {
      id: initialExecutionId,
      commandId: queuedCommand.id,
      lifecycle,
      validationMessage: validation?.blockedReason ? validation.blockedReason : "Command validated",
      createdAt: now,
      updatedAt: now,
    },
  });

  const auditEvent = {
    id: crypto.randomUUID(),
    actorUserId: input.requestedByUserId,
    role: input.requestedByRole,
    createdAt: now.toISOString(),
    eventType: "command" as const,
    action: lifecycle === "blocked" ? "command-blocked" : "command-validated",
    targetType: "command",
    targetId: queuedCommand.id,
    details: buildAuditDetails(input, lifecycle, {
      commandId: queuedCommand.id,
      validationMessage: validation?.blockedReason ? validation.blockedReason : "Command validated",
      blockedReason: validation?.blockedReason,
      cooldownUntil: validation?.cooldownUntil?.toISOString(),
    }),
  };
  await appendAuditEvent(auditEvent);

  return {
    command: toCommand(updatedCommand),
    execution: toExecution(execution),
    shouldPublish: lifecycle === "validated" && input.source === "manual",
  };
}

export async function listCommands(limit = 25, filters?: { farmId?: string; zoneId?: string; actuatorId?: string; source?: CommandSource; lifecycle?: Command["lifecycle"] }) {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 100));
  const rows = await prisma.command.findMany({
    where: {
      farmId: filters?.farmId,
      zoneId: filters?.zoneId,
      actuatorId: filters?.actuatorId,
      source: filters?.source,
      lifecycle: filters?.lifecycle,
    },
    orderBy: { createdAt: "desc" },
    take: safeLimit,
  });

  return rows.map(toCommand);
}