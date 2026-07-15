import { auth } from "@clerk/nextjs/server";
import { appendAuditEvent, listAuditEvents } from "@/lib/audit-store";
import {
  extractRoleFromClaims,
  hasRequiredRole,
  requireApprovedRole,
  type AppRole,
} from "@/lib/authz";
import type { AuditEventPayload, AuditEventType, StoredAuditEvent } from "@/types";

const LIMIT_QUERY = "limit";

function requiredRoleForEvent(eventType: AuditEventType): AppRole {
  switch (eventType) {
    case "planting":
      return "grow_manager";
    case "harvest":
      return "operator";
    case "command":
    default:
      return "operator";
  }
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

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isAuditEventType(value: unknown): value is AuditEventType {
  return value === "command" || value === "planting" || value === "harvest";
}

function parsePayload(value: unknown): AuditEventPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const eventType = value.eventType;
  const action = value.action;
  const targetType = value.targetType;
  const targetId = value.targetId;
  const details = value.details;

  if (!isAuditEventType(eventType)) {
    return null;
  }
  if (typeof action !== "string" || action.length < 2 || action.length > 80) {
    return null;
  }
  if (
    typeof targetType !== "string" ||
    targetType.length < 2 ||
    targetType.length > 80
  ) {
    return null;
  }
  if (targetId !== undefined && typeof targetId !== "string") {
    return null;
  }
  if (details !== undefined && !isRecord(details)) {
    return null;
  }

  return {
    eventType,
    action,
    targetType,
    targetId,
    details,
  };
}

export async function GET(request: Request) {
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

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get(LIMIT_QUERY));
  return Response.json({
    items: await listAuditEvents(limit),
    limit,
  });
}

export async function POST(request: Request) {
  const session = await auth();
  if (!session.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  let rawBody: unknown;
  try {
    rawBody = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const payload = parsePayload(rawBody);
  if (!payload) {
    return Response.json(
      {
        error: "Invalid audit event payload",
      },
      { status: 400 },
    );
  }

  const role = extractRoleFromClaims(session.sessionClaims);
  const requiredRole = requiredRoleForEvent(payload.eventType);
  if (!hasRequiredRole(role, requiredRole)) {
    return Response.json(
      {
        error: "Forbidden",
        requiredRole,
        role,
      },
      { status: 403 },
    );
  }

  const event: StoredAuditEvent = {
    ...payload,
    id: crypto.randomUUID(),
    actorUserId: session.userId,
    role: requireApprovedRole(role),
    createdAt: new Date().toISOString(),
  };

  return Response.json({ item: await appendAuditEvent(event) }, { status: 201 });
}
