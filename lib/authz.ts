export type AppRole = "operator" | "grow_manager" | "admin";

type SessionClaimsLike = {
  metadata?: { role?: unknown };
  public_metadata?: { role?: unknown };
};

const ROLES: AppRole[] = ["operator", "grow_manager", "admin"];

function isRole(value: unknown): value is AppRole {
  return typeof value === "string" && ROLES.includes(value as AppRole);
}

export function extractRoleFromClaims(
  claims: unknown,
): AppRole {
  if (!claims || typeof claims !== "object") {
    return "operator";
  }

  const parsedClaims = claims as SessionClaimsLike;

  const metadataRole = parsedClaims.metadata?.role;
  if (isRole(metadataRole)) {
    return metadataRole;
  }

  const publicMetadataRole = parsedClaims.public_metadata?.role;
  if (isRole(publicMetadataRole)) {
    return publicMetadataRole;
  }

  return "operator";
}

export function hasRequiredRole(role: AppRole, required: AppRole) {
  const rank: Record<AppRole, number> = {
    operator: 1,
    grow_manager: 2,
    admin: 3,
  };

  return rank[role] >= rank[required];
}
