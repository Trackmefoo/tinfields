"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { BatchZoneAssignment, CropCatalogItem, PlantingBatch } from "@/types";

type CatalogEditState = {
  cropName: string;
  cultivar: string;
  seedSupplier: string;
  seedLotCode: string;
  targetCycleDays: string;
  notes: string;
};

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

function toEditState(item: CropCatalogItem): CatalogEditState {
  return {
    cropName: item.cropName,
    cultivar: item.cultivar ?? "",
    seedSupplier: item.seedSupplier ?? "",
    seedLotCode: item.seedLotCode ?? "",
    targetCycleDays: item.targetCycleDays?.toString() ?? "",
    notes: item.notes ?? "",
  };
}

export default function CatalogDashboardPage() {
  const [catalogItems, setCatalogItems] = useState<CropCatalogItem[]>([]);
  const [assignments, setAssignments] = useState<BatchZoneAssignment[]>([]);
  const [batches, setBatches] = useState<PlantingBatch[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isSavingCatalog, setIsSavingCatalog] = useState(false);
  const [assignmentActionId, setAssignmentActionId] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [zoneFilter, setZoneFilter] = useState("all");
  const [assignmentStateFilter, setAssignmentStateFilter] = useState<"all" | "open" | "closed">("all");
  const [editingCatalogId, setEditingCatalogId] = useState<string | null>(null);
  const [catalogEdit, setCatalogEdit] = useState<CatalogEditState | null>(null);
  const [editingAssignmentId, setEditingAssignmentId] = useState<string | null>(null);
  const [assignmentReasonDraft, setAssignmentReasonDraft] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  useEffect(() => {
    async function loadData() {
      setIsLoading(true);
      setError(null);

      try {
        const [catalogResponse, assignmentResponse, plantingResponse] = await Promise.all([
          fetch("/api/protected/crop-catalog?limit=200", { cache: "no-store" }),
          fetch("/api/protected/batch-zone-assignment?limit=300", { cache: "no-store" }),
          fetch("/api/protected/planting?limit=300", { cache: "no-store" }),
        ]);

        if (!catalogResponse.ok || !assignmentResponse.ok || !plantingResponse.ok) {
          throw new Error("Unable to load catalog workspace data.");
        }

        const catalogData: { items?: CropCatalogItem[] } = await catalogResponse.json();
        const assignmentData: { items?: BatchZoneAssignment[] } = await assignmentResponse.json();
        const plantingData: { items?: PlantingBatch[] } = await plantingResponse.json();

        setCatalogItems(Array.isArray(catalogData.items) ? catalogData.items : []);
        setAssignments(Array.isArray(assignmentData.items) ? assignmentData.items : []);
        setBatches(Array.isArray(plantingData.items) ? plantingData.items : []);
      } catch (err) {
        setError(err instanceof Error ? err.message : "Unable to load catalog workspace data.");
      } finally {
        setIsLoading(false);
      }
    }

    void loadData();
  }, []);

  async function refreshData() {
    const [catalogResponse, assignmentResponse, plantingResponse] = await Promise.all([
      fetch("/api/protected/crop-catalog?limit=200", { cache: "no-store" }),
      fetch("/api/protected/batch-zone-assignment?limit=300", { cache: "no-store" }),
      fetch("/api/protected/planting?limit=300", { cache: "no-store" }),
    ]);

    if (!catalogResponse.ok || !assignmentResponse.ok || !plantingResponse.ok) {
      throw new Error("Unable to refresh catalog workspace data.");
    }

    const catalogData: { items?: CropCatalogItem[] } = await catalogResponse.json();
    const assignmentData: { items?: BatchZoneAssignment[] } = await assignmentResponse.json();
    const plantingData: { items?: PlantingBatch[] } = await plantingResponse.json();

    setCatalogItems(Array.isArray(catalogData.items) ? catalogData.items : []);
    setAssignments(Array.isArray(assignmentData.items) ? assignmentData.items : []);
    setBatches(Array.isArray(plantingData.items) ? plantingData.items : []);
  }

  function startEdit(item: CropCatalogItem) {
    setEditingCatalogId(item.id);
    setCatalogEdit(toEditState(item));
    setError(null);
    setSuccess(null);
  }

  function cancelEdit() {
    setEditingCatalogId(null);
    setCatalogEdit(null);
  }

  async function saveCatalogEdit(itemId: string) {
    if (!catalogEdit) {
      return;
    }

    setIsSavingCatalog(true);
    setError(null);
    setSuccess(null);

    try {
      const targetCycleDays = catalogEdit.targetCycleDays
        ? Number(catalogEdit.targetCycleDays)
        : null;

      if (
        targetCycleDays !== null &&
        (!Number.isFinite(targetCycleDays) || targetCycleDays < 1)
      ) {
        throw new Error("Target cycle days must be at least 1.");
      }

      const response = await fetch(`/api/protected/crop-catalog/${itemId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cropName: catalogEdit.cropName,
          cultivar: catalogEdit.cultivar,
          seedSupplier: catalogEdit.seedSupplier,
          seedLotCode: catalogEdit.seedLotCode,
          targetCycleDays,
          notes: catalogEdit.notes,
        }),
      });

      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to save catalog item.");
      }

      setSuccess("Catalog item updated.");
      cancelEdit();
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to save catalog item.");
    } finally {
      setIsSavingCatalog(false);
    }
  }

  async function closeAssignment(assignmentId: string) {
    setAssignmentActionId(assignmentId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/protected/batch-zone-assignment/${assignmentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          closeNow: true,
        }),
      });

      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to close assignment.");
      }

      setSuccess("Assignment closed.");
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to close assignment.");
    } finally {
      setAssignmentActionId(null);
    }
  }

  async function reopenAssignment(assignmentId: string) {
    setAssignmentActionId(assignmentId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/protected/batch-zone-assignment/${assignmentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          reopen: true,
        }),
      });

      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to reopen assignment.");
      }

      setSuccess("Assignment reopened.");
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to reopen assignment.");
    } finally {
      setAssignmentActionId(null);
    }
  }

  function startAssignmentReasonEdit(assignment: BatchZoneAssignment) {
    setEditingAssignmentId(assignment.id);
    setAssignmentReasonDraft(assignment.assignmentReason ?? "");
    setError(null);
    setSuccess(null);
  }

  function cancelAssignmentReasonEdit() {
    setEditingAssignmentId(null);
    setAssignmentReasonDraft("");
  }

  async function saveAssignmentReason(assignmentId: string) {
    setAssignmentActionId(assignmentId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/protected/batch-zone-assignment/${assignmentId}`, {
        method: "PATCH",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          assignmentReason: assignmentReasonDraft,
        }),
      });

      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to update assignment reason.");
      }

      setSuccess("Assignment reason updated.");
      cancelAssignmentReasonEdit();
      await refreshData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update assignment reason.");
    } finally {
      setAssignmentActionId(null);
    }
  }

  const batchById = useMemo(() => {
    const map = new Map<string, PlantingBatch>();
    batches.forEach((batch) => {
      map.set(batch.id, batch);
    });
    return map;
  }, [batches]);

  const filteredCatalog = useMemo(() => {
    const query = search.trim().toLowerCase();
    return catalogItems.filter((item) => {
      if (!query) {
        return true;
      }

      const haystack = [
        item.cropName,
        item.cultivar ?? "",
        item.seedSupplier ?? "",
        item.seedLotCode ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [catalogItems, search]);

  const filteredAssignments = useMemo(() => {
    return assignments.filter((assignment) => {
      if (zoneFilter !== "all" && assignment.zoneId !== zoneFilter) {
        return false;
      }

      if (assignmentStateFilter === "open" && assignment.unassignedAt) {
        return false;
      }
      if (assignmentStateFilter === "closed" && !assignment.unassignedAt) {
        return false;
      }

      const query = search.trim().toLowerCase();
      if (!query) {
        return true;
      }

      const batch = batchById.get(assignment.batchId);
      const haystack = [
        assignment.batchId,
        assignment.zoneId,
        assignment.assignmentReason ?? "",
        batch?.batchCode ?? "",
        batch?.cropName ?? "",
      ]
        .join(" ")
        .toLowerCase();

      return haystack.includes(query);
    });
  }, [assignmentStateFilter, assignments, batchById, search, zoneFilter]);

  const uniqueZones = useMemo(() => {
    return Array.from(new Set(assignments.map((assignment) => assignment.zoneId))).sort((a, b) =>
      a.localeCompare(b),
    );
  }, [assignments]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_18%_10%,#eff8da_0%,#f8fbe8_34%,#eef4ff_67%,#f9efe5_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(125deg,rgba(16,185,129,.08),rgba(14,116,144,.08),rgba(249,115,22,.08))]" />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 md:px-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              Catalog Workspace
            </p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">
              Crop Catalog and Zone Assignments
            </h1>
            <p className="mt-2 text-sm text-slate-600 md:text-base">
              Filter, edit crop references, and close assignment intervals safely.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              href="/dashboard"
            >
              Back to Dashboard
            </Link>
            <Link
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              href="/dashboard/yield"
            >
              Yield View
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

        <section className="grid gap-4 rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm md:grid-cols-[2fr_1fr_1fr]">
          <input
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Search crop, batch, zone, supplier..."
            type="text"
            value={search}
          />
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            onChange={(event) => setZoneFilter(event.target.value)}
            value={zoneFilter}
          >
            <option value="all">All zones</option>
            {uniqueZones.map((zoneId) => (
              <option key={zoneId} value={zoneId}>
                {zoneId}
              </option>
            ))}
          </select>
          <select
            className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
            onChange={(event) => setAssignmentStateFilter(event.target.value as "all" | "open" | "closed")}
            value={assignmentStateFilter}
          >
            <option value="all">All assignment states</option>
            <option value="open">Open only</option>
            <option value="closed">Closed only</option>
          </select>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Catalog Items</h2>
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {isLoading ? "Loading..." : `${filteredCatalog.length} items`}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {filteredCatalog.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  No matching crop catalog items.
                </p>
              ) : (
                filteredCatalog.map((item) => {
                  const isEditing = editingCatalogId === item.id && !!catalogEdit;

                  return (
                    <div className="rounded-xl border border-slate-200 bg-white p-3" key={item.id}>
                      {isEditing && catalogEdit ? (
                        <div className="grid gap-2">
                          <input
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            onChange={(event) =>
                              setCatalogEdit((current) =>
                                current ? { ...current, cropName: event.target.value } : current,
                              )
                            }
                            type="text"
                            value={catalogEdit.cropName}
                          />
                          <input
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            onChange={(event) =>
                              setCatalogEdit((current) =>
                                current ? { ...current, cultivar: event.target.value } : current,
                              )
                            }
                            placeholder="Cultivar"
                            type="text"
                            value={catalogEdit.cultivar}
                          />
                          <div className="grid gap-2 sm:grid-cols-2">
                            <input
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              onChange={(event) =>
                                setCatalogEdit((current) =>
                                  current ? { ...current, seedSupplier: event.target.value } : current,
                                )
                              }
                              placeholder="Seed supplier"
                              type="text"
                              value={catalogEdit.seedSupplier}
                            />
                            <input
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                              onChange={(event) =>
                                setCatalogEdit((current) =>
                                  current ? { ...current, seedLotCode: event.target.value } : current,
                                )
                              }
                              placeholder="Seed lot"
                              type="text"
                              value={catalogEdit.seedLotCode}
                            />
                          </div>
                          <input
                            className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            min="1"
                            onChange={(event) =>
                              setCatalogEdit((current) =>
                                current ? { ...current, targetCycleDays: event.target.value } : current,
                              )
                            }
                            placeholder="Target cycle days"
                            type="number"
                            value={catalogEdit.targetCycleDays}
                          />
                          <textarea
                            className="min-h-16 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            onChange={(event) =>
                              setCatalogEdit((current) =>
                                current ? { ...current, notes: event.target.value } : current,
                              )
                            }
                            placeholder="Notes"
                            value={catalogEdit.notes}
                          />
                          <div className="flex gap-2">
                            <button
                              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
                              disabled={isSavingCatalog}
                              onClick={() => {
                                void saveCatalogEdit(item.id);
                              }}
                              type="button"
                            >
                              {isSavingCatalog ? "Saving..." : "Save"}
                            </button>
                            <button
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700"
                              onClick={cancelEdit}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <>
                          <p className="text-sm font-semibold text-slate-800">
                            {item.cropName}
                            {item.cultivar ? ` / ${item.cultivar}` : ""}
                          </p>
                          <p className="mt-1 text-xs text-slate-500">
                            {item.seedSupplier ? `Supplier ${item.seedSupplier} | ` : ""}
                            {item.seedLotCode ? `Lot ${item.seedLotCode} | ` : ""}
                            {item.targetCycleDays ? `${item.targetCycleDays} days | ` : ""}
                            Updated {formatDateTime(item.updatedAt)}
                          </p>
                          {item.notes ? (
                            <p className="mt-1 text-xs text-slate-600">{item.notes}</p>
                          ) : null}
                          <button
                            className="mt-3 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-50"
                            onClick={() => startEdit(item)}
                            type="button"
                          >
                            Edit
                          </button>
                        </>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Assignment Intervals</h2>
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {isLoading ? "Loading..." : `${filteredAssignments.length} rows`}
              </span>
            </div>
            <div className="mt-4 space-y-3">
              {filteredAssignments.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  No matching assignment intervals.
                </p>
              ) : (
                filteredAssignments.map((assignment) => {
                  const batch = batchById.get(assignment.batchId);
                  const isClosed = !!assignment.unassignedAt;
                  const isEditingReason = editingAssignmentId === assignment.id;

                  return (
                    <div className="rounded-xl border border-slate-200 bg-white p-3" key={assignment.id}>
                      <p className="text-sm font-semibold text-slate-800">
                        {batch?.batchCode ?? assignment.batchId} - Zone {assignment.zoneId}
                      </p>
                      <p className="mt-1 text-xs text-slate-500">
                        Assigned {formatDateTime(assignment.assignedAt)}
                        {assignment.unassignedAt
                          ? ` | Closed ${formatDateTime(assignment.unassignedAt)}`
                          : " | Open"}
                      </p>
                      {assignment.assignmentReason ? (
                        <p className="mt-1 text-xs text-slate-600">{assignment.assignmentReason}</p>
                      ) : null}

                      {isEditingReason ? (
                        <div className="mt-3 grid gap-2">
                          <textarea
                            className="min-h-14 rounded-lg border border-slate-300 px-3 py-2 text-sm"
                            onChange={(event) => setAssignmentReasonDraft(event.target.value)}
                            value={assignmentReasonDraft}
                          />
                          <div className="flex gap-2">
                            <button
                              className="rounded-lg bg-emerald-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-emerald-300"
                              disabled={assignmentActionId === assignment.id}
                              onClick={() => {
                                void saveAssignmentReason(assignment.id);
                              }}
                              type="button"
                            >
                              {assignmentActionId === assignment.id ? "Saving..." : "Save Reason"}
                            </button>
                            <button
                              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700"
                              onClick={cancelAssignmentReasonEdit}
                              type="button"
                            >
                              Cancel
                            </button>
                          </div>
                        </div>
                      ) : (
                        <div className="mt-3 flex flex-wrap gap-2">
                          <button
                            className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-50"
                            onClick={() => startAssignmentReasonEdit(assignment)}
                            type="button"
                          >
                            Edit Reason
                          </button>
                          {!isClosed ? (
                            <button
                              className="rounded-lg bg-amber-500 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-amber-300"
                              disabled={assignmentActionId === assignment.id}
                              onClick={() => {
                                void closeAssignment(assignment.id);
                              }}
                              type="button"
                            >
                              {assignmentActionId === assignment.id ? "Closing..." : "Close Assignment"}
                            </button>
                          ) : (
                            <button
                              className="rounded-lg bg-sky-600 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-sky-300"
                              disabled={assignmentActionId === assignment.id}
                              onClick={() => {
                                void reopenAssignment(assignment.id);
                              }}
                              type="button"
                            >
                              {assignmentActionId === assignment.id ? "Reopening..." : "Reopen Assignment"}
                            </button>
                          )}
                        </div>
                      )}
                    </div>
                  );
                })
              )}
            </div>
          </article>
        </section>
      </main>
    </div>
  );
}
