import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { appendAuditEvent } from "@/lib/audit-store";
import { extractRoleFromClaims, hasRequiredRole, requireApprovedRole } from "@/lib/authz";
import type { CropCatalogItem, StoredAuditEvent } from "@/types";

const LIMIT_QUERY = "limit";

type CropCatalogPayload = {
  cropName: string;
  cultivar?: string;
  seedSupplier?: string;
  seedLotCode?: string;
  targetCycleDays?: number;
  notes?: string;
};

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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function toOptionalString(value: unknown) {
  if (value === undefined) {
    return undefined;
  }
  if (typeof value !== "string") {
    return null;
  }
  const trimmed = value.trim();
  return trimmed || undefined;
}

function parsePayload(value: unknown): CropCatalogPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const cropName = value.cropName;
  if (typeof cropName !== "string" || cropName.trim().length < 2) {
    return null;
  }

  const cultivar = toOptionalString(value.cultivar);
  const seedSupplier = toOptionalString(value.seedSupplier);
  const seedLotCode = toOptionalString(value.seedLotCode);
  const notes = toOptionalString(value.notes);

  if (cultivar === null || seedSupplier === null || seedLotCode === null || notes === null) {
    return null;
  }

  const targetCycleDaysRaw = value.targetCycleDays;
  let targetCycleDays: number | undefined;
  if (targetCycleDaysRaw !== undefined) {
    if (typeof targetCycleDaysRaw !== "number" || targetCycleDaysRaw < 1 || targetCycleDaysRaw > 1000) {
      return null;
    }
    targetCycleDays = Math.floor(targetCycleDaysRaw);
  }

  return {
    cropName: cropName.trim(),
    cultivar,
    seedSupplier,
    seedLotCode,
    targetCycleDays,
    notes,
  };
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

  const rows = await prisma.cropCatalogItem.findMany({
    orderBy: { createdAt: "desc" },
    take: limit,
  });

  return Response.json({
    items: rows.map((row) => toCropCatalogItem(row)),
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

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const payload = parsePayload(body);
  if (!payload) {
    return Response.json({ error: "Invalid crop catalog payload" }, { status: 400 });
  }

  const now = new Date();
  const item = await prisma.cropCatalogItem.create({
    data: {
      id: crypto.randomUUID(),
      cropName: payload.cropName,
      cultivar: payload.cultivar,
      seedSupplier: payload.seedSupplier,
      seedLotCode: payload.seedLotCode,
      targetCycleDays: payload.targetCycleDays ?? null,
      notes: payload.notes,
      createdAt: now,
      updatedAt: now,
    },
  });

  const auditEvent: StoredAuditEvent = {
    id: crypto.randomUUID(),
    actorUserId: session.userId,
    role: requireApprovedRole(role),
    createdAt: now.toISOString(),
    eventType: "planting",
    action: "create-crop-catalog-item",
    targetType: "crop_catalog_item",
    targetId: item.id,
    details: {
      cropName: item.cropName,
      cultivar: item.cultivar,
    },
  };
  await appendAuditEvent(auditEvent);

  return Response.json({ item: toCropCatalogItem(item) }, { status: 201 });
}
