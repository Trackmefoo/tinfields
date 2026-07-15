export type ApprovedRole = "operator" | "grow_manager" | "admin";
export type AppRole = ApprovedRole | "pending";

type SessionClaimsLike = {
  metadata?: { role?: unknown };
  public_metadata?: { role?: unknown };
};

const APPROVED_ROLES: ApprovedRole[] = ["operator", "grow_manager", "admin"];

function isApprovedRole(value: unknown): value is ApprovedRole {
  return typeof value === "string" && APPROVED_ROLES.includes(value as ApprovedRole);
}

export function isActiveRole(role: AppRole): role is ApprovedRole {
  return role !== "pending";
}

export function requireApprovedRole(role: AppRole): ApprovedRole {
  if (role === "pending") {
    throw new Error("Pending users cannot perform approved actions");
  }

  return role;
}

export function extractRoleFromClaims(
  claims: unknown,
): AppRole {
  if (!claims || typeof claims !== "object") {
    return "pending";
  }

  const parsedClaims = claims as SessionClaimsLike;

  const metadataRole = parsedClaims.metadata?.role;
  if (isApprovedRole(metadataRole)) {
    return metadataRole;
  }

  const publicMetadataRole = parsedClaims.public_metadata?.role;
  if (isApprovedRole(publicMetadataRole)) {
    return publicMetadataRole;
  }

  return "pending";
}

export function hasRequiredRole(role: AppRole, required: AppRole) {
  const rank: Record<AppRole, number> = {
    pending: 0,
    operator: 1,
    grow_manager: 2,
    admin: 3,
  };

  return rank[role] >= rank[required];
}
