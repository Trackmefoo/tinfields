"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { AlertEvent, AlertEventStatus, AlertSeverity } from "@/types";

type AlertEventsResponse = {
  items?: AlertEvent[];
  error?: string;
};

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

export default function AlertsPage() {
  const [items, setItems] = useState<AlertEvent[]>([]);
  const [statusFilter, setStatusFilter] = useState<AlertEventStatus | "all">("open");
  const [severityFilter, setSeverityFilter] = useState<AlertSeverity | "all">("all");
  const [isLoading, setIsLoading] = useState(true);
  const [activeAlertId, setActiveAlertId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadEvents() {
    setIsLoading(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      params.set("limit", "100");
      if (statusFilter !== "all") {
        params.set("status", statusFilter);
      }
      if (severityFilter !== "all") {
        params.set("severity", severityFilter);
      }

      const response = await fetch(`/api/protected/alerts/events?${params.toString()}`, {
        cache: "no-store",
      });

      const payload: AlertEventsResponse = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to load alerts.");
      }

      setItems(Array.isArray(payload.items) ? payload.items : []);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load alerts.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadEvents();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [statusFilter, severityFilter]);

  async function acknowledge(eventId: string) {
    setActiveAlertId(eventId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/protected/alerts/events/${eventId}/ack`, {
        method: "POST",
      });
      const payload: { error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to acknowledge alert.");
      }

      setSuccess("Alert acknowledged.");
      await loadEvents();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to acknowledge alert.");
    } finally {
      setActiveAlertId(null);
    }
  }

  const stats = useMemo(() => {
    return {
      open: items.filter((item) => item.status === "open").length,
      critical: items.filter((item) => item.severity === "critical").length,
      acknowledged: items.filter((item) => item.status === "acknowledged").length,
    };
  }, [items]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_14%_12%,#e2f7e4_0%,#f7f9e8_34%,#f5ede7_68%,#edf5ff_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgba(16,185,129,.08),rgba(245,158,11,.08),rgba(14,116,144,.08))]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 md:px-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-amber-700">Alert Center</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Incidents and Violations</h1>
            <p className="mt-2 text-sm text-slate-600 md:text-base">
              Monitor threshold violations and acknowledge alerts in real time.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              disabled={isLoading}
              onClick={() => {
                void loadEvents();
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

        <section className="grid gap-4 sm:grid-cols-3">
          <article className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[0_14px_30px_-22px_rgba(15,23,42,.55)]">
            <p className="text-xs uppercase tracking-wide text-slate-500">Open Alerts</p>
            <p className="mt-2 text-2xl font-bold text-slate-800">{stats.open}</p>
          </article>
          <article className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[0_14px_30px_-22px_rgba(15,23,42,.55)]">
            <p className="text-xs uppercase tracking-wide text-slate-500">Critical Alerts</p>
            <p className="mt-2 text-2xl font-bold text-rose-700">{stats.critical}</p>
          </article>
          <article className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[0_14px_30px_-22px_rgba(15,23,42,.55)]">
            <p className="text-xs uppercase tracking-wide text-slate-500">Acknowledged</p>
            <p className="mt-2 text-2xl font-bold text-slate-800">{stats.acknowledged}</p>
          </article>
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
          <div className="flex flex-wrap items-center gap-2">
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700"
              onChange={(event) => setStatusFilter(event.target.value as AlertEventStatus | "all")}
              value={statusFilter}
            >
              <option value="all">all status</option>
              <option value="open">open</option>
              <option value="acknowledged">acknowledged</option>
              <option value="resolved">resolved</option>
            </select>
            <select
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700"
              onChange={(event) => setSeverityFilter(event.target.value as AlertSeverity | "all")}
              value={severityFilter}
            >
              <option value="all">all severity</option>
              <option value="info">info</option>
              <option value="warning">warning</option>
              <option value="critical">critical</option>
            </select>
          </div>

          {error ? (
            <p className="mt-4 rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p>
          ) : null}
          {success ? (
            <p className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p>
          ) : null}

          <div className="mt-4 space-y-2">
            {items.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                No alert events for the selected filters.
              </p>
            ) : (
              items.map((item) => (
                <div className="rounded-xl border border-slate-200 bg-white px-3 py-3 text-sm text-slate-700" key={item.id}>
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      <span className="mr-2 rounded-full bg-slate-100 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                        {item.severity}
                      </span>
                      {item.message}
                    </p>
                    <span className="rounded-full border border-slate-300 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">
                      {item.status}
                    </span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">
                    Zone {item.zoneId ?? "n/a"} | Triggered value {item.triggeredValue} | {formatDateTime(item.createdAt)}
                  </p>
                  {item.status === "open" ? (
                    <div className="mt-3">
                      <button
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                        disabled={activeAlertId === item.id}
                        onClick={() => {
                          void acknowledge(item.id);
                        }}
                        type="button"
                      >
                        {activeAlertId === item.id ? "Acknowledging..." : "Acknowledge"}
                      </button>
                    </div>
                  ) : null}
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}
