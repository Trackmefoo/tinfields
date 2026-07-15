import { auth } from "@clerk/nextjs/server";
import { appendAuditEvent } from "@/lib/audit-store";
import { prisma } from "@/lib/prisma";
import {
  addPlantingBatch,
  getPlantingBatchByCode,
  listPlantingBatches,
} from "@/lib/crop-store";
import { extractRoleFromClaims, hasRequiredRole } from "@/lib/authz";
import type { PlantingBatch, StoredAuditEvent } from "@/types";

const LIMIT_QUERY = "limit";

type PlantingPayload = {
  cropCatalogId?: string;
  cropName: string;
  cultivar?: string;
  batchCode: string;
  zoneId: string;
  expectedHarvestStartAt?: string;
  expectedHarvestEndAt?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parseLimit(rawLimit: string | null) {
  if (!rawLimit) {
    return 50;
  }
  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) {
    return 50;
  }
  return Math.max(1, Math.min(Math.floor(parsed), 200));
}

function parseIsoDate(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return null;
  }
  return date.toISOString();
}

function parsePayload(value: unknown): PlantingPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const cropName = value.cropName;
  const cropCatalogId = value.cropCatalogId;
  const cultivar = value.cultivar;
  const batchCode = value.batchCode;
  const zoneId = value.zoneId;

  if (typeof cropName !== "string" || cropName.trim().length < 2) {
    return null;
  }
  if (cropCatalogId !== undefined && typeof cropCatalogId !== "string") {
    return null;
  }
  if (cultivar !== undefined && typeof cultivar !== "string") {
    return null;
  }
  if (typeof batchCode !== "string" || batchCode.trim().length < 2) {
    return null;
  }
  if (typeof zoneId !== "string" || zoneId.trim().length < 1) {
    return null;
  }

  const expectedHarvestStartAt = parseIsoDate(value.expectedHarvestStartAt);
  const expectedHarvestEndAt = parseIsoDate(value.expectedHarvestEndAt);

  if (expectedHarvestStartAt === null || expectedHarvestEndAt === null) {
    return null;
  }

  return {
    cropCatalogId: cropCatalogId?.trim() || undefined,
    cropName: cropName.trim(),
    cultivar: cultivar?.trim() || undefined,
    batchCode: batchCode.trim(),
    zoneId: zoneId.trim(),
    expectedHarvestStartAt,
    expectedHarvestEndAt,
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
  return Response.json({
    items: await listPlantingBatches(limit),
    limit,
  });
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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const payload = parsePayload(rawBody);
  if (!payload) {
    return Response.json({ error: "Invalid planting payload" }, { status: 400 });
  }

  if (await getPlantingBatchByCode(payload.batchCode)) {
    return Response.json(
      { error: "batchCode already exists" },
      { status: 409 },
    );
  }

  if (payload.cropCatalogId) {
    const catalogItem = await prisma.cropCatalogItem.findUnique({
      where: { id: payload.cropCatalogId },
      select: { id: true },
    });

    if (!catalogItem) {
      return Response.json(
        { error: "cropCatalogId was provided but no catalog item exists" },
        { status: 400 },
      );
    }
  }

  const nowIso = new Date().toISOString();
  const batch: PlantingBatch = {
    id: crypto.randomUUID(),
    cropCatalogId: payload.cropCatalogId,
    cropName: payload.cropName,
    cultivar: payload.cultivar,
    batchCode: payload.batchCode,
    zoneId: payload.zoneId,
    plantedAt: nowIso,
    expectedHarvestStartAt: payload.expectedHarvestStartAt,
    expectedHarvestEndAt: payload.expectedHarvestEndAt,
    status: "active",
    startedByUserId: session.userId,
    createdAt: nowIso,
    updatedAt: nowIso,
  };

  const stored = await addPlantingBatch(batch);

  const auditEvent: StoredAuditEvent = {
    id: crypto.randomUUID(),
    actorUserId: session.userId,
    role,
    createdAt: nowIso,
    eventType: "planting",
    action: "create-planting-batch",
    targetType: "planting_batch",
    targetId: stored.id,
    details: {
      cropCatalogId: stored.cropCatalogId,
      cropName: stored.cropName,
      cultivar: stored.cultivar,
      batchCode: stored.batchCode,
      zoneId: stored.zoneId,
    },
  };
  await appendAuditEvent(auditEvent);

  return Response.json({ item: stored }, { status: 201 });
}
