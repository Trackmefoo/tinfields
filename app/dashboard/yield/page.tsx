"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { YieldKpiResponse } from "@/types";

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

export default function YieldDashboardPage() {
  const [windowDays, setWindowDays] = useState(120);
  const [currentData, setCurrentData] = useState<YieldKpiResponse | null>(null);
  const [previousData, setPreviousData] = useState<YieldKpiResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    async function loadYieldData() {
      setIsLoading(true);
      setError(null);

      try {
        const [currentResponse, previousResponse] = await Promise.all([
          fetch(`/api/protected/yield-kpi?windowDays=${windowDays}`, {
            cache: "no-store",
          }),
          fetch(
            `/api/protected/yield-kpi?windowDays=${windowDays}&offsetDays=${windowDays}`,
            {
              cache: "no-store",
            },
          ),
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

        setCurrentData(currentPayload);
        setPreviousData(previousPayload);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load yield KPIs.");
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
