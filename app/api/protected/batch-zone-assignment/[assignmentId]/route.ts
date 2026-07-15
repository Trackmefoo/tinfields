import { auth } from "@clerk/nextjs/server";
import { appendAuditEvent } from "@/lib/audit-store";
import { extractRoleFromClaims, hasRequiredRole } from "@/lib/authz";
import { prisma } from "@/lib/prisma";
import type { BatchZoneAssignment, StoredAuditEvent } from "@/types";

type AssignmentPatchPayload = {
  closeNow?: boolean;
  reopen?: boolean;
  unassignedAt?: string;
  assignmentReason?: string;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function parsePayload(value: unknown): AssignmentPatchPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const closeNow = value.closeNow;
  const reopen = value.reopen;
  const unassignedAt = value.unassignedAt;
  const assignmentReason = value.assignmentReason;

  if (closeNow !== undefined && typeof closeNow !== "boolean") {
    return null;
  }
  if (reopen !== undefined && typeof reopen !== "boolean") {
    return null;
  }
  if (unassignedAt !== undefined && typeof unassignedAt !== "string") {
    return null;
  }
  if (assignmentReason !== undefined && typeof assignmentReason !== "string") {
    return null;
  }

  if (closeNow === undefined && reopen === undefined && unassignedAt === undefined && assignmentReason === undefined) {
    return null;
  }

  if (closeNow && reopen) {
    return null;
  }

  return {
    closeNow,
    reopen,
    unassignedAt: unassignedAt?.trim() || undefined,
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

export async function PATCH(
  request: Request,
  context: { params: Promise<{ assignmentId: string }> },
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

  const { assignmentId } = await context.params;
  if (!assignmentId?.trim()) {
    return Response.json({ error: "Invalid assignmentId" }, { status: 400 });
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const payload = parsePayload(body);
  if (!payload) {
    return Response.json({ error: "Invalid assignment patch payload" }, { status: 400 });
  }

  const existing = await prisma.batchZoneAssignment.findUnique({ where: { id: assignmentId } });
  if (!existing) {
    return Response.json({ error: "Batch-zone assignment not found" }, { status: 404 });
  }

  let unassignedAtValue: Date | null | undefined;
  if (payload.reopen) {
    unassignedAtValue = null;
  }
  if (payload.closeNow) {
    unassignedAtValue = new Date();
  }
  if (payload.unassignedAt) {
    const parsed = new Date(payload.unassignedAt);
    if (Number.isNaN(parsed.getTime())) {
      return Response.json({ error: "unassignedAt must be a valid ISO datetime" }, { status: 400 });
    }
    unassignedAtValue = parsed;
  }

  if (payload.reopen && !existing.unassignedAt) {
    return Response.json(
      { error: "Assignment is already open" },
      { status: 409 },
    );
  }

  if (existing.unassignedAt && unassignedAtValue instanceof Date) {
    return Response.json(
      { error: "Assignment is already closed" },
      { status: 409 },
    );
  }

  const updated = await prisma.batchZoneAssignment.update({
    where: { id: assignmentId },
    data: {
      unassignedAt: unassignedAtValue ?? undefined,
      assignmentReason: payload.assignmentReason ?? undefined,
    },
  });

  const nowIso = new Date().toISOString();
  const auditEvent: StoredAuditEvent = {
    id: crypto.randomUUID(),
    actorUserId: session.userId,
    role,
    createdAt: nowIso,
    eventType: "planting",
    action: "update-batch-zone-assignment",
    targetType: "batch_zone_assignment",
    targetId: updated.id,
    details: {
      closed: !!updated.unassignedAt,
      assignmentReason: updated.assignmentReason,
    },
  };
  await appendAuditEvent(auditEvent);

  return Response.json({ item: toAssignment(updated) });
}
