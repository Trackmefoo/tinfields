"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ApprovalRole = "operator" | "grow_manager" | "admin";
type ManagedRole = ApprovalRole | "pending";
type AccessActivityAction = "approved" | "revoked" | "role_changed";
type ActivityFilter = "all" | AccessActivityAction;

type UserApprovalItem = {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  lastSignInAt?: string;
  role: ManagedRole;
};

type ApprovalAuditItem = {
  id: string;
  createdAt: string;
  action: AccessActivityAction;
  actorUserId: string;
  actorRole: ApprovalRole;
  actorDisplayName?: string;
  actorEmail?: string;
  targetUserId?: string;
  targetDisplayName?: string;
  targetEmail?: string;
  previousRole?: ManagedRole;
  role?: ManagedRole;
};

type ActivityPayload = {
  items?: ApprovalAuditItem[];
  page?: number;
  pageSize?: number;
  total?: number;
  totalPages?: number;
  filter?: {
    action?: ActivityFilter;
    actorUserId?: string;
    targetUserId?: string;
  };
};

type ApprovalListResponse = {
  items?: UserApprovalItem[];
  approvedUsers?: UserApprovalItem[];
  activity?: ActivityPayload;
  approvedRoles?: ApprovalRole[];
  totalUsers?: number;
  error?: string;
};

type RoleUpdateResponse = {
  ok?: boolean;
  previousRole?: ManagedRole;
  role?: ManagedRole;
  action?: AccessActivityAction;
  error?: string;
};

const DEFAULT_ROLES: ApprovalRole[] = ["operator", "grow_manager", "admin"];
const DEFAULT_ACTIVITY_PAGE = 1;
const DEFAULT_ACTIVITY_PAGE_SIZE = 10;

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

function isApprovalRole(value: unknown): value is ApprovalRole {
  return value === "operator" || value === "grow_manager" || value === "admin";
}

function isActivityFilter(value: unknown): value is ActivityFilter {
  return value === "all" || value === "approved" || value === "revoked" || value === "role_changed";
}

function normalizeRoles(value: unknown): ApprovalRole[] {
  if (!Array.isArray(value)) {
    return DEFAULT_ROLES;
  }

  const parsed = value.filter(isApprovalRole);
  if (parsed.length === 0) {
    return DEFAULT_ROLES;
  }

  return parsed;
}

function toTitleCaseAction(action: AccessActivityAction) {
  if (action === "role_changed") {
    return "Role Changed";
  }

  return action.charAt(0).toUpperCase() + action.slice(1);
}

function roleLabel(role: ManagedRole | undefined) {
  if (!role) {
    return "Unknown";
  }

  return role === "grow_manager" ? "Grow Manager" : role.charAt(0).toUpperCase() + role.slice(1);
}

export default function AccessApprovalPage() {
  const [pendingUsers, setPendingUsers] = useState<UserApprovalItem[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<UserApprovalItem[]>([]);
  const [approvalEvents, setApprovalEvents] = useState<ApprovalAuditItem[]>([]);
  const [approvedRoles, setApprovedRoles] = useState<ApprovalRole[]>(DEFAULT_ROLES);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, ManagedRole>>({});
  const [searchQuery, setSearchQuery] = useState("");
  const [activityFilter, setActivityFilter] = useState<ActivityFilter>("all");
  const [activityPage, setActivityPage] = useState(DEFAULT_ACTIVITY_PAGE);
  const [activityPageSize, setActivityPageSize] = useState(DEFAULT_ACTIVITY_PAGE_SIZE);
  const [activityTotal, setActivityTotal] = useState(0);
  const [activityTotalPages, setActivityTotalPages] = useState(1);
  const [isLoading, setIsLoading] = useState(true);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  function applyServerPayload(payload: ApprovalListResponse) {
    const pending = Array.isArray(payload.items) ? payload.items : [];
    const approved = Array.isArray(payload.approvedUsers) ? payload.approvedUsers : [];
    const roles = normalizeRoles(payload.approvedRoles);
    const activity = payload.activity;
    const activityItems = Array.isArray(activity?.items) ? activity.items : [];
    const nextActivityFilter = isActivityFilter(activity?.filter?.action)
      ? activity.filter.action
      : activityFilter;

    setPendingUsers(pending);
    setApprovedUsers(approved);
    setApprovedRoles(roles);
    setApprovalEvents(activityItems);
    setActivityFilter(nextActivityFilter);
    setActivityPage(typeof activity?.page === "number" ? activity.page : DEFAULT_ACTIVITY_PAGE);
    setActivityPageSize(
      typeof activity?.pageSize === "number" ? activity.pageSize : DEFAULT_ACTIVITY_PAGE_SIZE,
    );
    setActivityTotal(typeof activity?.total === "number" ? activity.total : 0);
    setActivityTotalPages(typeof activity?.totalPages === "number" ? activity.totalPages : 1);

    setSelectedRoles((current) => {
      const next = { ...current };
      pending.forEach((user) => {
        if (!next[user.id] || next[user.id] === "pending") {
          next[user.id] = "operator";
        }
      });
      approved.forEach((user) => {
        if (!next[user.id]) {
          next[user.id] = user.role;
        }
      });
      return next;
    });
  }

  async function loadUsers(options?: {
    activityFilter?: ActivityFilter;
    activityPage?: number;
    searchQuery?: string;
  }) {
    const nextFilter = options?.activityFilter ?? activityFilter;
    const nextPage = options?.activityPage ?? activityPage;
    const nextSearch = options?.searchQuery ?? searchQuery;

    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (nextSearch.trim()) {
        params.set("search", nextSearch.trim());
      }
      params.set("activityAction", nextFilter);
      params.set("activityPage", String(nextPage));
      params.set("activityPageSize", String(activityPageSize));

      const response = await fetch(`/api/protected/admin/user-approvals?${params.toString()}`, {
        cache: "no-store",
      });

      const payload: ApprovalListResponse = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load approval queue.");
      }

      applyServerPayload(payload);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load approval queue.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    async function initialLoad() {
      await loadUsers({
        activityFilter: "all",
        activityPage: DEFAULT_ACTIVITY_PAGE,
      });
    }

    void initialLoad();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function updateUserRole(userId: string, fallbackRole: ManagedRole) {
    const role = selectedRoles[userId] ?? fallbackRole;

    setActiveUserId(userId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/protected/admin/user-approvals", {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          userId,
          role,
        }),
      });

      const payload: RoleUpdateResponse = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to approve user.");
      }

      if (payload.action === "revoked") {
        setSuccess("User access revoked and moved to pending.");
      } else if (payload.action === "role_changed") {
        setSuccess(`User role changed from ${roleLabel(payload.previousRole)} to ${roleLabel(payload.role)}.`);
      } else {
        setSuccess(`User approved as ${roleLabel(payload.role)}.`);
      }

      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update user role.");
    } finally {
      setActiveUserId(null);
    }
  }

  const pendingCount = pendingUsers.length;
  const approvedCount = approvedUsers.length;

  const recentApproved = useMemo(() => {
    return [...approvedUsers]
      .sort((a, b) => a.fullName.localeCompare(b.fullName))
      .slice(0, 12);
  }, [approvedUsers]);

  const activityRangeStart = activityTotal === 0 ? 0 : (activityPage - 1) * activityPageSize + 1;
  const activityRangeEnd = Math.min(activityPage * activityPageSize, activityTotal);

  function getActivityExportHref() {
    const params = new URLSearchParams();
    if (searchQuery.trim()) {
      params.set("search", searchQuery.trim());
    }
    params.set("activityAction", activityFilter);
    params.set("activityPage", String(activityPage));
    params.set("activityPageSize", String(activityPageSize));
    params.set("activityFormat", "csv");
    return `/api/protected/admin/user-approvals?${params.toString()}`;
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_16%_10%,#f4fbe7_0%,#eef8ff_36%,#f9f1e7_68%,#fefefe_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(130deg,rgba(16,185,129,.08),rgba(2,132,199,.08),rgba(249,115,22,.08))]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 md:px-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-rose-700">
              Admin Controls
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
              User Access Approval
            </h1>
            <p className="mt-2 text-sm text-slate-600 md:text-base">
              Review pending users and assign approved operational roles.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <input
              className="w-56 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm text-slate-700"
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search users"
              value={searchQuery}
            />
            <button
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              disabled={isLoading}
              onClick={() => {
                void loadUsers({ activityPage: DEFAULT_ACTIVITY_PAGE });
              }}
              type="button"
            >
              Apply Filters
            </button>
            <button
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              disabled={isLoading}
              onClick={() => {
                void loadUsers();
              }}
              type="button"
            >
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
            <Link
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              href="/dashboard"
            >
              Back to Dashboard
            </Link>
          </div>
        </header>

        {error ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {error}
          </p>
        ) : null}

        {success ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {success}
          </p>
        ) : null}

        <section className="grid gap-4 sm:grid-cols-2">
          <article className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[0_14px_30px_-22px_rgba(15,23,42,.55)]">
            <p className="text-xs uppercase tracking-wide text-slate-500">Pending Users</p>
            <p className="mt-2 text-2xl font-bold text-slate-800">{pendingCount}</p>
          </article>
          <article className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[0_14px_30px_-22px_rgba(15,23,42,.55)]">
            <p className="text-xs uppercase tracking-wide text-slate-500">Approved Users</p>
            <p className="mt-2 text-2xl font-bold text-slate-800">{approvedCount}</p>
          </article>
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Pending Approval Queue</h2>
            <span className="text-xs uppercase tracking-wide text-slate-500">
              {isLoading ? "Loading..." : `${pendingUsers.length} users`}
            </span>
          </div>

          <div className="mt-4 space-y-3">
            {pendingUsers.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                No pending users at the moment.
              </p>
            ) : (
              pendingUsers.map((user) => (
                <div className="rounded-xl border border-slate-200 bg-white p-3" key={user.id}>
                  <p className="text-sm font-semibold text-slate-800">{user.fullName}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    {user.email} | Joined {formatDateTime(user.createdAt)}
                    {user.lastSignInAt ? ` | Last sign-in ${formatDateTime(user.lastSignInAt)}` : ""}
                  </p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700"
                      onChange={(event) =>
                        setSelectedRoles((current) => ({
                          ...current,
                          [user.id]: event.target.value as ApprovalRole,
                        }))
                      }
                      value={selectedRoles[user.id] ?? "operator"}
                    >
                      {approvedRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button
                      className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
                      disabled={activeUserId === user.id}
                      onClick={() => {
                        void updateUserRole(user.id, "operator");
                      }}
                      type="button"
                    >
                      {activeUserId === user.id ? "Approving..." : "Approve User"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Recently Approved Users</h2>
            <span className="text-xs uppercase tracking-wide text-slate-500">
              {isLoading ? "Loading..." : `${recentApproved.length} shown`}
            </span>
          </div>

          <div className="mt-4 space-y-2">
            {recentApproved.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                No approved users found yet.
              </p>
            ) : (
              recentApproved.map((user) => (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700" key={user.id}>
                  <p className="font-medium">
                    {user.fullName} - <span className="uppercase">{user.role}</span>
                  </p>
                  <p className="text-xs text-slate-500">{user.email}</p>
                  <div className="mt-3 flex flex-wrap items-center gap-2">
                    <select
                      className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700"
                      onChange={(event) =>
                        setSelectedRoles((current) => ({
                          ...current,
                          [user.id]: event.target.value as ManagedRole,
                        }))
                      }
                      value={selectedRoles[user.id] ?? user.role}
                    >
                      <option value="pending">pending</option>
                      {approvedRoles.map((role) => (
                        <option key={role} value={role}>
                          {role}
                        </option>
                      ))}
                    </select>
                    <button
                      className="rounded-lg bg-slate-800 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                      disabled={
                        activeUserId === user.id ||
                        (selectedRoles[user.id] ?? user.role) === user.role
                      }
                      onClick={() => {
                        void updateUserRole(user.id, user.role);
                      }}
                      type="button"
                    >
                      {(selectedRoles[user.id] ?? user.role) === "pending" ? "Revoke Access" : "Update Role"}
                    </button>
                  </div>
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Recent Approval Activity</h2>
            <div className="flex items-center gap-2">
              <a
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-50"
                href={getActivityExportHref()}
                rel="noreferrer"
                target="_blank"
              >
                Export CSV
              </a>
              <select
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700"
                onChange={(event) => {
                  const nextFilter = event.target.value as ActivityFilter;
                  setActivityFilter(nextFilter);
                  void loadUsers({ activityFilter: nextFilter, activityPage: DEFAULT_ACTIVITY_PAGE });
                }}
                value={activityFilter}
              >
                <option value="all">all</option>
                <option value="approved">approved</option>
                <option value="revoked">revoked</option>
                <option value="role_changed">role changed</option>
              </select>
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {isLoading ? "Loading..." : `${activityRangeStart}-${activityRangeEnd} of ${activityTotal}`}
              </span>
            </div>
          </div>

          <div className="mt-4 space-y-2">
            {approvalEvents.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                No approval activity recorded yet.
              </p>
            ) : (
              approvalEvents.map((event) => (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700" key={event.id}>
                  <p className="font-medium">
                    <span className="rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                      {toTitleCaseAction(event.action)}
                    </span>{" "}
                    {event.targetDisplayName ?? event.targetUserId ?? "Unknown user"} -{" "}
                    <span className="uppercase">{roleLabel(event.role)}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    By {event.actorDisplayName ?? event.actorUserId} ({event.actorRole}) at {formatDateTime(event.createdAt)}
                  </p>
                  <p className="text-xs text-slate-500">
                    {event.targetEmail ?? "No target email"} | {event.actorEmail ?? "No actor email"}
                    {event.previousRole ? ` | from ${roleLabel(event.previousRole)}` : ""}
                  </p>
                </div>
              ))
            )}
          </div>

          <div className="mt-4 flex items-center justify-end gap-2">
            <button
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100"
              disabled={isLoading || activityPage <= 1}
              onClick={() => {
                const nextPage = Math.max(1, activityPage - 1);
                setActivityPage(nextPage);
                void loadUsers({ activityPage: nextPage });
              }}
              type="button"
            >
              Previous
            </button>
            <span className="text-xs text-slate-500">Page {activityPage} of {activityTotalPages}</span>
            <button
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 disabled:cursor-not-allowed disabled:bg-slate-100"
              disabled={isLoading || activityPage >= activityTotalPages}
              onClick={() => {
                const nextPage = Math.min(activityTotalPages, activityPage + 1);
                setActivityPage(nextPage);
                void loadUsers({ activityPage: nextPage });
              }}
              type="button"
            >
              Next
            </button>
          </div>
        </section>
      </main>
    </div>
  );
}
