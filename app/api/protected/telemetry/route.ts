import { auth } from "@clerk/nextjs/server";
import { extractRoleFromClaims, hasRequiredRole, requireApprovedRole } from "@/lib/authz";
import { ingestTelemetryPoints, listTelemetryPoints } from "@/lib/telemetry-alerts";

const LIMIT_QUERY = "limit";

type TelemetryItemPayload = {
  farmId?: string;
  zoneId: string;
  deviceId?: string;
  sensorType?: string;
  metric: string;
  value: number;
  unit?: string;
  recordedAt?: string;
};

type IngestPayload = {
  points: TelemetryItemPayload[];
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

  return Math.max(1, Math.min(Math.floor(parsed), 500));
}

function parseItem(value: unknown): TelemetryItemPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const zoneId = value.zoneId;
  const metric = value.metric;
  const rawValue = value.value;
  if (typeof zoneId !== "string" || zoneId.trim().length < 1) {
    return null;
  }
  if (typeof metric !== "string" || metric.trim().length < 1) {
    return null;
  }

  const numericValue = typeof rawValue === "number" ? rawValue : Number(rawValue);
  if (!Number.isFinite(numericValue)) {
    return null;
  }

  return {
    farmId: typeof value.farmId === "string" ? value.farmId.trim() : undefined,
    zoneId: zoneId.trim(),
    deviceId: typeof value.deviceId === "string" ? value.deviceId.trim() : undefined,
    sensorType: typeof value.sensorType === "string" ? value.sensorType.trim() : undefined,
    metric: metric.trim(),
    value: numericValue,
    unit: typeof value.unit === "string" ? value.unit.trim() : undefined,
    recordedAt: typeof value.recordedAt === "string" ? value.recordedAt : undefined,
  };
}

function parsePayload(value: unknown): IngestPayload | null {
  if (!isRecord(value) || !Array.isArray(value.points)) {
    return null;
  }

  const points = value.points.map(parseItem).filter((item): item is TelemetryItemPayload => !!item);
  if (points.length === 0) {
    return null;
  }

  return { points };
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
  const items = await listTelemetryPoints(limit, {
    farmId: url.searchParams.get("farmId")?.trim() || undefined,
    zoneId: url.searchParams.get("zoneId")?.trim() || undefined,
    metric: url.searchParams.get("metric")?.trim() || undefined,
  });

  return Response.json({ items, limit });
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
    return Response.json({ error: "Invalid telemetry payload" }, { status: 400 });
  }

  const farmId = process.env.TINFIELDS_DEFAULT_FARM_ID ?? "demo-farm";
  const result = await ingestTelemetryPoints(
    payload.points.map((item) => ({
      ...item,
      farmId: item.farmId || farmId,
    })),
    {
      userId: session.userId,
      role: requireApprovedRole(role),
    },
  );

  return Response.json(
    {
      items: result.items,
      triggeredEvents: result.triggeredEvents,
      count: result.items.length,
    },
    { status: 201 },
  );
}
