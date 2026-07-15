import { auth, clerkClient } from "@clerk/nextjs/server";
import { extractRoleFromClaims, hasRequiredRole, type ApprovedRole } from "@/lib/authz";

type UserApprovalItem = {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  lastSignInAt?: string;
  role: ApprovedRole | "pending";
};

type PatchPayload = {
  userId: string;
  role: ApprovedRole;
};

type ClerkEmailAddress = {
  id: string;
  emailAddress: string;
};

type ClerkUserLike = {
  id: string;
  emailAddresses: ClerkEmailAddress[];
  primaryEmailAddressId: string | null;
  firstName: string | null;
  lastName: string | null;
  username: string | null;
  createdAt: number;
  lastSignInAt: number | null;
  publicMetadata: unknown;
};

const APPROVED_ROLES: ApprovedRole[] = ["operator", "grow_manager", "admin"];

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function getRoleFromPublicMetadata(value: unknown): ApprovedRole | "pending" {
  if (!isRecord(value)) {
    return "pending";
  }

  const role = value.role;
  if (role === "operator" || role === "grow_manager" || role === "admin") {
    return role;
  }

  return "pending";
}

function parsePayload(value: unknown): PatchPayload | null {
  if (!isRecord(value)) {
    return null;
  }

  const userId = value.userId;
  const role = value.role;

  if (typeof userId !== "string" || userId.length < 3) {
    return null;
  }

  if (role !== "operator" && role !== "grow_manager" && role !== "admin") {
    return null;
  }

  return { userId, role };
}

function toUserApprovalItem(user: ClerkUserLike): UserApprovalItem {
  const primaryEmail = user.emailAddresses.find((email) => email.id === user.primaryEmailAddressId);
  const fallbackEmail = user.emailAddresses?.[0];
  const emailAddress = primaryEmail?.emailAddress ?? fallbackEmail?.emailAddress ?? "unknown";
  const fullName =
    [user.firstName, user.lastName].filter((value: unknown) => typeof value === "string" && value.trim()).join(" ") ||
    user.username ||
    "Unnamed user";

  return {
    id: user.id,
    email: emailAddress,
    fullName,
    createdAt: new Date(user.createdAt).toISOString(),
    lastSignInAt: user.lastSignInAt ? new Date(user.lastSignInAt).toISOString() : undefined,
    role: getRoleFromPublicMetadata(user.publicMetadata),
  };
}

export async function GET() {
  const session = await auth();
  if (!session.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = extractRoleFromClaims(session.sessionClaims);
  if (!hasRequiredRole(role, "admin")) {
    return Response.json(
      {
        error: "Forbidden",
        requiredRole: "admin",
        role,
      },
      { status: 403 },
    );
  }

  const client = await clerkClient();
  const usersResponse = await client.users.getUserList({
    limit: 200,
  });

  const users = usersResponse.data.map((user) => toUserApprovalItem(user as unknown as ClerkUserLike));
  const pendingUsers = users.filter((user) => user.role === "pending");
  const approvedUsers = users.filter((user) => user.role !== "pending");

  return Response.json({
    items: pendingUsers,
    approvedUsers,
    approvedRoles: APPROVED_ROLES,
    totalUsers: users.length,
  });
}

export async function PATCH(request: Request) {
  const session = await auth();
  if (!session.userId) {
    return Response.json({ error: "Unauthorized" }, { status: 401 });
  }

  const role = extractRoleFromClaims(session.sessionClaims);
  if (!hasRequiredRole(role, "admin")) {
    return Response.json(
      {
        error: "Forbidden",
        requiredRole: "admin",
        role,
      },
      { status: 403 },
    );
  }

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json({ error: "Invalid JSON payload" }, { status: 400 });
  }

  const payload = parsePayload(body);
  if (!payload) {
    return Response.json({ error: "Invalid approval payload" }, { status: 400 });
  }

  const client = await clerkClient();
  const user = await client.users.getUser(payload.userId);
  const existingPublicMetadata = isRecord(user.publicMetadata) ? user.publicMetadata : {};

  await client.users.updateUserMetadata(payload.userId, {
    publicMetadata: {
      ...existingPublicMetadata,
      role: payload.role,
    },
  });

  return Response.json({
    ok: true,
    userId: payload.userId,
    role: payload.role,
  });
}
