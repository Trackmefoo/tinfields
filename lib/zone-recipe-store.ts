import { Prisma } from "@prisma/client";
import { appendAuditEvent } from "@/lib/audit-store";
import type { ApprovedRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";

export type ZoneTypeValue = "tier-as-zone" | "column-as-zone" | "custom";

export type ZoneItem = {
  id: string;
  farmId: string;
  name: string;
  zoneType: ZoneTypeValue;
  memberIds: string[];
  actuatorGroup?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

export type RecipePhaseItem = {
  id: string;
  recipeId: string;
  name: string;
  order: number;
  durationDays?: number;
  setpoints: Record<string, number>;
};

export type RecipeItem = {
  id: string;
  farmId: string;
  name: string;
  cropName?: string;
  topologyMode: ZoneTypeValue;
  notes?: string;
  createdByUserId: string;
  createdAt: string;
  updatedAt: string;
  phases: RecipePhaseItem[];
};

export type ZoneRecipeAssignmentItem = {
  id: string;
  farmId: string;
  zoneId: string;
  recipeId: string;
  status: "active" | "completed" | "cancelled";
  startedAt: string;
  endedAt?: string;
  notes?: string;
  createdAt: string;
  updatedAt: string;
};

type Actor = {
  userId: string;
  role: ApprovedRole;
};

type RecipePhaseInput = {
  name: string;
  order: number;
  durationDays?: number;
  setpoints: Record<string, number>;
};

function toZoneTypeDb(value: ZoneTypeValue) {
  switch (value) {
    case "tier-as-zone":
      return "tier_as_zone" as const;
    case "column-as-zone":
      return "column_as_zone" as const;
    case "custom":
    default:
      return "custom" as const;
  }
}

function fromZoneTypeDb(value: string): ZoneTypeValue {
  if (value === "tier_as_zone") {
    return "tier-as-zone";
  }
  if (value === "column_as_zone") {
    return "column-as-zone";
  }
  return "custom";
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toInputJsonValue(value: Record<string, unknown> | string[] | undefined) {
  if (!value) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

function toStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) {
    return [];
  }

  return value.filter((item) => typeof item === "string" && item.trim().length > 0);
}

function toSetpoints(value: unknown): Record<string, number> {
  if (!isRecord(value)) {
    return {};
  }

  const entries = Object.entries(value)
    .map(([key, raw]) => {
      const num = typeof raw === "number" ? raw : Number(raw);
      if (!Number.isFinite(num)) {
        return null;
      }
      return [key, num] as const;
    })
    .filter((entry): entry is readonly [string, number] => !!entry);

  return Object.fromEntries(entries);
}

function toZoneItem(row: {
  id: string;
  farmId: string;
  name: string;
  zoneType: string;
  memberIds: unknown;
  actuatorGroup: string | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ZoneItem {
  return {
    id: row.id,
    farmId: row.farmId,
    name: row.name,
    zoneType: fromZoneTypeDb(row.zoneType),
    memberIds: toStringArray(row.memberIds),
    actuatorGroup: row.actuatorGroup ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

function toRecipePhaseItem(row: {
  id: string;
  recipeId: string;
  name: string;
  phaseOrder: number;
  durationDays: number | null;
  setpoints: unknown;
}): RecipePhaseItem {
  return {
    id: row.id,
    recipeId: row.recipeId,
    name: row.name,
    order: row.phaseOrder,
    durationDays: row.durationDays ?? undefined,
    setpoints: toSetpoints(row.setpoints),
  };
}

function toRecipeItem(row: {
  id: string;
  farmId: string;
  name: string;
  cropName: string | null;
  topologyMode: string;
  notes: string | null;
  createdByUserId: string;
  createdAt: Date;
  updatedAt: Date;
  phases: Array<{
    id: string;
    recipeId: string;
    name: string;
    phaseOrder: number;
    durationDays: number | null;
    setpoints: unknown;
  }>;
}): RecipeItem {
  return {
    id: row.id,
    farmId: row.farmId,
    name: row.name,
    cropName: row.cropName ?? undefined,
    topologyMode: fromZoneTypeDb(row.topologyMode),
    notes: row.notes ?? undefined,
    createdByUserId: row.createdByUserId,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    phases: row.phases.sort((a, b) => a.phaseOrder - b.phaseOrder).map((phase) => toRecipePhaseItem(phase)),
  };
}

function toAssignmentItem(row: {
  id: string;
  farmId: string;
  zoneId: string;
  recipeId: string;
  status: "active" | "completed" | "cancelled";
  startedAt: Date;
  endedAt: Date | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): ZoneRecipeAssignmentItem {
  return {
    id: row.id,
    farmId: row.farmId,
    zoneId: row.zoneId,
    recipeId: row.recipeId,
    status: row.status,
    startedAt: row.startedAt.toISOString(),
    endedAt: row.endedAt?.toISOString(),
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function listZones(limit = 100, farmId?: string) {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 250));
  const rows = await prisma.zone.findMany({
    where: {
      farmId,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: safeLimit,
  });

  return rows.map((row) => toZoneItem(row));
}

export async function createZone(
  input: {
    farmId: string;
    name: string;
    zoneType: ZoneTypeValue;
    memberIds: string[];
    actuatorGroup?: string;
    notes?: string;
  },
  actor: Actor,
) {
  const now = new Date();
  const row = await prisma.zone.create({
    data: {
      id: crypto.randomUUID(),
      farmId: input.farmId,
      name: input.name,
      zoneType: toZoneTypeDb(input.zoneType),
      memberIds: (toInputJsonValue(input.memberIds) ?? JSON.parse("[]")) as Prisma.InputJsonValue,
      actuatorGroup: input.actuatorGroup,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    },
  });

  await appendAuditEvent({
    id: crypto.randomUUID(),
    actorUserId: actor.userId,
    role: actor.role,
    createdAt: now.toISOString(),
    eventType: "planting",
    action: "create-zone",
    targetType: "zone",
    targetId: row.id,
    details: {
      zoneType: row.zoneType,
      actuatorGroup: row.actuatorGroup,
      memberCount: input.memberIds.length,
    },
  });

  return toZoneItem(row);
}

export async function listRecipes(limit = 100, farmId?: string) {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 200));
  const rows = await prisma.recipeDefinition.findMany({
    where: {
      farmId,
    },
    include: {
      phases: true,
    },
    orderBy: {
      createdAt: "desc",
    },
    take: safeLimit,
  });

  return rows.map((row) => toRecipeItem(row));
}

export async function createRecipe(
  input: {
    farmId: string;
    name: string;
    cropName?: string;
    topologyMode: ZoneTypeValue;
    notes?: string;
    phases: RecipePhaseInput[];
  },
  actor: Actor,
) {
  const now = new Date();

  const recipeId = crypto.randomUUID();
  await prisma.recipeDefinition.create({
    data: {
      id: recipeId,
      farmId: input.farmId,
      name: input.name,
      cropName: input.cropName,
      topologyMode: toZoneTypeDb(input.topologyMode),
      notes: input.notes,
      createdByUserId: actor.userId,
      createdAt: now,
      updatedAt: now,
      phases: {
        create: input.phases.map((phase) => ({
          id: crypto.randomUUID(),
          name: phase.name,
          phaseOrder: phase.order,
          durationDays: phase.durationDays ?? null,
          setpoints: (toInputJsonValue(phase.setpoints) ?? JSON.parse("{}")) as Prisma.InputJsonValue,
          createdAt: now,
          updatedAt: now,
        })),
      },
    },
  });

  const created = await prisma.recipeDefinition.findUniqueOrThrow({
    where: { id: recipeId },
    include: { phases: true },
  });

  await appendAuditEvent({
    id: crypto.randomUUID(),
    actorUserId: actor.userId,
    role: actor.role,
    createdAt: now.toISOString(),
    eventType: "planting",
    action: "create-recipe",
    targetType: "recipe",
    targetId: recipeId,
    details: {
      topologyMode: created.topologyMode,
      phaseCount: created.phases.length,
    },
  });

  return toRecipeItem(created);
}

async function ensureAssignmentNoConflict(input: { farmId: string; zoneId: string; recipeId: string }) {
  const zone = await prisma.zone.findUnique({ where: { id: input.zoneId } });
  if (!zone) {
    throw new Error("Zone not found");
  }

  const recipe = await prisma.recipeDefinition.findUnique({ where: { id: input.recipeId } });
  if (!recipe) {
    throw new Error("Recipe not found");
  }

  if (zone.farmId !== input.farmId || recipe.farmId !== input.farmId) {
    throw new Error("Zone and recipe must belong to the same farm");
  }

  const activeForZone = await prisma.zoneRecipeAssignment.findFirst({
    where: {
      zoneId: input.zoneId,
      status: "active",
      endedAt: null,
    },
  });
  if (activeForZone) {
    throw new Error("Zone already has an active recipe assignment");
  }

  if (zone.actuatorGroup) {
    const conflictingAssignments = await prisma.zoneRecipeAssignment.findMany({
      where: {
        status: "active",
        endedAt: null,
        zone: {
          actuatorGroup: zone.actuatorGroup,
        },
      },
      include: {
        zone: true,
      },
    });

    if (conflictingAssignments.length > 0) {
      const otherZones = conflictingAssignments.map((assignment) => assignment.zone.name).join(", ");
      throw new Error(`Shared actuator conflict with active zones: ${otherZones}`);
    }
  }
}

export async function listZoneRecipeAssignments(limit = 150, farmId?: string) {
  const safeLimit = Math.max(1, Math.min(Math.floor(limit), 300));
  const rows = await prisma.zoneRecipeAssignment.findMany({
    where: {
      farmId,
    },
    orderBy: {
      startedAt: "desc",
    },
    take: safeLimit,
  });

  return rows.map((row) => toAssignmentItem(row));
}

export async function assignRecipeToZone(
  input: {
    farmId: string;
    zoneId: string;
    recipeId: string;
    startedAt?: string;
    notes?: string;
  },
  actor: Actor,
) {
  await ensureAssignmentNoConflict({
    farmId: input.farmId,
    zoneId: input.zoneId,
    recipeId: input.recipeId,
  });

  const now = new Date();
  const startedAt = input.startedAt ? new Date(input.startedAt) : now;
  const safeStartedAt = Number.isNaN(startedAt.getTime()) ? now : startedAt;

  const row = await prisma.zoneRecipeAssignment.create({
    data: {
      id: crypto.randomUUID(),
      farmId: input.farmId,
      zoneId: input.zoneId,
      recipeId: input.recipeId,
      status: "active",
      startedAt: safeStartedAt,
      notes: input.notes,
      createdAt: now,
      updatedAt: now,
    },
  });

  await appendAuditEvent({
    id: crypto.randomUUID(),
    actorUserId: actor.userId,
    role: actor.role,
    createdAt: now.toISOString(),
    eventType: "planting",
    action: "assign-zone-recipe",
    targetType: "zone_recipe_assignment",
    targetId: row.id,
    details: {
      farmId: row.farmId,
      zoneId: row.zoneId,
      recipeId: row.recipeId,
      startedAt: row.startedAt.toISOString(),
    },
  });

  return toAssignmentItem(row);
}

export async function closeZoneRecipeAssignment(
  assignmentId: string,
  actor: Actor,
  input?: { endedAt?: string; status?: "completed" | "cancelled"; notes?: string },
) {
  const now = new Date();
  const endedAt = input?.endedAt ? new Date(input.endedAt) : now;
  const safeEndedAt = Number.isNaN(endedAt.getTime()) ? now : endedAt;
  const status = input?.status ?? "completed";

  const row = await prisma.zoneRecipeAssignment.update({
    where: { id: assignmentId },
    data: {
      status,
      endedAt: safeEndedAt,
      notes: input?.notes,
      updatedAt: now,
    },
  });

  await appendAuditEvent({
    id: crypto.randomUUID(),
    actorUserId: actor.userId,
    role: actor.role,
    createdAt: now.toISOString(),
    eventType: "planting",
    action: "close-zone-recipe-assignment",
    targetType: "zone_recipe_assignment",
    targetId: row.id,
    details: {
      status: row.status,
      endedAt: row.endedAt?.toISOString(),
    },
  });

  return toAssignmentItem(row);
}
