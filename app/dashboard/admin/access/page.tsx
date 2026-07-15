"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";

type ApprovalRole = "operator" | "grow_manager" | "admin";

type UserApprovalItem = {
  id: string;
  email: string;
  fullName: string;
  createdAt: string;
  lastSignInAt?: string;
  role: ApprovalRole | "pending";
};

type ApprovalAuditItem = {
  id: string;
  createdAt: string;
  actorUserId: string;
  actorRole: ApprovalRole;
  approvedUserId?: string;
  approvedRole?: ApprovalRole;
};

type ApprovalListResponse = {
  items?: UserApprovalItem[];
  approvedUsers?: UserApprovalItem[];
  recentApprovalEvents?: ApprovalAuditItem[];
  approvedRoles?: ApprovalRole[];
  totalUsers?: number;
  error?: string;
};

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

function normalizeRoles(value: unknown): ApprovalRole[] {
  if (!Array.isArray(value)) {
    return ["operator", "grow_manager", "admin"];
  }

  const parsed = value.filter(isApprovalRole);
  if (parsed.length === 0) {
    return ["operator", "grow_manager", "admin"];
  }

  return parsed;
}

export default function AccessApprovalPage() {
  const [pendingUsers, setPendingUsers] = useState<UserApprovalItem[]>([]);
  const [approvedUsers, setApprovedUsers] = useState<UserApprovalItem[]>([]);
  const [approvalEvents, setApprovalEvents] = useState<ApprovalAuditItem[]>([]);
  const [approvedRoles, setApprovedRoles] = useState<ApprovalRole[]>([
    "operator",
    "grow_manager",
    "admin",
  ]);
  const [selectedRoles, setSelectedRoles] = useState<Record<string, ApprovalRole>>({});
  const [isLoading, setIsLoading] = useState(true);
  const [activeUserId, setActiveUserId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadUsers() {
    setIsLoading(true);
    setError(null);

    try {
      const response = await fetch("/api/protected/admin/user-approvals", {
        cache: "no-store",
      });

      const payload: ApprovalListResponse = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load approval queue.");
      }

      const pending = Array.isArray(payload.items) ? payload.items : [];
      const approved = Array.isArray(payload.approvedUsers) ? payload.approvedUsers : [];
      const events = Array.isArray(payload.recentApprovalEvents) ? payload.recentApprovalEvents : [];
      const roles = normalizeRoles(payload.approvedRoles);

      setPendingUsers(pending);
      setApprovedUsers(approved);
      setApprovalEvents(events);
      setApprovedRoles(roles);

      setSelectedRoles((current) => {
        const next = { ...current };
        pending.forEach((user) => {
          if (!next[user.id]) {
            next[user.id] = "operator";
          }
        });
        return next;
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load approval queue.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    async function initialLoad() {
      setIsLoading(true);
      setError(null);

      try {
        const response = await fetch("/api/protected/admin/user-approvals", {
          cache: "no-store",
        });

        const payload: ApprovalListResponse = await response.json().catch(() => ({}));
        if (!response.ok) {
          throw new Error(payload.error ?? "Unable to load approval queue.");
        }

        const pending = Array.isArray(payload.items) ? payload.items : [];
        const approved = Array.isArray(payload.approvedUsers) ? payload.approvedUsers : [];
        const events = Array.isArray(payload.recentApprovalEvents) ? payload.recentApprovalEvents : [];
        const roles = normalizeRoles(payload.approvedRoles);

        setPendingUsers(pending);
        setApprovedUsers(approved);
        setApprovalEvents(events);
        setApprovedRoles(roles);

        setSelectedRoles((current) => {
          const next = { ...current };
          pending.forEach((user) => {
            if (!next[user.id]) {
              next[user.id] = "operator";
            }
          });
          return next;
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load approval queue.");
      } finally {
        setIsLoading(false);
      }
    }

    void initialLoad();
  }, []);

  async function approveUser(userId: string) {
    const role = selectedRoles[userId] ?? "operator";

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

      const payload: { error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to approve user.");
      }

      setSuccess(`User approved as ${role}.`);
      await loadUsers();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to approve user.");
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
                        void approveUser(user.id);
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
                </div>
              ))
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Recent Approval Activity</h2>
            <span className="text-xs uppercase tracking-wide text-slate-500">
              {isLoading ? "Loading..." : `${approvalEvents.length} shown`}
            </span>
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
                    {event.approvedUserId ?? "Unknown user"} approved as{" "}
                    <span className="uppercase">{event.approvedRole ?? "operator"}</span>
                  </p>
                  <p className="text-xs text-slate-500">
                    By {event.actorUserId} ({event.actorRole}) at {formatDateTime(event.createdAt)}
                  </p>
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
