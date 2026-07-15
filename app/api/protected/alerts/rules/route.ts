import { auth } from "@clerk/nextjs/server";
import { extractRoleFromClaims, hasRequiredRole } from "@/lib/authz";
import { createAlertRule, listAlertRules } from "@/lib/telemetry-alerts";

const LIMIT_QUERY = "limit";

type RulePayload = {
  farmId?: string;
  zoneId?: string;
  metric: string;
  comparison: "gt" | "gte" | "lt" | "lte";
  threshold: number;
  durationSeconds?: number;
  severity: "info" | "warning" | "critical";
  enabled?: boolean;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseLimit(rawLimit: string | null) {
  if (!rawLimit) {
    return 100;
  }
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) {
    return 100;
  }
  return Math.max(1, Math.min(Math.floor(parsed), 250));
}

function parsePayload(value: unknown): RulePayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const metric = value.metric;
  const comparison = value.comparison;
  const rawThreshold = value.threshold;
  const severity = value.severity;
  const rawDurationSeconds = value.durationSeconds;

  if (typeof metric !== "string" || metric.trim().length < 1) {
    return null;
  }
  if (comparison !== "gt" && comparison !== "gte" && comparison !== "lt" && comparison !== "lte") {
    return null;
  }
  const threshold = typeof rawThreshold === "number" ? rawThreshold : Number(rawThreshold);
  if (!Number.isFinite(threshold)) {
    return null;
  }
  if (severity !== "info" && severity !== "warning" && severity !== "critical") {
    return null;
  }

  const durationSeconds =
    rawDurationSeconds === undefined ? undefined : Number(rawDurationSeconds);
  if (durationSeconds !== undefined && (!Number.isFinite(durationSeconds) || durationSeconds < 0)) {
    return null;
  }

  return {
    farmId: typeof value.farmId === "string" ? value.farmId.trim() : undefined,
    zoneId: typeof value.zoneId === "string" ? value.zoneId.trim() : undefined,
    metric: metric.trim(),
    comparison,
    threshold,
    durationSeconds,
    severity,
    enabled: typeof value.enabled === "boolean" ? value.enabled : undefined,
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
  const enabledParam = url.searchParams.get("enabled");

  const items = await listAlertRules(limit, {
    farmId: url.searchParams.get("farmId")?.trim() || undefined,
    zoneId: url.searchParams.get("zoneId")?.trim() || undefined,
    enabled: enabledParam === null ? undefined : enabledParam === "true",
  });

  return Response.json({ items, limit });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = extractRoleFromClaims(session.sessionClaims);
  if (!hasRequiredRole(role, "grow_manager")) {
    return Response.json(
      {
        error: "Forbidden",
        requiredRole: "grow_manager",
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
    return Response.json({ error: "Invalid alert rule payload" }, { status: 400 });
  }

  const item = await createAlertRule({
    farmId: payload.farmId || process.env.TINFIELDS_DEFAULT_FARM_ID || "demo-farm",
    zoneId: payload.zoneId,
    metric: payload.metric,
    comparison: payload.comparison,
    threshold: payload.threshold,
    durationSeconds: payload.durationSeconds,
    severity: payload.severity,
    enabled: payload.enabled,
    createdByUserId: session.userId,
  });

  return Response.json({ item }, { status: 201 });
}
