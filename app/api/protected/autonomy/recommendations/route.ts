import { auth } from "@clerk/nextjs/server";
import { extractRoleFromClaims, hasRequiredRole } from "@/lib/authz";
import { listAutonomyRecommendations } from "@/lib/autonomy-loop";

const LIMIT_QUERY = "limit";

function parseLimit(rawLimit: string | null) {
  if (!rawLimit) {
    return 100;
  }

  const parsed = Number(rawLimit);
  if (!Number.isFinite(parsed)) {
    return 100;
  }

  return Math.max(1, Math.min(Math.floor(parsed), 250));
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = extractRoleFromClaims(session.sessionClaims);
  if (!hasRequiredRole(role, "operator")) {
    return Response.json({ error: "Forbidden", requiredRole: "operator", role }, { status: 403 });
  }

  const url = new URL(request.url);
  const limit = parseLimit(url.searchParams.get(LIMIT_QUERY));
  const status = url.searchParams.get("status");
  const riskLevel = url.searchParams.get("riskLevel");

  const items = await listAutonomyRecommendations(limit, {
    farmId: url.searchParams.get("farmId")?.trim() || undefined,
    zoneId: url.searchParams.get("zoneId")?.trim() || undefined,
    status:
      status === "proposed" ||
      status === "approved" ||
      status === "rejected" ||
      status === "executed" ||
      status === "blocked"
        ? status
        : undefined,
    riskLevel: riskLevel === "low" || riskLevel === "high" ? riskLevel : undefined,
  });

  return Response.json({ items, limit });
}
