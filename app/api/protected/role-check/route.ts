import { auth } from "@clerk/nextjs/server";
import { extractRoleFromClaims, hasRequiredRole, type AppRole } from "@/lib/authz";

const REQUIRED_ROLE_QUERY = "requiredRole";

function parseRequiredRole(input: string | null): AppRole {
  if (input === "admin" || input === "grow_manager" || input === "operator") {
    return input;
  }
  return "operator";
}

export async function GET(request: Request) {
  const session = await auth();
  if (!session.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const url = new URL(request.url);
  const requiredRole = parseRequiredRole(url.searchParams.get(REQUIRED_ROLE_QUERY));
  const role = extractRoleFromClaims(session.sessionClaims);
  const allowed = hasRequiredRole(role, requiredRole);

  if (!allowed) {
    return Response.json(
      {
        error: "Forbidden",
        requiredRole,
        role,
      },
      { status: 403 },
    );
  }

  return Response.json({
    ok: true,
    role,
    requiredRole,
    userId: session.userId,
  });
}
