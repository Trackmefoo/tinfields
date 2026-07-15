import { auth } from "@clerk/nextjs/server";
import { extractRoleFromClaims, hasRequiredRole, requireApprovedRole } from "@/lib/authz";
import { createZone, listZones, type ZoneTypeValue } from "@/lib/zone-recipe-store";

const LIMIT_QUERY = "limit";

type ZonePayload = {
  farmId?: string;
  name: string;
  zoneType: ZoneTypeValue;
  memberIds?: string[];
  actuatorGroup?: string;
  notes?: string;
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

function parseZoneType(value: unknown): ZoneTypeValue | null {
  if (value === "tier-as-zone" || value === "column-as-zone" || value === "custom") {
    return value;
  }
  return null;
}

function parsePayload(value: unknown): ZonePayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = value.name;
  const zoneType = parseZoneType(value.zoneType);
  if (typeof name !== "string" || name.trim().length < 2 || !zoneType) {
    return null;
  }

  const memberIds = Array.isArray(value.memberIds)
    ? value.memberIds.filter((item) => typeof item === "string" && item.trim().length > 0)
    : [];

  return {
    farmId: typeof value.farmId === "string" ? value.farmId.trim() : undefined,
    name: name.trim(),
    zoneType,
    memberIds,
    actuatorGroup:
      typeof value.actuatorGroup === "string" ? value.actuatorGroup.trim() || undefined : undefined,
    notes: typeof value.notes === "string" ? value.notes.trim() || undefined : undefined,
  };
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = extractRoleFromClaims(session.sessionClaims);
  if (!hasRequiredRole(role, "operator")) {
    return Response.json({ error: "Forbidden", requiredRole: "operator", role }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get(LIMIT_QUERY));
  const items = await listZones(limit, url.searchParams.get("farmId")?.trim() || undefined);
  return Response.json({ items, limit });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = extractRoleFromClaims(session.sessionClaims);
  if (!hasRequiredRole(role, "grow_manager")) {
    return Response.json({ error: "Forbidden", requiredRole: "grow_manager", role }, { status: 403 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const payload = parsePayload(body);
  if (!payload) {
    return Response.json({ error: "Invalid zone payload" }, { status: 400 });
  }

  const item = await createZone(
    {
      farmId: payload.farmId || process.env.TINFIELDS_DEFAULT_FARM_ID || "demo-farm",
      name: payload.name,
      zoneType: payload.zoneType,
      memberIds: payload.memberIds ?? [],
      actuatorGroup: payload.actuatorGroup,
      notes: payload.notes,
    },
    {
      userId: session.userId,
      role: requireApprovedRole(role),
    },
  );

  return Response.json({ item }, { status: 201 });
}
