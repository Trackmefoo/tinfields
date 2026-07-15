import { auth } from "@clerk/nextjs/server";
import { extractRoleFromClaims, hasRequiredRole } from "@/lib/authz";
import { acknowledgeAlertEvent } from "@/lib/telemetry-alerts";

type Context = {
  params: Promise<{ eventId: string }>;
};

export async function POST(_request: Request, context: Context) {
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

  const { eventId } = await context.params;
  if (!eventId || eventId.trim().length < 1) {
    return Response.json({ error: "Invalid alert event id" }, { status: 400 });
  }

  try {
    const item = await acknowledgeAlertEvent(eventId, session.userId);
    return Response.json({ item });
  } catch {
    return Response.json({ error: "Alert event not found" }, { status: 404 });
  }
}
