"use client";

import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import type { MessagingReadinessStatus, StoredAuditEvent } from "@/types";

type ReadinessResponse = {
  messaging: MessagingReadinessStatus;
  checkedAt: string;
};

type TestResponse = {
  ok: boolean;
  provider: "resend" | "fallback";
  usedFallback: boolean;
  error?: string;
  testedAt: string;
  readiness: MessagingReadinessStatus;
};

type AuditListResponse = {
  items?: StoredAuditEvent[];
};

type IntegrationReadinessLogItem = {
  id: string;
  createdAt: string;
  provider: "resend" | "fallback" | "unknown";
  usedFallback: boolean;
  delivered: boolean | null;
  error?: string;
};

function toRecord(value: unknown): Record<string, unknown> | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  return value as Record<string, unknown>;
}

function extractReadinessLogItems(events: StoredAuditEvent[]) {
  return events
    .filter((event) => event.action === "integration-readiness-test")
    .map<IntegrationReadinessLogItem>((event) => {
      const details = toRecord(event.details);
      const providerRaw = details?.provider;
      const usedFallbackRaw = details?.usedFallback;
      const deliveredRaw = details?.delivered;
      const errorRaw = details?.error;

      const provider =
        providerRaw === "resend" || providerRaw === "fallback" ? providerRaw : "unknown";

      return {
        id: event.id,
        createdAt: event.createdAt,
        provider,
        usedFallback: usedFallbackRaw === true,
        delivered: typeof deliveredRaw === "boolean" ? deliveredRaw : null,
        error: typeof errorRaw === "string" && errorRaw.trim() ? errorRaw : undefined,
      };
    })
    .slice(0, 12);
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

function IntegrationsReadinessContent() {
  const searchParams = useSearchParams();
  const [data, setData] = useState<ReadinessResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isTesting, setIsTesting] = useState(false);
  const [testMessage, setTestMessage] = useState("TinFields integration readiness test notification.");
  const [lastTest, setLastTest] = useState<TestResponse | null>(null);
  const [readinessLog, setReadinessLog] = useState<IntegrationReadinessLogItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  const providerFilter = searchParams.get("provider") ?? "all";
  const deliveryFilter = searchParams.get("delivery") ?? "all";

  const filteredReadinessLog = useMemo(() => {
    return readinessLog.filter((entry) => {
      if (providerFilter !== "all" && providerFilter !== entry.provider) {
        return false;
      }

      if (deliveryFilter === "delivered" && entry.delivered !== true) {
        return false;
      }
      if (deliveryFilter === "failed" && entry.delivered !== false) {
        return false;
      }
      if (deliveryFilter === "unknown" && entry.delivered !== null) {
        return false;
      }

      return true;
    });
  }, [deliveryFilter, providerFilter, readinessLog]);

  async function loadReadiness() {
    setIsLoading(true);
    setError(null);

    try {
      const [response, auditResponse] = await Promise.all([
        fetch("/api/protected/integrations/readiness", {
          cache: "no-store",
        }),
        fetch("/api/protected/audit?limit=120", {
          cache: "no-store",
        }),
      ]);

      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to load readiness.");
      }

      if (!auditResponse.ok) {
        const body: { error?: string } = await auditResponse.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to load readiness run log.");
      }

      const payload: ReadinessResponse = await response.json();
      const auditPayload: AuditListResponse = await auditResponse.json();

      setData(payload);
      setReadinessLog(
        extractReadinessLogItems(Array.isArray(auditPayload.items) ? auditPayload.items : []),
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load readiness.");
    } finally {
      setIsLoading(false);
    }
  }

  async function refreshReadinessLog() {
    const auditResponse = await fetch("/api/protected/audit?limit=120", {
      cache: "no-store",
    });

    if (!auditResponse.ok) {
      const body: { error?: string } = await auditResponse.json().catch(() => ({}));
      throw new Error(body.error ?? "Unable to load readiness run log.");
    }

    const auditPayload: AuditListResponse = await auditResponse.json();
    setReadinessLog(
      extractReadinessLogItems(Array.isArray(auditPayload.items) ? auditPayload.items : []),
    );
  }

  useEffect(() => {
    async function initialLoad() {
      try {
        const [response, auditResponse] = await Promise.all([
          fetch("/api/protected/integrations/readiness", {
            cache: "no-store",
          }),
          fetch("/api/protected/audit?limit=120", {
            cache: "no-store",
          }),
        ]);

        if (!response.ok) {
          const body: { error?: string } = await response.json().catch(() => ({}));
          throw new Error(body.error ?? "Unable to load readiness.");
        }

        if (!auditResponse.ok) {
          const body: { error?: string } = await auditResponse.json().catch(() => ({}));
          throw new Error(body.error ?? "Unable to load readiness run log.");
        }

        const payload: ReadinessResponse = await response.json();
        const auditPayload: AuditListResponse = await auditResponse.json();

        setData(payload);
        setReadinessLog(
          extractReadinessLogItems(Array.isArray(auditPayload.items) ? auditPayload.items : []),
        );
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load readiness.");
      } finally {
        setIsLoading(false);
      }
    }

    void initialLoad();
  }, []);

  async function runTest() {
    setIsTesting(true);
    setError(null);

    try {
      const response = await fetch("/api/protected/integrations/readiness", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          message: testMessage,
        }),
      });

      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to run readiness test.");
      }

      const payload: TestResponse = await response.json();
      setLastTest(payload);
      await refreshReadinessLog();
      setData((current) =>
        current
          ? {
              ...current,
              checkedAt: payload.testedAt,
              messaging: payload.readiness,
            }
          : {
              checkedAt: payload.testedAt,
              messaging: payload.readiness,
            },
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to run readiness test.");
    } finally {
      setIsTesting(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_16%_10%,#ecfbda_0%,#f6fde7_32%,#ecf4ff_62%,#f8eee5_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(130deg,rgba(16,185,129,.08),rgba(2,132,199,.08),rgba(249,115,22,.08))]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-8 px-6 py-10 md:px-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Integrations
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
              Messaging Readiness
            </h1>
            <p className="mt-2 text-sm text-slate-600 md:text-base">
              Validate provider config and run a test notification with fallback visibility.
            </p>
            {providerFilter !== "all" || deliveryFilter !== "all" ? (
              <p className="mt-2 text-xs text-slate-500">
                Scoped log: provider {providerFilter} | delivery {deliveryFilter}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <button
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              disabled={isLoading}
              onClick={() => {
                void loadReadiness();
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

        <section className="grid gap-4 md:grid-cols-2">
          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Current Status</h2>
            {data ? (
              <div className="mt-4 space-y-2 text-sm text-slate-700">
                <p>
                  Provider mode: <strong>{data.messaging.provider}</strong>
                </p>
                <p>
                  Provider configured: <strong>{data.messaging.providerConfigured ? "Yes" : "No"}</strong>
                </p>
                <p>
                  ALERT_FROM_EMAIL configured: <strong>{data.messaging.fromConfigured ? "Yes" : "No"}</strong>
                </p>
                <p>
                  ALERT_TO_EMAIL configured: <strong>{data.messaging.toConfigured ? "Yes" : "No"}</strong>
                </p>
                <p>
                  Healthy: <strong>{data.messaging.healthy ? "Yes" : "No"}</strong>
                </p>
                <p className="text-xs text-slate-500">Last checked: {formatDateTime(data.checkedAt)}</p>
              </div>
            ) : (
              <p className="mt-4 text-sm text-slate-600">No readiness data loaded yet.</p>
            )}
          </article>

          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Run Test Notification</h2>
            <div className="mt-4 grid gap-3">
              <textarea
                className="min-h-20 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                onChange={(event) => setTestMessage(event.target.value)}
                value={testMessage}
              />
              <button
                className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-300"
                disabled={isTesting}
                onClick={() => {
                  void runTest();
                }}
                type="button"
              >
                {isTesting ? "Running Test..." : "Send Test Notification"}
              </button>
            </div>
            {lastTest ? (
              <div className="mt-4 rounded-xl border border-slate-200 bg-slate-50 px-3 py-3 text-sm text-slate-700">
                <p>
                  Result: <strong>{lastTest.ok ? "Success" : "Failed"}</strong>
                </p>
                <p>
                  Provider used: <strong>{lastTest.provider}</strong>
                </p>
                <p>
                  Used fallback: <strong>{lastTest.usedFallback ? "Yes" : "No"}</strong>
                </p>
                {lastTest.error ? <p>Error: {lastTest.error}</p> : null}
                <p className="text-xs text-slate-500">Tested: {formatDateTime(lastTest.testedAt)}</p>
              </div>
            ) : null}
          </article>
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm" id="readiness-log">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Recent Readiness Test Log</h2>
            <span className="text-xs uppercase tracking-wide text-slate-500">
              {isLoading ? "Loading..." : `${filteredReadinessLog.length} entries`}
            </span>
          </div>
          <div className="mt-4 space-y-2">
            {filteredReadinessLog.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                No readiness test attempts have been recorded yet.
              </p>
            ) : (
              filteredReadinessLog.map((entry) => (
                <div
                  className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                  key={entry.id}
                >
                  <p className="font-medium">
                    {entry.delivered === null
                      ? "Unknown delivery state"
                      : entry.delivered
                        ? "Delivered"
                        : "Delivery failed"}
                    {` via ${entry.provider}`}
                  </p>
                  <p className="text-xs text-slate-500">
                    {entry.usedFallback ? "Fallback used" : "Primary path used"} | {formatDateTime(entry.createdAt)}
                  </p>
                  {entry.error ? <p className="text-xs text-amber-700">Error: {entry.error}</p> : null}
                </div>
              ))
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

export default function IntegrationsReadinessPage() {
  return (
    <Suspense fallback={null}>
      <IntegrationsReadinessContent />
    </Suspense>
  );
}
