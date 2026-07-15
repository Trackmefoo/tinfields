import { auth } from "@clerk/nextjs/server";
import { appendAuditEvent } from "@/lib/audit-store";
import { extractRoleFromClaims, hasRequiredRole, requireApprovedRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import type { CropCatalogItem, StoredAuditEvent } from "@/types";

type CropCatalogPatchPayload = {
  cropName?: string;
  cultivar?: string | null;
  seedSupplier?: string | null;
  seedLotCode?: string | null;
  targetCycleDays?: number | null;
  notes?: string | null;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toOptionalNullableString(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }

  const trimmed = value.trim();
  return trimmed || null;
}

function parsePayload(value: unknown): CropCatalogPatchPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const payload: CropCatalogPatchPayload = {};

  if (value.cropName !== undefined) {
    if (typeof value.cropName !== "string" || value.cropName.trim().length < 2) {
      return null;
    }
    payload.cropName = value.cropName.trim();
  }

  if (value.cultivar !== undefined) {
    const parsed = toOptionalNullableString(value.cultivar);
    if (parsed === undefined) {
      return null;
    }
    payload.cultivar = parsed;
  }

  if (value.seedSupplier !== undefined) {
    const parsed = toOptionalNullableString(value.seedSupplier);
    if (parsed === undefined) {
      return null;
    }
    payload.seedSupplier = parsed;
  }

  if (value.seedLotCode !== undefined) {
    const parsed = toOptionalNullableString(value.seedLotCode);
    if (parsed === undefined) {
      return null;
    }
    payload.seedLotCode = parsed;
  }

  if (value.notes !== undefined) {
    const parsed = toOptionalNullableString(value.notes);
    if (parsed === undefined) {
      return null;
    }
    payload.notes = parsed;
  }

  if (value.targetCycleDays !== undefined) {
    if (value.targetCycleDays === null) {
      payload.targetCycleDays = null;
    } else if (
      typeof value.targetCycleDays === "number" &&
      Number.isFinite(value.targetCycleDays) &&
      value.targetCycleDays >= 1 &&
      value.targetCycleDays <= 1000
    ) {
      payload.targetCycleDays = Math.floor(value.targetCycleDays);
    } else {
      return null;
    }
  }

  if (Object.keys(payload).length === 0) {
    return null;
  }

  return payload;
}

function toCropCatalogItem(row: {
  id: string;
  cropName: string;
  cultivar: string | null;
  seedSupplier: string | null;
  seedLotCode: string | null;
  targetCycleDays: number | null;
  notes: string | null;
  createdAt: Date;
  updatedAt: Date;
}): CropCatalogItem {
  return {
    id: row.id,
    cropName: row.cropName,
    cultivar: row.cultivar ?? undefined,
    seedSupplier: row.seedSupplier ?? undefined,
    seedLotCode: row.seedLotCode ?? undefined,
    targetCycleDays: row.targetCycleDays ?? undefined,
    notes: row.notes ?? undefined,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
  };
}

export async function PATCH(
  request: Request,
  context: { params: Promise<{ itemId: string }> },
) {
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

  const { itemId } = await context.params;
  if (!itemId?.trim()) {
    return Response.json({ error: "Invalid itemId" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const payload = parsePayload(body);
  if (!payload) {
    return Response.json({ error: "Invalid crop catalog patch payload" }, { status: 400 });
  }

  const existing = await prisma.cropCatalogItem.findUnique({ where: { id: itemId } });
  if (!existing) {
    return Response.json({ error: "Crop catalog item not found" }, { status: 404 });
  }

  const updated = await prisma.cropCatalogItem.update({
    where: { id: itemId },
    data: {
      ...payload,
      updatedAt: new Date(),
    },
  });

  const nowIso = new Date().toISOString();
  const auditEvent: StoredAuditEvent = {
    id: crypto.randomUUID(),
    actorUserId: session.userId,
    role: requireApprovedRole(role),
    createdAt: nowIso,
    eventType: "planting",
    action: "update-crop-catalog-item",
    targetType: "crop_catalog_item",
    targetId: updated.id,
    details: {
      cropName: updated.cropName,
      cultivar: updated.cultivar,
      changedFields: Object.keys(payload),
    },
  };
  await appendAuditEvent(auditEvent);

  return Response.json({ item: toCropCatalogItem(updated) });
}
