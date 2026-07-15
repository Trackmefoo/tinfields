import { auth } from "@clerk/nextjs/server";
import { extractRoleFromClaims, hasRequiredRole, requireApprovedRole } from "@/lib/authz";
import { decideAutonomyRecommendation } from "@/lib/autonomy-loop";

type RouteParams = {
  params: Promise<{
    recommendationId: string;
  }>;
};

function extractDecision(payload: unknown): "approve" | "reject" | null {
  if (!payload || typeof payload !== "object" || Array.isArray(payload)) {
    return null;
  }

  const decision = (payload as Record<string, unknown>).decision;
  if (decision === "approve" || decision === "reject") {
    return decision;
  }

  return null;
}

export async function POST(request: Request, { params }: RouteParams) {
  const session = await auth();
  if (!session.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = extractRoleFromClaims(session.sessionClaims);
  if (!hasRequiredRole(role, "grow_manager")) {
    return Response.json({ error: "Forbidden", requiredRole: "grow_manager", role }, { status: 403 });
  }

  const payload = await request.json().catch(() => null);
  const decision = extractDecision(payload);
  if (!decision) {
    return Response.json({ error: "Invalid decision. Use 'approve' or 'reject'." }, { status: 400 });
  }

  const { recommendationId } = await params;

  try {
    const result = await decideAutonomyRecommendation(recommendationId, decision, {
      userId: session.userId,
      role: requireApprovedRole(role),
    });
    return Response.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to process decision";
    const statusCode = message.includes("not found") ? 404 : 400;
    return Response.json({ error: message }, { status: statusCode });
  }
}
