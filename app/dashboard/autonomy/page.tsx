"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@clerk/nextjs";

type RecommendationRisk = "low" | "high";
type RecommendationStatus = "proposed" | "approved" | "rejected" | "executed" | "blocked";

type RecommendationItem = {
  id: string;
  zoneId: string;
  metric: string;
  currentValue: number;
  targetValue: number;
  deviation: number;
  riskLevel: RecommendationRisk;
  status: RecommendationStatus;
  title: string;
  rationale: string;
  recommendedAction: string;
  command: string;
  blockedReason?: string;
  decidedByUserId?: string;
  createdAt: string;
};

type EvalSummary = {
  created: RecommendationItem[];
  executed: RecommendationItem[];
  pendingApproval: RecommendationItem[];
  blocked: RecommendationItem[];
};

const DEFAULT_FARM_ID = "demo-farm";

function formatSigned(value: number) {
  if (value > 0) {
    return `+${value.toFixed(2)}`;
  }

  return value.toFixed(2);
}

export default function AutonomyPage() {
  const { getToken } = useAuth();
  const [farmId, setFarmId] = useState(DEFAULT_FARM_ID);
  const [statusFilter, setStatusFilter] = useState<RecommendationStatus | "all">("all");
  const [riskFilter, setRiskFilter] = useState<RecommendationRisk | "all">("all");
  const [items, setItems] = useState<RecommendationItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [running, setRunning] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [summary, setSummary] = useState<EvalSummary | null>(null);

  const loadRecommendations = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const token = await getToken();
      const params = new URLSearchParams({
        farmId,
        limit: "100",
      });

      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (riskFilter !== "all") {
        params.set("riskLevel", riskFilter);
      }

      const response = await fetch(`/api/protected/autonomy/recommendations?${params.toString()}`, {
        headers: token ? { Authorization: `Bearer ${token}` } : undefined,
        cache: "no-store",
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Failed to load recommendations");
      }

      const payload = (await response.json()) as { items?: RecommendationItem[] };
      setItems(payload.items ?? []);
    } catch (loadError) {
      setError(loadError instanceof Error ? loadError.message : "Failed to load recommendations");
    } finally {
      setLoading(false);
    }
  }, [farmId, getToken, riskFilter, statusFilter]);

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadRecommendations();
  }, [loadRecommendations]);

  const runEvaluator = useCallback(async () => {
    setRunning(true);
    setError(null);
    setMessage(null);
    try {
      const token = await getToken();
      const response = await fetch("/api/protected/autonomy/evaluate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(token ? { Authorization: `Bearer ${token}` } : {}),
        },
        body: JSON.stringify({ farmId }),
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => null)) as { error?: string } | null;
        throw new Error(payload?.error || "Autonomy evaluation failed");
      }

      const payload = (await response.json()) as EvalSummary;
      setSummary(payload);
      setMessage(
        `Evaluator created ${payload.created.length} recommendation(s), auto-executed ${payload.executed.length}, and left ${payload.pendingApproval.length} awaiting approval.`,
      );
      await loadRecommendations();
    } catch (runError) {
      setError(runError instanceof Error ? runError.message : "Autonomy evaluation failed");
    } finally {
      setRunning(false);
    }
  }, [farmId, getToken, loadRecommendations]);

  const decide = useCallback(
    async (item: RecommendationItem, decision: "approve" | "reject") => {
      setError(null);
      setMessage(null);
      try {
        const token = await getToken();
        const response = await fetch(`/api/protected/autonomy/recommendations/${item.id}/decision`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            ...(token ? { Authorization: `Bearer ${token}` } : {}),
          },
          body: JSON.stringify({ decision }),
        });

        if (!response.ok) {
          const payload = (await response.json().catch(() => null)) as { error?: string } | null;
          throw new Error(payload?.error || `Failed to ${decision} recommendation`);
        }

        setMessage(`Recommendation ${decision}d.`);
        await loadRecommendations();
      } catch (decisionError) {
        setError(decisionError instanceof Error ? decisionError.message : `Failed to ${decision} recommendation`);
      }
    },
    [getToken, loadRecommendations],
  );

  const counts = useMemo(() => {
    return items.reduce(
      (acc, item) => {
        acc.total += 1;
        acc[item.status] += 1;
        return acc;
      },
      {
        total: 0,
        proposed: 0,
        approved: 0,
        rejected: 0,
        executed: 0,
        blocked: 0,
      },
    );
  }, [items]);

  return (
    <main className="mx-auto flex w-full max-w-6xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="rounded-2xl border border-emerald-200 bg-gradient-to-br from-white to-emerald-50 p-6">
        <h1 className="text-2xl font-semibold text-emerald-900">Autonomy Loop</h1>
        <p className="mt-2 max-w-3xl text-sm text-emerald-800">
          Evaluates active zone recipes against latest telemetry and proposes actions with explicit rationale. Low-risk actions execute immediately; high-risk actions require grow manager approval.
        </p>

        <div className="mt-4 flex flex-wrap items-end gap-3">
          <label className="flex flex-col gap-1 text-xs font-medium text-emerald-900">
            Farm ID
            <input
              className="h-9 rounded-md border border-emerald-300 bg-white px-3 text-sm text-emerald-900"
              value={farmId}
              onChange={(event) => setFarmId(event.target.value)}
            />
          </label>

          <button
            type="button"
            onClick={runEvaluator}
            disabled={running || !farmId.trim()}
            className="h-9 rounded-md bg-emerald-600 px-4 text-sm font-medium text-white hover:bg-emerald-700 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {running ? "Running evaluator..." : "Run Evaluator"}
          </button>

          <button
            type="button"
            onClick={() => void loadRecommendations()}
            disabled={loading}
            className="h-9 rounded-md border border-emerald-300 bg-white px-4 text-sm font-medium text-emerald-800 hover:bg-emerald-100 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {loading ? "Refreshing..." : "Refresh"}
          </button>
        </div>
      </header>

      <section className="grid gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <div className="rounded-xl border border-slate-200 bg-white p-3 text-sm">
          <p className="text-slate-500">Total</p>
          <p className="text-lg font-semibold text-slate-900">{counts.total}</p>
        </div>
        <div className="rounded-xl border border-amber-200 bg-amber-50 p-3 text-sm">
          <p className="text-amber-700">Proposed</p>
          <p className="text-lg font-semibold text-amber-900">{counts.proposed}</p>
        </div>
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 p-3 text-sm">
          <p className="text-emerald-700">Executed</p>
          <p className="text-lg font-semibold text-emerald-900">{counts.executed}</p>
        </div>
        <div className="rounded-xl border border-rose-200 bg-rose-50 p-3 text-sm">
          <p className="text-rose-700">Blocked</p>
          <p className="text-lg font-semibold text-rose-900">{counts.blocked}</p>
        </div>
        <div className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-sm">
          <p className="text-slate-700">Rejected</p>
          <p className="text-lg font-semibold text-slate-900">{counts.rejected}</p>
        </div>
        <div className="rounded-xl border border-indigo-200 bg-indigo-50 p-3 text-sm">
          <p className="text-indigo-700">Approved</p>
          <p className="text-lg font-semibold text-indigo-900">{counts.approved}</p>
        </div>
      </section>

      <section className="flex flex-wrap gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
          Status
          <select
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as RecommendationStatus | "all")}
            className="h-9 min-w-40 rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            <option value="all">All statuses</option>
            <option value="proposed">Proposed</option>
            <option value="approved">Approved</option>
            <option value="executed">Executed</option>
            <option value="blocked">Blocked</option>
            <option value="rejected">Rejected</option>
          </select>
        </label>

        <label className="flex flex-col gap-1 text-xs font-medium text-slate-700">
          Risk
          <select
            value={riskFilter}
            onChange={(event) => setRiskFilter(event.target.value as RecommendationRisk | "all")}
            className="h-9 min-w-32 rounded-md border border-slate-300 bg-white px-2 text-sm"
          >
            <option value="all">All risk levels</option>
            <option value="low">Low</option>
            <option value="high">High</option>
          </select>
        </label>
      </section>

      {message ? <p className="rounded-md border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">{message}</p> : null}
      {error ? <p className="rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-sm text-rose-700">{error}</p> : null}

      {summary ? (
        <section className="rounded-xl border border-slate-200 bg-white p-4 text-sm text-slate-700">
          <h2 className="text-base font-semibold text-slate-900">Last Evaluator Run</h2>
          <p className="mt-2">
            Created {summary.created.length}, auto-executed {summary.executed.length}, pending approval {summary.pendingApproval.length}, blocked {summary.blocked.length}.
          </p>
        </section>
      ) : null}

      <section className="space-y-3">
        {loading ? <p className="text-sm text-slate-600">Loading recommendations...</p> : null}
        {!loading && items.length === 0 ? <p className="text-sm text-slate-600">No recommendations match the current filters.</p> : null}

        {items.map((item) => {
          const isPendingApproval = item.status === "proposed" && item.riskLevel === "high";

          return (
            <article key={item.id} className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <h3 className="text-base font-semibold text-slate-900">{item.title}</h3>
                  <p className="mt-1 text-xs uppercase tracking-wide text-slate-500">
                    Zone {item.zoneId} | Metric {item.metric} | Status {item.status} | Risk {item.riskLevel}
                  </p>
                </div>
                <p className="text-xs text-slate-500">{new Date(item.createdAt).toLocaleString()}</p>
              </div>

              <div className="mt-3 grid gap-2 text-sm text-slate-700 sm:grid-cols-2 lg:grid-cols-4">
                <p>
                  Current: <span className="font-medium text-slate-900">{item.currentValue.toFixed(2)}</span>
                </p>
                <p>
                  Target: <span className="font-medium text-slate-900">{item.targetValue.toFixed(2)}</span>
                </p>
                <p>
                  Deviation: <span className="font-medium text-slate-900">{formatSigned(item.deviation)}</span>
                </p>
                <p>
                  Command: <span className="font-medium text-slate-900">{item.command}</span>
                </p>
              </div>

              <p className="mt-3 text-sm text-slate-800">
                <span className="font-semibold">Why this action:</span> {item.rationale}
              </p>

              <p className="mt-1 text-sm text-slate-700">
                <span className="font-semibold">Recommended action:</span> {item.recommendedAction}
              </p>

              {item.blockedReason ? (
                <p className="mt-2 rounded-md border border-rose-200 bg-rose-50 px-3 py-2 text-xs text-rose-700">
                  Blocked reason: {item.blockedReason}
                </p>
              ) : null}

              {isPendingApproval ? (
                <div className="mt-3 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void decide(item, "approve")}
                    className="h-8 rounded-md bg-emerald-600 px-3 text-xs font-medium text-white hover:bg-emerald-700"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void decide(item, "reject")}
                    className="h-8 rounded-md border border-slate-300 bg-white px-3 text-xs font-medium text-slate-800 hover:bg-slate-100"
                  >
                    Reject
                  </button>
                </div>
              ) : null}
            </article>
          );
        })}
      </section>
    </main>
  );
}
