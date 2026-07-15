import { auth } from "@clerk/nextjs/server";
import { enqueueCommand, listCommands } from "@/lib/command-queue";
import { extractRoleFromClaims, hasRequiredRole, requireApprovedRole } from "@/lib/authz";

const LIMIT_QUERY = "limit";

type CommandPayload = {
  farmId?: string;
  zoneId?: string;
  actuatorId: string;
  source: "manual" | "autonomous";
  action: string;
  command: "on" | "off" | "pulse";
  payload?: Record<string, unknown>;
  safetyContext?: {
    lastTelemetryAt?: string;
    manualOverrideLocked?: boolean;
  };
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseLimit(rawLimit: string | null) {
  if (!rawLimit) {
    return 25;
  }

  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) {
    return 25;
  }

  return Math.max(1, Math.min(Math.floor(parsed), 100));
}

function parsePayload(value: unknown): CommandPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const actuatorId = value.actuatorId;
  const action = value.action;
  const command = value.command;
  const farmId = value.farmId;
  const zoneId = value.zoneId;
  const source = value.source;
  const payload = value.payload;
  const safetyContext = value.safetyContext;

  if (typeof actuatorId !== "string" || actuatorId.trim().length < 1) {
    return null;
  }
  if (typeof action !== "string" || action.trim().length < 2) {
    return null;
  }
  if (command !== "on" && command !== "off" && command !== "pulse") {
    return null;
  }
  if (farmId !== undefined && typeof farmId !== "string") {
    return null;
  }
  if (zoneId !== undefined && typeof zoneId !== "string") {
    return null;
  }
  if (source !== undefined && source !== "manual" && source !== "autonomous") {
    return null;
  }
  if (payload !== undefined && (!isRecord(payload) || Array.isArray(payload))) {
    return null;
  }
  if (safetyContext !== undefined && !isRecord(safetyContext)) {
    return null;
  }

  return {
    actuatorId: actuatorId.trim(),
    action: action.trim(),
    command,
    farmId: farmId?.trim(),
    zoneId: zoneId?.trim(),
    source: source ?? "manual",
    payload: payload as Record<string, unknown> | undefined,
    safetyContext:
      safetyContext && isRecord(safetyContext)
        ? {
            lastTelemetryAt:
              typeof safetyContext.lastTelemetryAt === "string"
                ? safetyContext.lastTelemetryAt
                : undefined,
            manualOverrideLocked:
              typeof safetyContext.manualOverrideLocked === "boolean"
                ? safetyContext.manualOverrideLocked
                : undefined,
          }
        : undefined,
  };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = extractRoleFromClaims(session.sessionClaims);
  if (!hasRequiredRole(role, "operator")) {
    return Response.json(
      {
        error: "Forbidden",
        requiredRole: "operator",
        role,
      },
      { status: 403 },
    );
  }

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get(LIMIT_QUERY));

  const items = await listCommands(limit, {
    farmId: url.searchParams.get("farmId")?.trim() || undefined,
    zoneId: url.searchParams.get("zoneId")?.trim() || undefined,
    actuatorId: url.searchParams.get("actuatorId")?.trim() || undefined,
    source:
      url.searchParams.get("source") === "manual" || url.searchParams.get("source") === "autonomous"
        ? (url.searchParams.get("source") as "manual" | "autonomous")
        : undefined,
    lifecycle:
      url.searchParams.get("lifecycle") === "queued" ||
      url.searchParams.get("lifecycle") === "validated" ||
      url.searchParams.get("lifecycle") === "blocked" ||
      url.searchParams.get("lifecycle") === "sent" ||
      url.searchParams.get("lifecycle") === "acked" ||
      url.searchParams.get("lifecycle") === "failed" ||
      url.searchParams.get("lifecycle") === "timed_out"
        ? (url.searchParams.get("lifecycle") as
            | "queued"
            | "validated"
            | "blocked"
            | "sent"
            | "acked"
            | "failed"
            | "timed_out")
        : undefined,
  });

  return Response.json({
    items,
    limit,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = extractRoleFromClaims(session.sessionClaims);
  if (!hasRequiredRole(role, "operator")) {
    return Response.json(
      {
        error: "Forbidden",
        requiredRole: "operator",
        role,
      },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const payload = parsePayload(body);
  if (!payload) {
    return Response.json({ error: "Invalid command payload" }, { status: 400 });
  }

  const result = await enqueueCommand({
    farmId: payload.farmId ?? process.env.TINFIELDS_DEFAULT_FARM_ID ?? "demo-farm",
    zoneId: payload.zoneId,
    actuatorId: payload.actuatorId,
    source: payload.source ?? "manual",
    action: payload.action,
    command: payload.command,
    payload: payload.payload,
    requestedByUserId: session.userId,
    requestedByRole: requireApprovedRole(role),
    safetyContext: payload.safetyContext,
  });

  return Response.json({
    ok: true,
    shouldPublish: result.shouldPublish,
    command: result.command,
    execution: result.execution,
  });
}