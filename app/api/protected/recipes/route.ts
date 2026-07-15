import { auth } from "@clerk/nextjs/server";
import { extractRoleFromClaims, hasRequiredRole, requireApprovedRole } from "@/lib/authz";
import { createRecipe, listRecipes, type ZoneTypeValue } from "@/lib/zone-recipe-store";

const LIMIT_QUERY = "limit";

type RecipePhasePayload = {
  name: string;
  order: number;
  durationDays?: number;
  setpoints: Record<string, number>;
};

type RecipePayload = {
  farmId?: string;
  name: string;
  cropName?: string;
  topologyMode: ZoneTypeValue;
  notes?: string;
  phases: RecipePhasePayload[];
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
  return Math.max(1, Math.min(Math.floor(parsed), 200));
}

function parseZoneType(value: unknown): ZoneTypeValue | null {
  if (value === "tier-as-zone" || value === "column-as-zone" || value === "custom") {
    return value;
  }
  return null;
}

function parseSetpoints(value: unknown) {
  if (!isRecord(value)) {
    return null;
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

function parsePhase(value: unknown): RecipePhasePayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = value.name;
  const orderRaw = value.order;
  const setpoints = parseSetpoints(value.setpoints);
  if (typeof name !== "string" || name.trim().length < 1 || setpoints === null) {
    return null;
  }

  const order = typeof orderRaw === "number" ? orderRaw : Number(orderRaw);
  if (!Number.isFinite(order)) {
    return null;
  }

  const durationDaysRaw = value.durationDays;
  const durationDays =
    durationDaysRaw === undefined ? undefined : typeof durationDaysRaw === "number" ? durationDaysRaw : Number(durationDaysRaw);
  if (durationDays !== undefined && (!Number.isFinite(durationDays) || durationDays < 1)) {
    return null;
  }

  return {
    name: name.trim(),
    order: Math.floor(order),
    durationDays: durationDays === undefined ? undefined : Math.floor(durationDays),
    setpoints,
  };
}

function parsePayload(value: unknown): RecipePayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const name = value.name;
  const topologyMode = parseZoneType(value.topologyMode);
  if (typeof name !== "string" || name.trim().length < 2 || !topologyMode) {
    return null;
  }

  if (!Array.isArray(value.phases) || value.phases.length === 0) {
    return null;
  }

  const phases = value.phases.map(parsePhase).filter((phase): phase is RecipePhasePayload => !!phase);
  if (phases.length === 0) {
    return null;
  }

  return {
    farmId: typeof value.farmId === "string" ? value.farmId.trim() : undefined,
    name: name.trim(),
    cropName: typeof value.cropName === "string" ? value.cropName.trim() || undefined : undefined,
    topologyMode,
    notes: typeof value.notes === "string" ? value.notes.trim() || undefined : undefined,
    phases,
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
  const items = await listRecipes(limit, url.searchParams.get("farmId")?.trim() || undefined);
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
    return Response.json({ error: "Invalid recipe payload" }, { status: 400 });
  }

  const item = await createRecipe(
    {
      farmId: payload.farmId || process.env.TINFIELDS_DEFAULT_FARM_ID || "demo-farm",
      name: payload.name,
      cropName: payload.cropName,
      topologyMode: payload.topologyMode,
      notes: payload.notes,
      phases: payload.phases,
    },
    {
      userId: session.userId,
      role: requireApprovedRole(role),
    },
  );

  return Response.json({ item }, { status: 201 });
}
