import { auth, clerkClient } from "@clerk/nextjs/server";
import { appendAuditEvent, listAuditEvents } from "@/lib/audit-store";
import { extractRoleFromClaims, hasRequiredRole, requireApprovedRole, type ApprovedRole } from "@/lib/authz";
import type { StoredAuditEvent } from "@/types";

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
  role: ApprovedRole | "pending";
};

type AccessActivityAction = "approved" | "revoked" | "role_changed";

type ApprovalAuditItem = {
  id: string;
  createdAt: string;
  action: AccessActivityAction;
  actorUserId: string;
  actorRole: ApprovedRole;
  actorDisplayName?: string;
  actorEmail?: string;
  targetUserId?: string;
  targetDisplayName?: string;
  targetEmail?: string;
  previousRole?: ApprovedRole | "pending";
  role?: ApprovedRole | "pending";
};

type ApprovalActivityResponse = {
  items: ApprovalAuditItem[];
  page: number;
  pageSize: number;
  total: number;
  totalPages: number;
  filter: {
    action: "all" | AccessActivityAction;
    actorUserId?: string;
    targetUserId?: string;
  };
};

type UserIdentity = {
  fullName: string;
  email: string;
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
const APPROVAL_AUDIT_ACTION = "user-access-approved";
const REVOKE_AUDIT_ACTION = "user-access-revoked";
const ROLE_CHANGE_AUDIT_ACTION = "user-access-role-changed";
const APPROVAL_AUDIT_TARGET = "user";
const AUDIT_SCAN_LIMIT = 500;
const DEFAULT_ACTIVITY_PAGE = 1;
const DEFAULT_ACTIVITY_PAGE_SIZE = 10;
const MAX_ACTIVITY_PAGE_SIZE = 50;
const MAX_USER_LIST = 200;
const SEARCH_QUERY = "search";
const ACTIVITY_PAGE_QUERY = "activityPage";
const ACTIVITY_PAGE_SIZE_QUERY = "activityPageSize";
const ACTIVITY_ACTION_QUERY = "activityAction";
const ACTIVITY_ACTOR_QUERY = "activityActorUserId";
const ACTIVITY_TARGET_QUERY = "activityTargetUserId";
const ACTIVITY_FORMAT_QUERY = "activityFormat";

function isRecord(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === "object" && !Array.isArray(value);
}

function isApprovedRole(value: unknown): value is ApprovedRole {
  return value === "operator" || value === "grow_manager" || value === "admin";
}

function isManagedRole(value: unknown): value is ApprovedRole | "pending" {
  return value === "pending" || isApprovedRole(value);
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

function parsePositiveInt(value: string | null, fallback: number, max: number) {
  if (!value) {
    return fallback;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    return fallback;
  }

  return Math.max(1, Math.min(Math.floor(parsed), max));
}

function parseActivityAction(value: string | null): "all" | AccessActivityAction {
  if (value === "approved" || value === "revoked" || value === "role_changed") {
    return value;
  }

  return "all";
}

function isCsvFormat(value: string | null) {
  return value?.toLowerCase() === "csv";
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

  if (role !== "operator" && role !== "grow_manager" && role !== "admin" && role !== "pending") {
    return null;
  }

  return { userId, role };
}

function getActivityAction(action: string): AccessActivityAction | null {
  switch (action) {
    case APPROVAL_AUDIT_ACTION:
      return "approved";
    case REVOKE_AUDIT_ACTION:
      return "revoked";
    case ROLE_CHANGE_AUDIT_ACTION:
      return "role_changed";
    default:
      return null;
  }
}

function toApprovalAuditItem(event: StoredAuditEvent): ApprovalAuditItem | null {
  if (event.targetType !== APPROVAL_AUDIT_TARGET) {
    return null;
  }

  const activityAction = getActivityAction(event.action);
  if (!activityAction) {
    return null;
  }

  const details = isRecord(event.details) ? event.details : {};
  const nextRole = isManagedRole(details.newRole)
    ? details.newRole
    : isManagedRole(details.approvedRole)
      ? details.approvedRole
      : undefined;
  const previousRole = isManagedRole(details.previousRole) ? details.previousRole : undefined;
  const targetUserId =
    typeof details.targetUserId === "string"
      ? details.targetUserId
      : typeof details.approvedUserId === "string"
        ? details.approvedUserId
        : event.targetId;

  return {
    id: event.id,
    createdAt: event.createdAt,
    action: activityAction,
    actorUserId: event.actorUserId,
    actorRole: event.role,
    targetUserId,
    previousRole,
    role: nextRole,
  };
}

function applySearch(users: UserApprovalItem[], search: string) {
  if (!search) {
    return users;
  }

  const normalized = search.toLowerCase();
  return users.filter((user) => {
    return (
      user.fullName.toLowerCase().includes(normalized) ||
      user.email.toLowerCase().includes(normalized) ||
      user.id.toLowerCase().includes(normalized)
    );
  });
}

async function resolveUserIdentities(userIds: string[]): Promise<Record<string, UserIdentity>> {
  const uniqueIds = [...new Set(userIds.filter((id) => id.length > 0))];
  if (uniqueIds.length === 0) {
    return {};
  }

  const client = await clerkClient();
  const pairs = await Promise.all(
    uniqueIds.map(async (userId) => {
      try {
        const user = await client.users.getUser(userId);
        const userItem = toUserApprovalItem(user as unknown as ClerkUserLike);
        return [
          userId,
          {
            fullName: userItem.fullName,
            email: userItem.email,
          },
        ] as const;
      } catch {
        return null;
      }
    }),
  );

  const resolved: Record<string, UserIdentity> = {};
  pairs.forEach((pair) => {
    if (!pair) {
      return;
    }

    resolved[pair[0]] = pair[1];
  });

  return resolved;
}

async function buildActivityResponse(requestUrl: string): Promise<ApprovalActivityResponse> {
  const url = new URL(requestUrl);
  const page = parsePositiveInt(url.searchParams.get(ACTIVITY_PAGE_QUERY), DEFAULT_ACTIVITY_PAGE, 10_000);
  const pageSize = parsePositiveInt(
    url.searchParams.get(ACTIVITY_PAGE_SIZE_QUERY),
    DEFAULT_ACTIVITY_PAGE_SIZE,
    MAX_ACTIVITY_PAGE_SIZE,
  );
  const actionFilter = parseActivityAction(url.searchParams.get(ACTIVITY_ACTION_QUERY));
  const actorUserId = url.searchParams.get(ACTIVITY_ACTOR_QUERY) ?? undefined;
  const targetUserId = url.searchParams.get(ACTIVITY_TARGET_QUERY) ?? undefined;

  const allChanges = (await listAuditEvents(AUDIT_SCAN_LIMIT))
    .map(toApprovalAuditItem)
    .filter((item): item is ApprovalAuditItem => !!item)
    .filter((item) => (actionFilter === "all" ? true : item.action === actionFilter))
    .filter((item) => (actorUserId ? item.actorUserId === actorUserId : true))
    .filter((item) => (targetUserId ? item.targetUserId === targetUserId : true));

  const total = allChanges.length;
  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const safePage = Math.min(page, totalPages);
  const offset = (safePage - 1) * pageSize;
  const slice = allChanges.slice(offset, offset + pageSize);

  const identities = await resolveUserIdentities(
    slice.flatMap((item) => [item.actorUserId, item.targetUserId ?? ""]),
  );

  const enrichedItems = slice.map((item) => {
    const actorIdentity = identities[item.actorUserId];
    const targetIdentity = item.targetUserId ? identities[item.targetUserId] : undefined;

    return {
      ...item,
      actorDisplayName: actorIdentity?.fullName,
      actorEmail: actorIdentity?.email,
      targetDisplayName: targetIdentity?.fullName,
      targetEmail: targetIdentity?.email,
    };
  });

  return {
    items: enrichedItems,
    page: safePage,
    pageSize,
    total,
    totalPages,
    filter: {
      action: actionFilter,
      actorUserId,
      targetUserId,
    },
  };
}

function toCsvCell(value: string | undefined) {
  const serialized = value ?? "";
  return `"${serialized.replaceAll("\"", "\"\"")}"`;
}

function toActivityCsv(items: ApprovalAuditItem[]) {
  const headers = [
    "createdAt",
    "action",
    "actorUserId",
    "actorDisplayName",
    "actorEmail",
    "targetUserId",
    "targetDisplayName",
    "targetEmail",
    "previousRole",
    "newRole",
  ];

  const rows = items.map((item) => {
    return [
      toCsvCell(item.createdAt),
      toCsvCell(item.action),
      toCsvCell(item.actorUserId),
      toCsvCell(item.actorDisplayName),
      toCsvCell(item.actorEmail),
      toCsvCell(item.targetUserId),
      toCsvCell(item.targetDisplayName),
      toCsvCell(item.targetEmail),
      toCsvCell(item.previousRole),
      toCsvCell(item.role),
    ].join(",");
  });

  return [headers.join(","), ...rows].join("\n");
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

export async function GET(request: Request) {
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
    limit: MAX_USER_LIST,
  });

  const url = new URL(request.url);
  const search = (url.searchParams.get(SEARCH_QUERY) ?? "").trim();
  const users = applySearch(
    usersResponse.data.map((user) => toUserApprovalItem(user as unknown as ClerkUserLike)),
    search,
  );
  const pendingUsers = users.filter((user) => user.role === "pending");
  const approvedUsers = users.filter((user) => user.role !== "pending");
  const activity = await buildActivityResponse(request.url);

  if (isCsvFormat(url.searchParams.get(ACTIVITY_FORMAT_QUERY))) {
    const csv = toActivityCsv(activity.items);
    return new Response(csv, {
      status: 200,
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": `attachment; filename=access-activity-page-${activity.page}.csv`,
      },
    });
  }

  return Response.json({
    items: pendingUsers,
    approvedUsers,
    activity,
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
  const previousRole = getRoleFromPublicMetadata(existingPublicMetadata);

  await client.users.updateUserMetadata(payload.userId, {
    publicMetadata: {
      ...existingPublicMetadata,
      role: payload.role,
    },
  });

  let action = ROLE_CHANGE_AUDIT_ACTION;
  if (payload.role === "pending") {
    action = REVOKE_AUDIT_ACTION;
  } else if (previousRole === "pending") {
    action = APPROVAL_AUDIT_ACTION;
  }

  const auditEvent: StoredAuditEvent = {
    id: crypto.randomUUID(),
    actorUserId: session.userId,
    role: requireApprovedRole(role),
    createdAt: new Date().toISOString(),
    eventType: "command",
    action,
    targetType: APPROVAL_AUDIT_TARGET,
    targetId: payload.userId,
    details: {
      targetUserId: payload.userId,
      previousRole,
      newRole: payload.role,
      approvedUserId: payload.userId,
      approvedRole: payload.role,
    },
  };
  await appendAuditEvent(auditEvent);

  return Response.json({
    ok: true,
    userId: payload.userId,
    previousRole,
    action,
    role: payload.role,
  });
}
