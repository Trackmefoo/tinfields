import { auth } from "@clerk/nextjs/server";
import { extractRoleFromClaims, hasRequiredRole, requireApprovedRole } from "@/lib/authz";
import { runAutonomyEvaluation } from "@/lib/autonomy-loop";

export async function POST(request: Request) {
  const session = await auth();
  if (!session.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = extractRoleFromClaims(session.sessionClaims);
  if (!hasRequiredRole(role, "grow_manager")) {
    return Response.json({ error: "Forbidden", requiredRole: "grow_manager", role }, { status: 403 });
  }

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const farmId =
    body && typeof body === "object" && !Array.isArray(body) && typeof (body as Record<string, unknown>).farmId === "string"
      ? ((body as Record<string, unknown>).farmId as string).trim()
      : undefined;

  const result = await runAutonomyEvaluation(
    {
      userId: session.userId,
      role: requireApprovedRole(role),
    },
    farmId || process.env.TINFIELDS_DEFAULT_FARM_ID || "demo-farm",
  );

  return Response.json(result, { status: 201 });
}
