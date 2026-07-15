import { auth } from "@clerk/nextjs/server";
import { closeZoneRecipeAssignment } from "@/lib/zone-recipe-store";
import { extractRoleFromClaims, hasRequiredRole, requireApprovedRole } from "@/lib/authz";

type Context = {
  params: Promise<{ assignmentId: string }>;
};

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

export async function PATCH(request: Request, context: Context) {
  const session = await auth();
  if (!session.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = extractRoleFromClaims(session.sessionClaims);
  if (!hasRequiredRole(role, "grow_manager")) {
    return Response.json({ error: "Forbidden", requiredRole: "grow_manager", role }, { status: 403 });
  }

  const { assignmentId } = await context.params;
  if (!assignmentId || assignmentId.trim().length < 1) {
    return Response.json({ error: "Invalid assignment id" }, { status: 400 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const payload = isRecord(body) ? body : {};
  const status = payload.status;
  const endedAt = payload.endedAt;
  const notes = payload.notes;

  try {
    const item = await closeZoneRecipeAssignment(
      assignmentId,
      {
        userId: session.userId,
        role: requireApprovedRole(role),
      },
      {
        status: status === "cancelled" ? "cancelled" : "completed",
        endedAt: typeof endedAt === "string" ? endedAt : undefined,
        notes: typeof notes === "string" ? notes.trim() || undefined : undefined,
      },
    );

    return Response.json({ item });
  } catch {
    return Response.json({ error: "Unable to close assignment" }, { status: 400 });
  }
}
