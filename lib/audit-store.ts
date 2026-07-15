import { Prisma } from "@prisma/client";
import type { AppRole, AuditEventType } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import type { StoredAuditEvent } from "@/types";

const EVENT_LIMIT = 500;

function toAppRole(role: string): AppRole {
  if (role === "admin" || role === "grow_manager") {
    return role;
  }

  return "operator";
}

function toAuditEventType(eventType: string): AuditEventType {
  if (eventType === "planting" || eventType === "harvest") {
    return eventType;
  }

  return "command";
}

function toObjectDetails(value: unknown) {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return undefined;
  }

  return value as Record<string, unknown>;
}

function toInputJsonValue(value: Record<string, unknown> | undefined) {
  if (!value) {
    return undefined;
  }

  return JSON.parse(JSON.stringify(value)) as Prisma.InputJsonValue;
}

export async function appendAuditEvent(event: StoredAuditEvent) {
  await prisma.auditEvent.create({
    data: {
      id: event.id,
      actorUserId: event.actorUserId,
      role: toAppRole(event.role),
      eventType: toAuditEventType(event.eventType),
      action: event.action,
      targetType: event.targetType,
      targetId: event.targetId,
      details: toInputJsonValue(event.details),
      createdAt: new Date(event.createdAt),
    },
  });

  return event;
}

export async function listAuditEvents(limit = 100) {
  const safeLimit = Math.max(1, Math.min(limit, EVENT_LIMIT));
  const rows = await prisma.auditEvent.findMany({
    orderBy: { createdAt: "desc" },
    take: safeLimit,
  });

  return rows.map<StoredAuditEvent>((row) => ({
    id: row.id,
    actorUserId: row.actorUserId,
    role: row.role,
    eventType: row.eventType,
    action: row.action,
    targetType: row.targetType,
    targetId: row.targetId ?? undefined,
    details: toObjectDetails(row.details),
    createdAt: row.createdAt.toISOString(),
  }));
}
