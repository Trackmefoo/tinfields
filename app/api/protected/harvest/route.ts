import { auth } from "@clerk/nextjs/server";
import { appendAuditEvent } from "@/lib/audit-store";
import {
  addHarvestRecord,
  getPlantingBatchById,
  listHarvestRecords,
  markBatchHarvested,
} from "@/lib/crop-store";
import { extractRoleFromClaims, hasRequiredRole } from "@/lib/authz";
import type { HarvestRecord, QualityGrade, StoredAuditEvent } from "@/types";

const LIMIT_QUERY = "limit";

type HarvestPayload = {
  batchId: string;
  zoneId: string;
  usableWeightKg: number;
  rejectWeightKg?: number;
  wetWeightKg?: number;
  dryWeightKg?: number;
  qualityGrade?: QualityGrade;
  defectNotes?: string;
  finalized?: boolean;
  notes?: string;
  markBatchComplete?: boolean;
};

function isQualityGrade(value: unknown): value is QualityGrade {
  return value === "A" || value === "B" || value === "C" || value === "reject";
}

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

function parsePayload(value: unknown): HarvestPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const batchId = value.batchId;
  const zoneId = value.zoneId;
  const usableWeightKg = value.usableWeightKg;
  const rejectWeightKg = value.rejectWeightKg;
  const wetWeightKg = value.wetWeightKg;
  const dryWeightKg = value.dryWeightKg;
  const qualityGrade = value.qualityGrade;
  const defectNotes = value.defectNotes;
  const finalized = value.finalized;
  const notes = value.notes;
  const markBatchComplete = value.markBatchComplete;

  if (typeof batchId !== "string" || batchId.trim().length < 1) {
    return null;
  }
  if (typeof zoneId !== "string" || zoneId.trim().length < 1) {
    return null;
  }
  if (typeof usableWeightKg !== "number" || usableWeightKg < 0) {
    return null;
  }
  if (rejectWeightKg !== undefined && (typeof rejectWeightKg !== "number" || rejectWeightKg < 0)) {
    return null;
  }
  if (wetWeightKg !== undefined && (typeof wetWeightKg !== "number" || wetWeightKg < 0)) {
    return null;
  }
  if (dryWeightKg !== undefined && (typeof dryWeightKg !== "number" || dryWeightKg < 0)) {
    return null;
  }
  if (qualityGrade !== undefined && !isQualityGrade(qualityGrade)) {
    return null;
  }
  if (defectNotes !== undefined && typeof defectNotes !== "string") {
    return null;
  }
  if (finalized !== undefined && typeof finalized !== "boolean") {
    return null;
  }
  if (notes !== undefined && typeof notes !== "string") {
    return null;
  }
  if (markBatchComplete !== undefined && typeof markBatchComplete !== "boolean") {
    return null;
  }

  return {
    batchId: batchId.trim(),
    zoneId: zoneId.trim(),
    usableWeightKg,
    rejectWeightKg,
    wetWeightKg,
    dryWeightKg,
    qualityGrade,
    defectNotes: defectNotes?.trim() || undefined,
    finalized,
    notes: notes?.trim() || undefined,
    markBatchComplete,
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
    items: await listHarvestRecords(limit),
    limit,
  });
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

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const payload = parsePayload(rawBody);
  if (!payload) {
    return Response.json({ error: "Invalid harvest payload" }, { status: 400 });
  }

  const batch = await getPlantingBatchById(payload.batchId);
  if (!batch) {
    return Response.json({ error: "Planting batch not found" }, { status: 404 });
  }
  if (batch.status !== "active") {
    return Response.json(
      { error: "Harvest requires an active planting batch" },
      { status: 409 },
    );
  }
  if (batch.zoneId !== payload.zoneId) {
    return Response.json(
      { error: "zoneId does not match planting batch assignment" },
      { status: 409 },
    );
  }

  const finalizingRecord = !!payload.finalized;
  if (finalizingRecord) {
    if (payload.qualityGrade === undefined) {
      return Response.json(
        { error: "Finalized harvest requires qualityGrade" },
        { status: 400 },
      );
    }

    if (payload.wetWeightKg === undefined && payload.dryWeightKg === undefined) {
      return Response.json(
        { error: "Finalized harvest requires wetWeightKg or dryWeightKg" },
        { status: 400 },
      );
    }
  }

  const nowIso = new Date().toISOString();
  const record: HarvestRecord = {
    id: crypto.randomUUID(),
    batchId: payload.batchId,
    zoneId: payload.zoneId,
    harvestedAt: nowIso,
    operatorUserId: session.userId,
    usableWeightKg: payload.usableWeightKg,
    rejectWeightKg: payload.rejectWeightKg ?? 0,
    wetWeightKg: payload.wetWeightKg,
    dryWeightKg: payload.dryWeightKg,
    qualityGrade: payload.qualityGrade,
    defectNotes: payload.defectNotes,
    finalized: finalizingRecord,
    finalizedAt: finalizingRecord ? nowIso : undefined,
    notes: payload.notes,
    createdAt: nowIso,
  };

  const stored = await addHarvestRecord(record);

  if (payload.markBatchComplete) {
    await markBatchHarvested(payload.batchId);
  }

  const auditEvent: StoredAuditEvent = {
    id: crypto.randomUUID(),
    actorUserId: session.userId,
    role,
    createdAt: nowIso,
    eventType: "harvest",
    action: "log-harvest",
    targetType: "harvest_record",
    targetId: stored.id,
    details: {
      batchId: stored.batchId,
      cropName: batch.cropName,
      cultivar: batch.cultivar,
      zoneId: stored.zoneId,
      usableWeightKg: stored.usableWeightKg,
      rejectWeightKg: stored.rejectWeightKg,
      wetWeightKg: stored.wetWeightKg,
      dryWeightKg: stored.dryWeightKg,
      qualityGrade: stored.qualityGrade,
      finalized: stored.finalized,
      markedBatchComplete: !!payload.markBatchComplete,
    },
  };
  await appendAuditEvent(auditEvent);

  return Response.json({ item: stored }, { status: 201 });
}
