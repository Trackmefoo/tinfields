"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { StoredAuditEvent, YieldKpiResponse } from "@/types";

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

function formatDelta(current: number, previous: number, suffix = "") {
  const delta = current - previous;
  const sign = delta > 0 ? "+" : "";
  return `${sign}${delta.toFixed(2)}${suffix}`;
}

type CropComparisonRow = {
  cropKey: string;
  currentUsable: number;
  previousUsable: number;
  currentRejectRate: number;
  previousRejectRate: number;
};

type ProfileComparisonRow = {
  profileKey: string;
  cropName: string;
  cultivar?: string;
  zoneId: string;
  currentUsable: number;
  previousUsable: number;
  usableDelta: number;
  currentRejectRate: number;
  previousRejectRate: number;
  rejectRateDelta: number;
};

type ZoneTrendRow = {
  zoneId: string;
  currentUsable: number;
  previousUsable: number;
  usableDelta: number;
  currentRejectRate: number;
  previousRejectRate: number;
  rejectRateDelta: number;
  currentBatchCount: number;
  previousBatchCount: number;
};

type OpsEvidenceRow = {
  id: string;
  action: string;
  createdAt: string;
  title: string;
  detail: string;
  links: Array<{
    href: string;
    label: string;
  }>;
};

function getDetailsString(details: Record<string, unknown> | undefined, key: string) {
  const value = details?.[key];
  if (typeof value !== "string") {
    return undefined;
  }
  return value;
}

export default function YieldDashboardPage() {
  const [windowDays, setWindowDays] = useState(120);
  const [currentData, setCurrentData] = useState<YieldKpiResponse | null>(null);
  const [previousData, setPreviousData] = useState<YieldKpiResponse | null>(null);
  const [auditEvents, setAuditEvents] = useState<StoredAuditEvent[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadYieldData() {
      setIsLoading(true);
      setError(null);

      try {
        const [currentResponse, previousResponse, auditResponse] = await Promise.all([
          fetch(`/api/protected/yield-kpi?windowDays=${windowDays}`, {
            cache: "no-store",
          }),
          fetch(
            `/api/protected/yield-kpi?windowDays=${windowDays}&offsetDays=${windowDays}`,
            {
              cache: "no-store",
            },
          ),
          fetch(`/api/protected/audit?limit=180`, {
            cache: "no-store",
          }),
        ]);

        if (!currentResponse.ok || !previousResponse.ok) {
          const failedResponse = !currentResponse.ok
            ? currentResponse
            : previousResponse;
          const body: { error?: string } = await failedResponse
            .json()
            .catch(() => ({}));
          throw new Error(body.error ?? "Unable to load yield KPIs.");
        }

        const [currentPayload, previousPayload] = (await Promise.all([
          currentResponse.json(),
          previousResponse.json(),
        ])) as [YieldKpiResponse, YieldKpiResponse];

        let fetchedAuditEvents: StoredAuditEvent[] = [];
        if (auditResponse.ok) {
          const auditPayload = (await auditResponse.json()) as { items?: unknown };
          if (Array.isArray(auditPayload.items)) {
            fetchedAuditEvents = auditPayload.items as StoredAuditEvent[];
          }
        }

        setCurrentData(currentPayload);
        setPreviousData(previousPayload);
        setAuditEvents(fetchedAuditEvents);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load yield KPIs.");
        setAuditEvents([]);
      } finally {
        setIsLoading(false);
      }
    }

    void loadYieldData();
  }, [windowDays]);

  const cards = useMemo(() => {
    if (!currentData || !previousData) {
      return [];
    }

    return [
      {
        label: "Harvested Batches",
        value: String(currentData.summary.harvestedBatchCount),
        delta: formatDelta(
          currentData.summary.harvestedBatchCount,
          previousData.summary.harvestedBatchCount,
        ),
      },
      {
        label: "Usable Yield",
        value: `${currentData.summary.totalUsableWeightKg.toFixed(2)} kg`,
        delta: formatDelta(
          currentData.summary.totalUsableWeightKg,
          previousData.summary.totalUsableWeightKg,
          " kg",
        ),
      },
      {
        label: "Reject Weight",
        value: `${currentData.summary.totalRejectWeightKg.toFixed(2)} kg`,
        delta: formatDelta(
          currentData.summary.totalRejectWeightKg,
          previousData.summary.totalRejectWeightKg,
          " kg",
        ),
      },
      {
        label: "Average Cycle",
        value: `${currentData.summary.avgCycleDays.toFixed(2)} days`,
        delta: formatDelta(
          currentData.summary.avgCycleDays,
          previousData.summary.avgCycleDays,
          " days",
        ),
      },
      {
        label: "Average Reject Rate",
        value: `${currentData.summary.avgRejectRatePct.toFixed(2)}%`,
        delta: formatDelta(
          currentData.summary.avgRejectRatePct,
          previousData.summary.avgRejectRatePct,
          "%",
        ),
      },
    ];
  }, [currentData, previousData]);

  const windowSummary = useMemo(() => {
    if (!currentData || !previousData) {
      return null;
    }

    return {
      current: `${formatDateTime(currentData.windowStart)} - ${formatDateTime(
        currentData.windowEnd,
      )}`,
      previous: `${formatDateTime(previousData.windowStart)} - ${formatDateTime(
        previousData.windowEnd,
      )}`,
    };
  }, [currentData, previousData]);

  const cropComparisonRows = useMemo(() => {
    if (!currentData || !previousData) {
      return [];
    }

    const byCrop = new Map<
      string,
      {
        currentUsable: number;
        currentReject: number;
        currentTotal: number;
        previousUsable: number;
        previousReject: number;
        previousTotal: number;
      }
    >();

    for (const item of currentData.items) {
      const key = item.cultivar
        ? `${item.cropName} / ${item.cultivar}`
        : item.cropName;
      const entry =
        byCrop.get(key) ??
        {
          currentUsable: 0,
          currentReject: 0,
          currentTotal: 0,
          previousUsable: 0,
          previousReject: 0,
          previousTotal: 0,
        };

      entry.currentUsable += item.usableWeightKg;
      entry.currentReject += item.rejectWeightKg;
      entry.currentTotal += item.usableWeightKg + item.rejectWeightKg;
      byCrop.set(key, entry);
    }

    for (const item of previousData.items) {
      const key = item.cultivar
        ? `${item.cropName} / ${item.cultivar}`
        : item.cropName;
      const entry =
        byCrop.get(key) ??
        {
          currentUsable: 0,
          currentReject: 0,
          currentTotal: 0,
          previousUsable: 0,
          previousReject: 0,
          previousTotal: 0,
        };

      entry.previousUsable += item.usableWeightKg;
      entry.previousReject += item.rejectWeightKg;
      entry.previousTotal += item.usableWeightKg + item.rejectWeightKg;
      byCrop.set(key, entry);
    }

    const rows: CropComparisonRow[] = Array.from(byCrop.entries()).map(
      ([cropKey, value]) => ({
        cropKey,
        currentUsable: value.currentUsable,
        previousUsable: value.previousUsable,
        currentRejectRate:
          value.currentTotal > 0
            ? (value.currentReject / value.currentTotal) * 100
            : 0,
        previousRejectRate:
          value.previousTotal > 0
            ? (value.previousReject / value.previousTotal) * 100
            : 0,
      }),
    );

    rows.sort((a, b) => b.currentUsable - a.currentUsable);
    return rows;
  }, [currentData, previousData]);

  const profileComparisonRows = useMemo(() => {
    if (!currentData || !previousData) {
      return [];
    }

    const byProfile = new Map<
      string,
      {
        cropName: string;
        cultivar?: string;
        zoneId: string;
        currentUsable: number;
        currentReject: number;
        currentTotal: number;
        previousUsable: number;
        previousReject: number;
        previousTotal: number;
      }
    >();

    for (const item of currentData.items) {
      const key = `${item.cropName}::${item.cultivar ?? ""}::${item.zoneId}`;
      const entry =
        byProfile.get(key) ??
        {
          cropName: item.cropName,
          cultivar: item.cultivar,
          zoneId: item.zoneId,
          currentUsable: 0,
          currentReject: 0,
          currentTotal: 0,
          previousUsable: 0,
          previousReject: 0,
          previousTotal: 0,
        };

      entry.currentUsable += item.usableWeightKg;
      entry.currentReject += item.rejectWeightKg;
      entry.currentTotal += item.usableWeightKg + item.rejectWeightKg;
      byProfile.set(key, entry);
    }

    for (const item of previousData.items) {
      const key = `${item.cropName}::${item.cultivar ?? ""}::${item.zoneId}`;
      const entry =
        byProfile.get(key) ??
        {
          cropName: item.cropName,
          cultivar: item.cultivar,
          zoneId: item.zoneId,
          currentUsable: 0,
          currentReject: 0,
          currentTotal: 0,
          previousUsable: 0,
          previousReject: 0,
          previousTotal: 0,
        };

      entry.previousUsable += item.usableWeightKg;
      entry.previousReject += item.rejectWeightKg;
      entry.previousTotal += item.usableWeightKg + item.rejectWeightKg;
      byProfile.set(key, entry);
    }

    const rows: ProfileComparisonRow[] = Array.from(byProfile.entries()).map(
      ([profileKey, value]) => {
        const currentRejectRate =
          value.currentTotal > 0
            ? (value.currentReject / value.currentTotal) * 100
            : 0;
        const previousRejectRate =
          value.previousTotal > 0
            ? (value.previousReject / value.previousTotal) * 100
            : 0;

        return {
          profileKey,
          cropName: value.cropName,
          cultivar: value.cultivar,
          zoneId: value.zoneId,
          currentUsable: value.currentUsable,
          previousUsable: value.previousUsable,
          usableDelta: value.currentUsable - value.previousUsable,
          currentRejectRate,
          previousRejectRate,
          rejectRateDelta: currentRejectRate - previousRejectRate,
        };
      },
    );

    rows.sort((a, b) => b.usableDelta - a.usableDelta);
    return rows;
  }, [currentData, previousData]);

  const topImprovers = useMemo(
    () => profileComparisonRows.filter((row) => row.usableDelta > 0).slice(0, 5),
    [profileComparisonRows],
  );

  const topRegressions = useMemo(
    () => profileComparisonRows.filter((row) => row.usableDelta < 0).slice(-5).reverse(),
    [profileComparisonRows],
  );

  const zoneTrendRows = useMemo(() => {
    if (!currentData || !previousData) {
      return [];
    }

    const byZone = new Map<
      string,
      {
        currentUsable: number;
        currentReject: number;
        currentTotal: number;
        currentBatchCount: number;
        previousUsable: number;
        previousReject: number;
        previousTotal: number;
        previousBatchCount: number;
      }
    >();

    for (const item of currentData.items) {
      const entry =
        byZone.get(item.zoneId) ??
        {
          currentUsable: 0,
          currentReject: 0,
          currentTotal: 0,
          currentBatchCount: 0,
          previousUsable: 0,
          previousReject: 0,
          previousTotal: 0,
          previousBatchCount: 0,
        };

      entry.currentUsable += item.usableWeightKg;
      entry.currentReject += item.rejectWeightKg;
      entry.currentTotal += item.usableWeightKg + item.rejectWeightKg;
      entry.currentBatchCount += 1;
      byZone.set(item.zoneId, entry);
    }

    for (const item of previousData.items) {
      const entry =
        byZone.get(item.zoneId) ??
        {
          currentUsable: 0,
          currentReject: 0,
          currentTotal: 0,
          currentBatchCount: 0,
          previousUsable: 0,
          previousReject: 0,
          previousTotal: 0,
          previousBatchCount: 0,
        };

      entry.previousUsable += item.usableWeightKg;
      entry.previousReject += item.rejectWeightKg;
      entry.previousTotal += item.usableWeightKg + item.rejectWeightKg;
      entry.previousBatchCount += 1;
      byZone.set(item.zoneId, entry);
    }

    const rows: ZoneTrendRow[] = Array.from(byZone.entries()).map(
      ([zoneId, value]) => {
        const currentRejectRate =
          value.currentTotal > 0
            ? (value.currentReject / value.currentTotal) * 100
            : 0;
        const previousRejectRate =
          value.previousTotal > 0
            ? (value.previousReject / value.previousTotal) * 100
            : 0;

        return {
          zoneId,
          currentUsable: value.currentUsable,
          previousUsable: value.previousUsable,
          usableDelta: value.currentUsable - value.previousUsable,
          currentRejectRate,
          previousRejectRate,
          rejectRateDelta: currentRejectRate - previousRejectRate,
          currentBatchCount: value.currentBatchCount,
          previousBatchCount: value.previousBatchCount,
        };
      },
    );

    rows.sort((a, b) => b.usableDelta - a.usableDelta);
    return rows;
  }, [currentData, previousData]);

  const opsEvidenceRows = useMemo(() => {
    if (!auditEvents.length) {
      return [];
    }

    const regressingProfileKeys = new Set(
      topRegressions.map((row) => row.profileKey),
    );
    const regressingZones = new Set(
      zoneTrendRows
        .filter((row) => row.usableDelta < 0 || row.rejectRateDelta > 0)
        .map((row) => row.zoneId),
    );

    const globallyRelevantActions = new Set([
      "integration-readiness-test",
      "update-crop-catalog-item",
      "update-batch-zone-assignment",
    ]);

    const relevantActions = new Set([
      "integration-readiness-test",
      "update-crop-catalog-item",
      "update-batch-zone-assignment",
      "assign-batch-zone",
      "log-harvest",
      "create-planting-batch",
    ]);

    return auditEvents
      .filter((event) => relevantActions.has(event.action))
      .map<OpsEvidenceRow | null>((event) => {
        const details = event.details;
        const zoneId = getDetailsString(details, "zoneId");
        const cropName = getDetailsString(details, "cropName");
        const cultivar = getDetailsString(details, "cultivar") ?? "";
        const profileKey =
          zoneId && cropName ? `${cropName}::${cultivar}::${zoneId}` : undefined;

        const matchesRegressingZone = !!zoneId && regressingZones.has(zoneId);
        const matchesRegressingProfile =
          !!profileKey && regressingProfileKeys.has(profileKey);
        const globallyRelevant = globallyRelevantActions.has(event.action);

        if (!matchesRegressingZone && !matchesRegressingProfile && !globallyRelevant) {
          return null;
        }

        switch (event.action) {
          case "log-harvest": {
            const finalized =
              typeof details?.finalized === "boolean" ? details.finalized : false;
            return {
              id: event.id,
              action: event.action,
              createdAt: event.createdAt,
              title: finalized
                ? "Harvest finalized in monitored area"
                : "Harvest logged in monitored area",
              detail: `Zone ${zoneId ?? "unknown"}`,
              links: [
                {
                  href: "/dashboard",
                  label: "Open Dashboard",
                },
                {
                  href: "/dashboard/yield",
                  label: "Open Yield",
                },
              ],
            };
          }
          case "assign-batch-zone":
          case "update-batch-zone-assignment":
            return {
              id: event.id,
              action: event.action,
              createdAt: event.createdAt,
              title: "Zone assignment lifecycle changed",
              detail: `Zone ${zoneId ?? "unknown"}`,
              links: [
                {
                  href: "/dashboard/catalog",
                  label: "Open Catalog",
                },
                {
                  href: "/dashboard/yield",
                  label: "Open Yield",
                },
              ],
            };
          case "create-planting-batch":
            return {
              id: event.id,
              action: event.action,
              createdAt: event.createdAt,
              title: "New planting batch entered",
              detail: `${cropName ?? "Crop"}${zoneId ? ` in ${zoneId}` : ""}`,
              links: [
                {
                  href: "/dashboard",
                  label: "Open Dashboard",
                },
                {
                  href: "/dashboard/yield",
                  label: "Open Yield",
                },
              ],
            };
          case "update-crop-catalog-item":
            return {
              id: event.id,
              action: event.action,
              createdAt: event.createdAt,
              title: "Crop catalog recipe changed",
              detail: "Catalog item fields were updated",
              links: [
                {
                  href: "/dashboard/catalog",
                  label: "Open Catalog",
                },
                {
                  href: "/dashboard/yield",
                  label: "Open Yield",
                },
              ],
            };
          case "integration-readiness-test": {
            const provider = getDetailsString(details, "provider") ?? "unknown provider";
            const delivered =
              typeof details?.delivered === "boolean" ? details.delivered : false;
            return {
              id: event.id,
              action: event.action,
              createdAt: event.createdAt,
              title: delivered
                ? "Messaging readiness test succeeded"
                : "Messaging readiness test failed",
              detail: `Provider: ${provider}`,
              links: [
                {
                  href: "/dashboard/integrations",
                  label: "Open Integrations",
                },
                {
                  href: "/dashboard/yield",
                  label: "Open Yield",
                },
              ],
            };
          }
          default:
            return {
              id: event.id,
              action: event.action,
              createdAt: event.createdAt,
              title: "Operational change detected",
              detail: event.targetType,
              links: [
                {
                  href: "/dashboard",
                  label: "Open Dashboard",
                },
              ],
            };
        }
      })
      .filter((item): item is OpsEvidenceRow => item !== null)
      .slice(0, 12);
  }, [auditEvents, topRegressions, zoneTrendRows]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_15%_12%,#e8f9da_0%,#f5fde7_28%,#eef7ff_60%,#f8f1e6_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(16,185,129,.08),rgba(14,116,144,.08),rgba(245,158,11,.08))]" />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 md:px-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Yield Intelligence
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
              Crop Performance Window
            </h1>
            <p className="mt-2 text-sm text-slate-600 md:text-base">
              Compare current output against the previous matching window.
            </p>
            {windowSummary ? (
              <p className="mt-2 text-xs text-slate-500">
                Current: {windowSummary.current} | Previous: {windowSummary.previous}
              </p>
            ) : null}
          </div>
          <div className="flex items-center gap-3">
            <label className="text-sm font-medium text-slate-700" htmlFor="windowDays">
              Window
            </label>
            <select
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
              id="windowDays"
              onChange={(event) => setWindowDays(Number(event.target.value))}
              value={windowDays}
            >
              <option value={30}>30 days</option>
              <option value={90}>90 days</option>
              <option value={120}>120 days</option>
              <option value={180}>180 days</option>
              <option value={365}>365 days</option>
            </select>
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

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-5">
          {cards.map((card) => (
            <article
              className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[0_14px_30px_-22px_rgba(15,23,42,.55)]"
              key={card.label}
            >
              <p className="text-xs uppercase tracking-wide text-slate-500">{card.label}</p>
              <p className="mt-2 text-2xl font-bold text-slate-800">{card.value}</p>
              <p className="mt-1 text-xs text-slate-500">
                vs prior window: <span className="font-semibold text-slate-700">{card.delta}</span>
              </p>
            </article>
          ))}
          {isLoading && cards.length === 0 ? (
            <article className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600 sm:col-span-2 xl:col-span-5">
              Loading yield KPIs...
            </article>
          ) : null}
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Crop Comparison</h2>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {isLoading ? "Refreshing..." : `${cropComparisonRows.length} crops`}
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Crop</th>
                  <th className="px-3 py-2">Usable (Current)</th>
                  <th className="px-3 py-2">Usable (Previous)</th>
                  <th className="px-3 py-2">Delta</th>
                  <th className="px-3 py-2">Reject % (Current)</th>
                  <th className="px-3 py-2">Reject % (Previous)</th>
                </tr>
              </thead>
              <tbody>
                {cropComparisonRows.length ? (
                  cropComparisonRows.map((row) => (
                    <tr className="rounded-xl bg-white text-sm text-slate-700" key={row.cropKey}>
                      <td className="rounded-l-xl px-3 py-2 font-medium">{row.cropKey}</td>
                      <td className="px-3 py-2">{row.currentUsable.toFixed(2)}</td>
                      <td className="px-3 py-2">{row.previousUsable.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        {formatDelta(row.currentUsable, row.previousUsable, " kg")}
                      </td>
                      <td className="px-3 py-2">{row.currentRejectRate.toFixed(2)}%</td>
                      <td className="rounded-r-xl px-3 py-2">{row.previousRejectRate.toFixed(2)}%</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-4 text-sm text-slate-600" colSpan={6}>
                      No crop-level comparison data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Profile Leaders and Regressions</h2>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {isLoading
                ? "Refreshing..."
                : `${topImprovers.length} improvers · ${topRegressions.length} regressions`}
            </p>
          </div>

          <div className="mt-4 grid gap-4 lg:grid-cols-2">
            <article className="rounded-2xl border border-emerald-100 bg-emerald-50/60 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-emerald-700">
                Top Improvers
              </h3>
              <div className="mt-3 space-y-2">
                {topImprovers.length ? (
                  topImprovers.map((row) => (
                    <div className="rounded-xl bg-white/80 px-3 py-2 text-sm" key={row.profileKey}>
                      <p className="font-semibold text-slate-800">
                        {row.cropName}
                        {row.cultivar ? ` / ${row.cultivar}` : ""}
                        {` · ${row.zoneId}`}
                      </p>
                      <p className="text-xs text-slate-600">
                        Yield delta: {formatDelta(row.currentUsable, row.previousUsable, " kg")}
                        {" · Reject delta: "}
                        {formatDelta(row.currentRejectRate, row.previousRejectRate, "%")}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">No improving profiles in this window.</p>
                )}
              </div>
            </article>

            <article className="rounded-2xl border border-rose-100 bg-rose-50/60 p-4">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-rose-700">
                Top Regressions
              </h3>
              <div className="mt-3 space-y-2">
                {topRegressions.length ? (
                  topRegressions.map((row) => (
                    <div className="rounded-xl bg-white/80 px-3 py-2 text-sm" key={row.profileKey}>
                      <p className="font-semibold text-slate-800">
                        {row.cropName}
                        {row.cultivar ? ` / ${row.cultivar}` : ""}
                        {` · ${row.zoneId}`}
                      </p>
                      <p className="text-xs text-slate-600">
                        Yield delta: {formatDelta(row.currentUsable, row.previousUsable, " kg")}
                        {" · Reject delta: "}
                        {formatDelta(row.currentRejectRate, row.previousRejectRate, "%")}
                      </p>
                    </div>
                  ))
                ) : (
                  <p className="text-sm text-slate-600">No regressing profiles in this window.</p>
                )}
              </div>
            </article>
          </div>
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Profile Comparison</h2>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {isLoading ? "Refreshing..." : `${profileComparisonRows.length} profiles`}
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Profile</th>
                  <th className="px-3 py-2">Current (kg)</th>
                  <th className="px-3 py-2">Previous (kg)</th>
                  <th className="px-3 py-2">Delta (kg)</th>
                  <th className="px-3 py-2">Reject Delta</th>
                </tr>
              </thead>
              <tbody>
                {profileComparisonRows.length ? (
                  profileComparisonRows.map((row) => (
                    <tr className="rounded-xl bg-white text-sm text-slate-700" key={row.profileKey}>
                      <td className="rounded-l-xl px-3 py-2">
                        <p className="font-semibold">
                          {row.cropName}
                          {row.cultivar ? ` / ${row.cultivar}` : ""}
                        </p>
                        <p className="text-xs text-slate-500">{row.zoneId}</p>
                      </td>
                      <td className="px-3 py-2">{row.currentUsable.toFixed(2)}</td>
                      <td className="px-3 py-2">{row.previousUsable.toFixed(2)}</td>
                      <td className="px-3 py-2">{row.usableDelta.toFixed(2)}</td>
                      <td className="rounded-r-xl px-3 py-2">
                        {row.rejectRateDelta > 0 ? "+" : ""}
                        {row.rejectRateDelta.toFixed(2)}%
                      </td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-4 text-sm text-slate-600" colSpan={5}>
                      No profile-level comparison data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Zone Trend Evidence</h2>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {isLoading ? "Refreshing..." : `${zoneTrendRows.length} zones`}
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Zone</th>
                  <th className="px-3 py-2">Current Yield (kg)</th>
                  <th className="px-3 py-2">Previous Yield (kg)</th>
                  <th className="px-3 py-2">Yield Delta</th>
                  <th className="px-3 py-2">Reject Delta</th>
                  <th className="px-3 py-2">Batches (Current)</th>
                  <th className="px-3 py-2">Batches (Previous)</th>
                </tr>
              </thead>
              <tbody>
                {zoneTrendRows.length ? (
                  zoneTrendRows.map((row) => (
                    <tr className="rounded-xl bg-white text-sm text-slate-700" key={row.zoneId}>
                      <td className="rounded-l-xl px-3 py-2 font-semibold">{row.zoneId}</td>
                      <td className="px-3 py-2">{row.currentUsable.toFixed(2)}</td>
                      <td className="px-3 py-2">{row.previousUsable.toFixed(2)}</td>
                      <td className="px-3 py-2">
                        {row.usableDelta > 0 ? "+" : ""}
                        {row.usableDelta.toFixed(2)} kg
                      </td>
                      <td className="px-3 py-2">
                        {row.rejectRateDelta > 0 ? "+" : ""}
                        {row.rejectRateDelta.toFixed(2)}%
                      </td>
                      <td className="px-3 py-2">{row.currentBatchCount}</td>
                      <td className="rounded-r-xl px-3 py-2">{row.previousBatchCount}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-4 text-sm text-slate-600" colSpan={7}>
                      No zone trend data yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Ops Evidence Timeline</h2>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {isLoading ? "Refreshing..." : `${opsEvidenceRows.length} events`}
            </p>
          </div>

          <div className="mt-4 grid gap-3">
            {opsEvidenceRows.length ? (
              opsEvidenceRows.map((row) => (
                <article
                  className="rounded-2xl border border-white/70 bg-white/80 p-4 shadow-[0_10px_20px_-18px_rgba(15,23,42,.45)]"
                  key={row.id}
                >
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-800">{row.title}</h3>
                    <p className="text-xs text-slate-500">{formatDateTime(row.createdAt)}</p>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">{row.detail}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {row.links.map((link) => (
                      <Link
                        className="rounded-full border border-emerald-200 bg-emerald-50 px-3 py-1 text-xs font-semibold uppercase tracking-wide text-emerald-700 hover:border-emerald-300 hover:bg-emerald-100 hover:text-emerald-800"
                        href={link.href}
                        key={`${row.id}-${link.href}`}
                      >
                        {link.label}
                      </Link>
                    ))}
                  </div>
                </article>
              ))
            ) : (
              <p className="rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-600">
                No matching evidence events found for current regressions.
              </p>
            )}
          </div>
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
          <div className="flex items-center justify-between gap-3">
            <h2 className="text-lg font-semibold">Batch Yield Details</h2>
            <p className="text-xs uppercase tracking-wide text-slate-500">
              {isLoading ? "Refreshing..." : `${currentData?.items.length ?? 0} rows`}
            </p>
          </div>

          <div className="mt-4 overflow-x-auto">
            <table className="min-w-full border-separate border-spacing-y-2">
              <thead>
                <tr className="text-left text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2">Batch</th>
                  <th className="px-3 py-2">Zone</th>
                  <th className="px-3 py-2">Cycle</th>
                  <th className="px-3 py-2">Usable (kg)</th>
                  <th className="px-3 py-2">Reject (kg)</th>
                  <th className="px-3 py-2">Reject %</th>
                  <th className="px-3 py-2">Last Harvest</th>
                </tr>
              </thead>
              <tbody>
                {currentData?.items.length ? (
                  currentData?.items.map((item) => (
                    <tr className="rounded-xl bg-white text-sm text-slate-700" key={item.batchId}>
                      <td className="rounded-l-xl px-3 py-2">
                        <p className="font-semibold">{item.batchCode}</p>
                        <p className="text-xs text-slate-500">
                          {item.cropName}
                          {item.cultivar ? ` / ${item.cultivar}` : ""}
                        </p>
                      </td>
                      <td className="px-3 py-2">{item.zoneId}</td>
                      <td className="px-3 py-2">{item.cycleDays} d</td>
                      <td className="px-3 py-2">{item.usableWeightKg.toFixed(2)}</td>
                      <td className="px-3 py-2">{item.rejectWeightKg.toFixed(2)}</td>
                      <td className="px-3 py-2">{item.rejectRatePct.toFixed(2)}%</td>
                      <td className="rounded-r-xl px-3 py-2">{formatDateTime(item.lastHarvestAt)}</td>
                    </tr>
                  ))
                ) : (
                  <tr>
                    <td className="px-3 py-4 text-sm text-slate-600" colSpan={7}>
                      No harvest records in this window yet.
                    </td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
        </section>
      </main>
    </div>
  );
}
