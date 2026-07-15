import { auth } from "@clerk/nextjs/server";
import { extractRoleFromClaims, hasRequiredRole } from "@/lib/authz";
import { appendAuditEvent } from "@/lib/audit-store";
import {
  getMessagingReadinessStatus,
  sendTestAlertNotification,
} from "@/lib/notifications";
import type { StoredAuditEvent } from "@/types";

function parseMessage(value: unknown) {
  if (typeof value !== "string") {
    return "TinFields integration readiness test notification.";
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return "TinFields integration readiness test notification.";
  }

  return trimmed.slice(0, 500);
}

export async function GET() {
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

  return Response.json({
    messaging: getMessagingReadinessStatus(),
    checkedAt: new Date().toISOString(),
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
    body = {};
  }

  const message = parseMessage(
    body && typeof body === "object" && !Array.isArray(body)
      ? (body as Record<string, unknown>).message
      : undefined,
  );

  const result = await sendTestAlertNotification(message);

  const nowIso = new Date().toISOString();
  const auditEvent: StoredAuditEvent = {
    id: crypto.randomUUID(),
    actorUserId: session.userId,
    role,
    createdAt: nowIso,
    eventType: "command",
    action: "integration-readiness-test",
    targetType: "messaging_provider",
    details: {
      provider: result.provider,
      delivered: result.delivered,
      usedFallback: result.usedFallback,
      error: result.error,
    },
  };
  await appendAuditEvent(auditEvent);

  return Response.json({
    ok: result.delivered,
    provider: result.provider,
    usedFallback: result.usedFallback,
    error: result.error,
    testedAt: nowIso,
    readiness: getMessagingReadinessStatus(),
  });
}
