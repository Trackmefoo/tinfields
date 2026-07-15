import { auth } from "@clerk/nextjs/server";
import { extractRoleFromClaims, hasRequiredRole } from "@/lib/authz";
import { listHeartbeats, upsertHeartbeat } from "@/lib/telemetry-alerts";

const LIMIT_QUERY = "limit";

type HeartbeatPayload = {
  farmId?: string;
  zoneId?: string;
  deviceId: string;
  status?: string;
  metadata?: Record<string, unknown>;
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

function parsePayload(value: unknown): HeartbeatPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const deviceId = value.deviceId;
  if (typeof deviceId !== "string" || deviceId.trim().length < 1) {
    return null;
  }

  return {
    farmId: typeof value.farmId === "string" ? value.farmId.trim() : undefined,
    zoneId: typeof value.zoneId === "string" ? value.zoneId.trim() : undefined,
    deviceId: deviceId.trim(),
    status: typeof value.status === "string" ? value.status.trim() : undefined,
    metadata: isRecord(value.metadata) ? value.metadata : undefined,
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
  const items = await listHeartbeats(limit, url.searchParams.get("farmId")?.trim() || undefined);

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
    return Response.json({ error: "Invalid heartbeat payload" }, { status: 400 });
  }

  const item = await upsertHeartbeat({
    farmId: payload.farmId || process.env.TINFIELDS_DEFAULT_FARM_ID || "demo-farm",
    zoneId: payload.zoneId,
    deviceId: payload.deviceId,
    status: payload.status || "online",
    metadata: payload.metadata,
  });

  return Response.json({ item }, { status: 201 });
}
