import { auth } from "@clerk/nextjs/server";
import { prisma } from "@/lib/prisma";
import { appendAuditEvent } from "@/lib/audit-store";
import { extractRoleFromClaims, hasRequiredRole, requireApprovedRole } from "@/lib/authz";
import type { BatchZoneAssignment, StoredAuditEvent } from "@/types";

const LIMIT_QUERY = "limit";
const BATCH_ID_QUERY = "batchId";

type AssignmentPayload = {
  batchId: string;
  zoneId: string;
  assignedAt?: string;
  assignmentReason?: string;
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

function parsePayload(value: unknown): AssignmentPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const batchId = value.batchId;
  const zoneId = value.zoneId;
  const assignedAt = value.assignedAt;
  const assignmentReason = value.assignmentReason;

  if (typeof batchId !== "string" || batchId.trim().length < 1) {
    return null;
  }
  if (typeof zoneId !== "string" || zoneId.trim().length < 1) {
    return null;
  }
  if (assignedAt !== undefined && typeof assignedAt !== "string") {
    return null;
  }
  if (assignmentReason !== undefined && typeof assignmentReason !== "string") {
    return null;
  }

  return {
    batchId: batchId.trim(),
    zoneId: zoneId.trim(),
    assignedAt: assignedAt?.trim() || undefined,
    assignmentReason: assignmentReason?.trim() || undefined,
  };
}

function toAssignment(row: {
  id: string;
  batchId: string;
  zoneId: string;
  assignedAt: Date;
  unassignedAt: Date | null;
  assignmentReason: string | null;
  createdAt: Date;
}): BatchZoneAssignment {
  return {
    id: row.id,
    batchId: row.batchId,
    zoneId: row.zoneId,
    assignedAt: row.assignedAt.toISOString(),
    unassignedAt: row.unassignedAt?.toISOString(),
    assignmentReason: row.assignmentReason ?? undefined,
    createdAt: row.createdAt.toISOString(),
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
  const batchId = url.searchParams.get(BATCH_ID_QUERY)?.trim();

  const rows = await prisma.batchZoneAssignment.findMany({
    where: {
      batchId: batchId || undefined,
    },
    orderBy: {
      assignedAt: "desc",
    },
    take: limit,
  });

  return Response.json({
    items: rows.map((row) => toAssignment(row)),
    limit,
    batchId: batchId || null,
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
    return Response.json({ error: "Invalid batch zone assignment payload" }, { status: 400 });
  }

  const batch = await prisma.plantingBatch.findUnique({
    where: { id: payload.batchId },
  });
  if (!batch) {
    return Response.json({ error: "Planting batch not found" }, { status: 404 });
  }

  const assignedAtDate = payload.assignedAt ? new Date(payload.assignedAt) : new Date();
  if (Number.isNaN(assignedAtDate.getTime())) {
    return Response.json({ error: "assignedAt must be a valid ISO datetime" }, { status: 400 });
  }

  const now = new Date();
  const assignment = await prisma.batchZoneAssignment.create({
    data: {
      id: crypto.randomUUID(),
      batchId: payload.batchId,
      zoneId: payload.zoneId,
      assignedAt: assignedAtDate,
      assignmentReason: payload.assignmentReason,
      createdAt: now,
    },
  });

  const auditEvent: StoredAuditEvent = {
    id: crypto.randomUUID(),
    actorUserId: session.userId,
    role: requireApprovedRole(role),
    createdAt: now.toISOString(),
    eventType: "planting",
    action: "assign-batch-zone",
    targetType: "batch_zone_assignment",
    targetId: assignment.id,
    details: {
      batchId: assignment.batchId,
      zoneId: assignment.zoneId,
      assignmentReason: assignment.assignmentReason,
    },
  };
  await appendAuditEvent(auditEvent);

  return Response.json({ item: toAssignment(assignment) }, { status: 201 });
}
