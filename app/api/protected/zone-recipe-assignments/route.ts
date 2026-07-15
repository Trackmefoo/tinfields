import { auth } from "@clerk/nextjs/server";
import { extractRoleFromClaims, hasRequiredRole, requireApprovedRole } from "@/lib/authz";
import { assignRecipeToZone, listZoneRecipeAssignments } from "@/lib/zone-recipe-store";

const LIMIT_QUERY = "limit";

type AssignmentPayload = {
  farmId?: string;
  zoneId: string;
  recipeId: string;
  startedAt?: string;
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
  return Math.max(1, Math.min(Math.floor(parsed), 300));
}

function parsePayload(value: unknown): AssignmentPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const zoneId = value.zoneId;
  const recipeId = value.recipeId;
  if (typeof zoneId !== "string" || zoneId.trim().length < 1) {
    return null;
  }
  if (typeof recipeId !== "string" || recipeId.trim().length < 1) {
    return null;
  }

  return {
    farmId: typeof value.farmId === "string" ? value.farmId.trim() : undefined,
    zoneId: zoneId.trim(),
    recipeId: recipeId.trim(),
    startedAt: typeof value.startedAt === "string" ? value.startedAt : undefined,
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
  const items = await listZoneRecipeAssignments(limit, url.searchParams.get("farmId")?.trim() || undefined);
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
    return Response.json({ error: "Invalid zone recipe assignment payload" }, { status: 400 });
  }

  try {
    const item = await assignRecipeToZone(
      {
        farmId: payload.farmId || process.env.TINFIELDS_DEFAULT_FARM_ID || "demo-farm",
        zoneId: payload.zoneId,
        recipeId: payload.recipeId,
        startedAt: payload.startedAt,
        notes: payload.notes,
      },
      {
        userId: session.userId,
        role: requireApprovedRole(role),
      },
    );

    return Response.json({ item }, { status: 201 });
  } catch (error) {
    return Response.json(
      {
        error: error instanceof Error ? error.message : "Unable to assign recipe to zone",
      },
      { status: 400 },
    );
  }
}
