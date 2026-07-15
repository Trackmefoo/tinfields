"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { UserButton, useAuth } from "@clerk/nextjs";
import { IrrigationPanel } from "@/components/IrrigationPanel";
import { LightControl } from "@/components/LightControl";
import { SensorCard } from "@/components/SensorCard";
import { SensorStreamChart } from "@/components/SensorStreamChart";
import { useControl } from "@/hooks/useControl";
import { useFarmData } from "@/hooks/useFarmData";
import { extractRoleFromClaims, hasRequiredRole, type AppRole } from "@/lib/authz";
import type {
  BatchZoneAssignment,
  CropCatalogItem,
  HarvestRecord,
  PlantingBatch,
  QualityGrade,
} from "@/types";

type PlantingFormState = {
  cropCatalogId: string;
  cropName: string;
  cultivar: string;
  batchCode: string;
  zoneId: string;
  expectedHarvestStartAt: string;
  expectedHarvestEndAt: string;
};

type HarvestFormState = {
  batchId: string;
  zoneId: string;
  usableWeightKg: string;
  rejectWeightKg: string;
  wetWeightKg: string;
  dryWeightKg: string;
  qualityGrade: "" | QualityGrade;
  defectNotes: string;
  finalized: boolean;
  notes: string;
  markBatchComplete: boolean;
};

type CropCatalogFormState = {
  cropName: string;
  cultivar: string;
  seedSupplier: string;
  seedLotCode: string;
  targetCycleDays: string;
  notes: string;
};

type BatchAssignmentFormState = {
  batchId: string;
  zoneId: string;
  assignedAt: string;
  assignmentReason: string;
};

const INITIAL_PLANTING_FORM: PlantingFormState = {
  cropCatalogId: "",
  cropName: "",
  cultivar: "",
  batchCode: "",
  zoneId: "",
  expectedHarvestStartAt: "",
  expectedHarvestEndAt: "",
};

const INITIAL_HARVEST_FORM: HarvestFormState = {
  batchId: "",
  zoneId: "",
  usableWeightKg: "",
  rejectWeightKg: "0",
  wetWeightKg: "",
  dryWeightKg: "",
  qualityGrade: "",
  defectNotes: "",
  finalized: false,
  notes: "",
  markBatchComplete: true,
};

const INITIAL_CROP_CATALOG_FORM: CropCatalogFormState = {
  cropName: "",
  cultivar: "",
  seedSupplier: "",
  seedLotCode: "",
  targetCycleDays: "",
  notes: "",
};

const INITIAL_BATCH_ASSIGNMENT_FORM: BatchAssignmentFormState = {
  batchId: "",
  zoneId: "",
  assignedAt: "",
  assignmentReason: "",
};

function toIsoFromDateInput(value: string) {
  if (!value.trim()) {
    return undefined;
  }
  return new Date(`${value}T00:00:00.000Z`).toISOString();
}

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

function roleLabel(role: AppRole) {
  switch (role) {
    case "admin":
      return "Admin";
    case "grow_manager":
      return "Grow Manager";
    default:
      return "Operator";
  }
}

export default function DashboardPage() {
  const { isMqttConnected, sensorHistory, sensors } = useFarmData();
  const { sessionClaims } = useAuth();
  const role = extractRoleFromClaims(sessionClaims);
  const canOperateControls = hasRequiredRole(role, "operator");
  const canUseVentBoost = hasRequiredRole(role, "grow_manager");
  const canCreatePlanting = hasRequiredRole(role, "grow_manager");
  const canLogHarvest = hasRequiredRole(role, "operator");
  const canManageCatalog = hasRequiredRole(role, "grow_manager");
  const { startIrrigationZoneA, toggleLights, ventilationBoost } = useControl();
  const [plantingForm, setPlantingForm] = useState<PlantingFormState>(INITIAL_PLANTING_FORM);
  const [harvestForm, setHarvestForm] = useState<HarvestFormState>(INITIAL_HARVEST_FORM);
  const [cropCatalogForm, setCropCatalogForm] = useState<CropCatalogFormState>(
    INITIAL_CROP_CATALOG_FORM,
  );
  const [assignmentForm, setAssignmentForm] = useState<BatchAssignmentFormState>(
    INITIAL_BATCH_ASSIGNMENT_FORM,
  );
  const [batches, setBatches] = useState<PlantingBatch[]>([]);
  const [harvests, setHarvests] = useState<HarvestRecord[]>([]);
  const [catalogItems, setCatalogItems] = useState<CropCatalogItem[]>([]);
  const [zoneAssignments, setZoneAssignments] = useState<BatchZoneAssignment[]>([]);
  const [isLoadingLifecycleData, setIsLoadingLifecycleData] = useState(false);
  const [isSubmittingPlanting, setIsSubmittingPlanting] = useState(false);
  const [isSubmittingHarvest, setIsSubmittingHarvest] = useState(false);
  const [isSubmittingCatalog, setIsSubmittingCatalog] = useState(false);
  const [isSubmittingAssignment, setIsSubmittingAssignment] = useState(false);
  const [lifecycleError, setLifecycleError] = useState<string | null>(null);
  const [lifecycleSuccess, setLifecycleSuccess] = useState<string | null>(null);

  const activeBatches = useMemo(
    () => batches.filter((batch) => batch.status === "active"),
    [batches],
  );

  useEffect(() => {
    async function loadLifecycleData() {
      setIsLoadingLifecycleData(true);
      setLifecycleError(null);

      try {
        const [batchesResponse, harvestsResponse, catalogResponse, assignmentsResponse] = await Promise.all([
          fetch("/api/protected/planting?limit=25", { cache: "no-store" }),
          fetch("/api/protected/harvest?limit=25", { cache: "no-store" }),
          fetch("/api/protected/crop-catalog?limit=25", { cache: "no-store" }),
          fetch("/api/protected/batch-zone-assignment?limit=25", { cache: "no-store" }),
        ]);

        if (!batchesResponse.ok || !harvestsResponse.ok || !catalogResponse.ok || !assignmentsResponse.ok) {
          throw new Error("Unable to load crop lifecycle data.");
        }

        const batchData: { items?: PlantingBatch[] } = await batchesResponse.json();
        const harvestData: { items?: HarvestRecord[] } = await harvestsResponse.json();
        const catalogData: { items?: CropCatalogItem[] } = await catalogResponse.json();
        const assignmentData: { items?: BatchZoneAssignment[] } = await assignmentsResponse.json();

        setBatches(Array.isArray(batchData.items) ? batchData.items : []);
        setHarvests(Array.isArray(harvestData.items) ? harvestData.items : []);
        setCatalogItems(Array.isArray(catalogData.items) ? catalogData.items : []);
        setZoneAssignments(Array.isArray(assignmentData.items) ? assignmentData.items : []);
      } catch (error) {
        setLifecycleError(
          error instanceof Error ? error.message : "Unable to load crop lifecycle data.",
        );
      } finally {
        setIsLoadingLifecycleData(false);
      }
    }

    void loadLifecycleData();
  }, []);

  function handleBatchSelection(batchId: string) {
    const selected = activeBatches.find((batch) => batch.id === batchId);
    setHarvestForm((current) => ({
      ...current,
      batchId,
      zoneId: selected?.zoneId ?? current.zoneId,
    }));
  }

  function handleAssignmentBatchSelection(batchId: string) {
    const selected = batches.find((batch) => batch.id === batchId);
    setAssignmentForm((current) => ({
      ...current,
      batchId,
      zoneId: selected?.zoneId ?? current.zoneId,
    }));
  }

  async function reloadLifecycleData() {
    const [batchesResponse, harvestsResponse, catalogResponse, assignmentsResponse] = await Promise.all([
      fetch("/api/protected/planting?limit=25", { cache: "no-store" }),
      fetch("/api/protected/harvest?limit=25", { cache: "no-store" }),
      fetch("/api/protected/crop-catalog?limit=25", { cache: "no-store" }),
      fetch("/api/protected/batch-zone-assignment?limit=25", { cache: "no-store" }),
    ]);

    if (!batchesResponse.ok || !harvestsResponse.ok || !catalogResponse.ok || !assignmentsResponse.ok) {
      throw new Error("Unable to refresh crop lifecycle data.");
    }

    const batchData: { items?: PlantingBatch[] } = await batchesResponse.json();
    const harvestData: { items?: HarvestRecord[] } = await harvestsResponse.json();
    const catalogData: { items?: CropCatalogItem[] } = await catalogResponse.json();
    const assignmentData: { items?: BatchZoneAssignment[] } = await assignmentsResponse.json();

    setBatches(Array.isArray(batchData.items) ? batchData.items : []);
    setHarvests(Array.isArray(harvestData.items) ? harvestData.items : []);
    setCatalogItems(Array.isArray(catalogData.items) ? catalogData.items : []);
    setZoneAssignments(Array.isArray(assignmentData.items) ? assignmentData.items : []);
  }

  async function submitPlanting(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canCreatePlanting) {
      return;
    }

    setIsSubmittingPlanting(true);
    setLifecycleError(null);
    setLifecycleSuccess(null);

    try {
      const response = await fetch("/api/protected/planting", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cropCatalogId: plantingForm.cropCatalogId || undefined,
          cropName: plantingForm.cropName,
          cultivar: plantingForm.cultivar || undefined,
          batchCode: plantingForm.batchCode,
          zoneId: plantingForm.zoneId,
          expectedHarvestStartAt: toIsoFromDateInput(plantingForm.expectedHarvestStartAt),
          expectedHarvestEndAt: toIsoFromDateInput(plantingForm.expectedHarvestEndAt),
        }),
      });

      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to create planting batch.");
      }

      setPlantingForm(INITIAL_PLANTING_FORM);
      setLifecycleSuccess("Planting batch created.");
      await reloadLifecycleData();
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : "Unable to create planting batch.");
    } finally {
      setIsSubmittingPlanting(false);
    }
  }

  async function submitHarvest(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canLogHarvest) {
      return;
    }

    setIsSubmittingHarvest(true);
    setLifecycleError(null);
    setLifecycleSuccess(null);

    try {
      const usableWeightKg = Number(harvestForm.usableWeightKg);
      const rejectWeightKg = Number(harvestForm.rejectWeightKg || "0");
      const wetWeightKg = harvestForm.wetWeightKg ? Number(harvestForm.wetWeightKg) : undefined;
      const dryWeightKg = harvestForm.dryWeightKg ? Number(harvestForm.dryWeightKg) : undefined;

      if (!Number.isFinite(usableWeightKg) || usableWeightKg < 0) {
        throw new Error("Usable weight must be zero or greater.");
      }
      if (!Number.isFinite(rejectWeightKg) || rejectWeightKg < 0) {
        throw new Error("Reject weight must be zero or greater.");
      }
      if (wetWeightKg !== undefined && (!Number.isFinite(wetWeightKg) || wetWeightKg < 0)) {
        throw new Error("Wet weight must be zero or greater.");
      }
      if (dryWeightKg !== undefined && (!Number.isFinite(dryWeightKg) || dryWeightKg < 0)) {
        throw new Error("Dry weight must be zero or greater.");
      }

      if (harvestForm.finalized) {
        if (!harvestForm.qualityGrade) {
          throw new Error("Finalized harvest requires a quality grade.");
        }
        if (wetWeightKg === undefined && dryWeightKg === undefined) {
          throw new Error("Finalized harvest requires wet or dry weight.");
        }
      }

      const response = await fetch("/api/protected/harvest", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchId: harvestForm.batchId,
          zoneId: harvestForm.zoneId,
          usableWeightKg,
          rejectWeightKg,
          wetWeightKg,
          dryWeightKg,
          qualityGrade: harvestForm.qualityGrade || undefined,
          defectNotes: harvestForm.defectNotes || undefined,
          finalized: harvestForm.finalized,
          notes: harvestForm.notes || undefined,
          markBatchComplete: harvestForm.markBatchComplete,
        }),
      });

      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to log harvest record.");
      }

      setHarvestForm(INITIAL_HARVEST_FORM);
      setLifecycleSuccess("Harvest record logged.");
      await reloadLifecycleData();
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : "Unable to log harvest record.");
    } finally {
      setIsSubmittingHarvest(false);
    }
  }

  async function submitCropCatalog(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageCatalog) {
      return;
    }

    setIsSubmittingCatalog(true);
    setLifecycleError(null);
    setLifecycleSuccess(null);

    try {
      const targetCycleDays = cropCatalogForm.targetCycleDays
        ? Number(cropCatalogForm.targetCycleDays)
        : undefined;

      if (
        targetCycleDays !== undefined &&
        (!Number.isFinite(targetCycleDays) || targetCycleDays < 1)
      ) {
        throw new Error("Target cycle days must be at least 1.");
      }

      const response = await fetch("/api/protected/crop-catalog", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          cropName: cropCatalogForm.cropName,
          cultivar: cropCatalogForm.cultivar || undefined,
          seedSupplier: cropCatalogForm.seedSupplier || undefined,
          seedLotCode: cropCatalogForm.seedLotCode || undefined,
          targetCycleDays,
          notes: cropCatalogForm.notes || undefined,
        }),
      });

      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to create crop catalog item.");
      }

      setCropCatalogForm(INITIAL_CROP_CATALOG_FORM);
      setLifecycleSuccess("Crop catalog item created.");
      await reloadLifecycleData();
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : "Unable to create crop catalog item.");
    } finally {
      setIsSubmittingCatalog(false);
    }
  }

  async function submitBatchAssignment(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!canManageCatalog) {
      return;
    }

    setIsSubmittingAssignment(true);
    setLifecycleError(null);
    setLifecycleSuccess(null);

    try {
      const response = await fetch("/api/protected/batch-zone-assignment", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({
          batchId: assignmentForm.batchId,
          zoneId: assignmentForm.zoneId,
          assignedAt: assignmentForm.assignedAt
            ? new Date(assignmentForm.assignedAt).toISOString()
            : undefined,
          assignmentReason: assignmentForm.assignmentReason || undefined,
        }),
      });

      if (!response.ok) {
        const body: { error?: string } = await response.json().catch(() => ({}));
        throw new Error(body.error ?? "Unable to assign batch to zone.");
      }

      setAssignmentForm(INITIAL_BATCH_ASSIGNMENT_FORM);
      setLifecycleSuccess("Batch-zone assignment created.");
      await reloadLifecycleData();
    } catch (error) {
      setLifecycleError(error instanceof Error ? error.message : "Unable to assign batch to zone.");
    } finally {
      setIsSubmittingAssignment(false);
    }
  }

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_12%_16%,#d7f5d1_0%,#f3fbea_30%,#f6efe3_64%,#e8f4f7_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(24,77,46,.08),rgba(227,126,53,.08),rgba(36,112,138,.08))]" />

      <main className="relative mx-auto flex w-full max-w-6xl flex-col gap-10 px-6 py-10 md:px-10">
        <header className="flex flex-col gap-5 rounded-3xl border border-white/60 bg-white/70 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm md:flex-row md:items-end md:justify-between">
          <div>
            <p className="inline-flex rounded-full bg-emerald-100 px-3 py-1 text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">
              TinFields
            </p>
            <h1 className="mt-3 text-3xl font-bold tracking-tight md:text-5xl">
              Farm Control Center
            </h1>
            <p className="mt-2 max-w-2xl text-sm text-slate-600 md:text-base">
              Real-time greenhouse telemetry and actuator controls for lights,
              irrigation, and climate zones.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <Link
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-50"
              href="/dashboard/catalog"
            >
              Catalog Workspace
            </Link>
            <Link
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-50"
              href="/dashboard/integrations"
            >
              Integrations
            </Link>
            <Link
              className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700 hover:bg-slate-50"
              href="/dashboard/yield"
            >
              Yield Intelligence
            </Link>
            <span className="rounded-xl border border-slate-300 bg-slate-50 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-slate-700">
              {roleLabel(role)}
            </span>
            <UserButton />
          </div>
        </header>

        <section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
          <SensorCard title="Greenhouse Temp" sensor={sensors.temperature} />
          <SensorCard title="Humidity" sensor={sensors.humidity} />
          <SensorCard title="Soil Moisture" sensor={sensors.soilMoisture} />
          <SensorCard title="pH" sensor={sensors.ph} />
        </section>

        <section className="grid gap-4 lg:grid-cols-[1.35fr_1fr]">
          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Sensor Stream</h2>
            <p className="mt-1 text-sm text-slate-600">
              The stream is now wired to MQTT with a simulation fallback.
            </p>
            <SensorStreamChart data={sensorHistory} />
          </article>

          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Quick Controls</h2>
            <p className="mt-1 text-sm text-slate-600">
              Commands publish to your MQTT control topic.
            </p>
            <div className="mt-6 grid gap-3">
              <LightControl
                disabled={!isMqttConnected || !canOperateControls}
                onToggle={toggleLights}
              />
              <IrrigationPanel
                disabled={!isMqttConnected || !canOperateControls}
                onStartZoneA={startIrrigationZoneA}
              />
              <button
                className="rounded-xl bg-amber-500 px-4 py-3 text-sm font-medium text-white transition hover:bg-amber-400 disabled:cursor-not-allowed disabled:bg-amber-300"
                disabled={!isMqttConnected || !canOperateControls || !canUseVentBoost}
                onClick={ventilationBoost}
                type="button"
              >
                Ventilation Boost
              </button>
              {!canUseVentBoost ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Ventilation boost requires role: Grow Manager or Admin.
                </p>
              ) : null}
            </div>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Planting Intake</h2>
            <p className="mt-1 text-sm text-slate-600">
              Register new crop batches with expected harvest windows.
            </p>
            <form className="mt-4 grid gap-3" onSubmit={submitPlanting}>
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={!canCreatePlanting || isSubmittingPlanting}
                onChange={(event) =>
                  setPlantingForm((current) => ({ ...current, cropCatalogId: event.target.value }))
                }
                value={plantingForm.cropCatalogId}
              >
                <option value="">Use manual crop fields</option>
                {catalogItems.map((item) => (
                  <option key={item.id} value={item.id}>
                    {item.cropName}
                    {item.cultivar ? ` / ${item.cultivar}` : ""}
                  </option>
                ))}
              </select>
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={!canCreatePlanting || isSubmittingPlanting}
                onChange={(event) =>
                  setPlantingForm((current) => ({ ...current, cropName: event.target.value }))
                }
                placeholder="Crop name"
                required
                type="text"
                value={plantingForm.cropName}
              />
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={!canCreatePlanting || isSubmittingPlanting}
                onChange={(event) =>
                  setPlantingForm((current) => ({ ...current, cultivar: event.target.value }))
                }
                placeholder="Cultivar (optional)"
                type="text"
                value={plantingForm.cultivar}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  disabled={!canCreatePlanting || isSubmittingPlanting}
                  onChange={(event) =>
                    setPlantingForm((current) => ({ ...current, batchCode: event.target.value }))
                  }
                  placeholder="Batch code"
                  required
                  type="text"
                  value={plantingForm.batchCode}
                />
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  disabled={!canCreatePlanting || isSubmittingPlanting}
                  onChange={(event) =>
                    setPlantingForm((current) => ({ ...current, zoneId: event.target.value }))
                  }
                  placeholder="Zone ID"
                  required
                  type="text"
                  value={plantingForm.zoneId}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <label className="grid gap-1 text-xs text-slate-600">
                  Expected harvest start
                  <input
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    disabled={!canCreatePlanting || isSubmittingPlanting}
                    onChange={(event) =>
                      setPlantingForm((current) => ({
                        ...current,
                        expectedHarvestStartAt: event.target.value,
                      }))
                    }
                    type="date"
                    value={plantingForm.expectedHarvestStartAt}
                  />
                </label>
                <label className="grid gap-1 text-xs text-slate-600">
                  Expected harvest end
                  <input
                    className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                    disabled={!canCreatePlanting || isSubmittingPlanting}
                    onChange={(event) =>
                      setPlantingForm((current) => ({
                        ...current,
                        expectedHarvestEndAt: event.target.value,
                      }))
                    }
                    type="date"
                    value={plantingForm.expectedHarvestEndAt}
                  />
                </label>
              </div>
              <button
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                disabled={!canCreatePlanting || isSubmittingPlanting}
                type="submit"
              >
                {isSubmittingPlanting ? "Creating Batch..." : "Create Planting Batch"}
              </button>
              {!canCreatePlanting ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Planting intake requires role: Grow Manager or Admin.
                </p>
              ) : null}
            </form>
          </article>

          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Harvest Logging</h2>
            <p className="mt-1 text-sm text-slate-600">
              Log yield and rejects with strict batch-to-zone traceability.
            </p>
            <form className="mt-4 grid gap-3" onSubmit={submitHarvest}>
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={!canLogHarvest || isSubmittingHarvest}
                onChange={(event) => handleBatchSelection(event.target.value)}
                required
                value={harvestForm.batchId}
              >
                <option value="">Select active batch</option>
                {activeBatches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.batchCode} ({batch.cropName})
                  </option>
                ))}
              </select>
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={!canLogHarvest || isSubmittingHarvest}
                onChange={(event) =>
                  setHarvestForm((current) => ({ ...current, zoneId: event.target.value }))
                }
                placeholder="Zone ID"
                required
                type="text"
                value={harvestForm.zoneId}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  disabled={!canLogHarvest || isSubmittingHarvest}
                  min="0"
                  onChange={(event) =>
                    setHarvestForm((current) => ({ ...current, usableWeightKg: event.target.value }))
                  }
                  placeholder="Usable weight (kg)"
                  required
                  step="0.01"
                  type="number"
                  value={harvestForm.usableWeightKg}
                />
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  disabled={!canLogHarvest || isSubmittingHarvest}
                  min="0"
                  onChange={(event) =>
                    setHarvestForm((current) => ({ ...current, rejectWeightKg: event.target.value }))
                  }
                  placeholder="Reject weight (kg)"
                  step="0.01"
                  type="number"
                  value={harvestForm.rejectWeightKg}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  disabled={!canLogHarvest || isSubmittingHarvest}
                  min="0"
                  onChange={(event) =>
                    setHarvestForm((current) => ({ ...current, wetWeightKg: event.target.value }))
                  }
                  placeholder="Wet weight (kg, optional)"
                  step="0.01"
                  type="number"
                  value={harvestForm.wetWeightKg}
                />
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  disabled={!canLogHarvest || isSubmittingHarvest}
                  min="0"
                  onChange={(event) =>
                    setHarvestForm((current) => ({ ...current, dryWeightKg: event.target.value }))
                  }
                  placeholder="Dry weight (kg, optional)"
                  step="0.01"
                  type="number"
                  value={harvestForm.dryWeightKg}
                />
              </div>
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={!canLogHarvest || isSubmittingHarvest}
                onChange={(event) =>
                  setHarvestForm((current) => ({
                    ...current,
                    qualityGrade: event.target.value as "" | QualityGrade,
                  }))
                }
                value={harvestForm.qualityGrade}
              >
                <option value="">Quality grade (optional unless finalized)</option>
                <option value="A">Grade A</option>
                <option value="B">Grade B</option>
                <option value="C">Grade C</option>
                <option value="reject">Reject</option>
              </select>
              <textarea
                className="min-h-16 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={!canLogHarvest || isSubmittingHarvest}
                onChange={(event) =>
                  setHarvestForm((current) => ({ ...current, defectNotes: event.target.value }))
                }
                placeholder="Defect notes (optional)"
                value={harvestForm.defectNotes}
              />
              <textarea
                className="min-h-20 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={!canLogHarvest || isSubmittingHarvest}
                onChange={(event) =>
                  setHarvestForm((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Notes (optional)"
                value={harvestForm.notes}
              />
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  checked={harvestForm.finalized}
                  disabled={!canLogHarvest || isSubmittingHarvest}
                  onChange={(event) =>
                    setHarvestForm((current) => ({
                      ...current,
                      finalized: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Finalize harvest record (requires grade + wet or dry weight)
              </label>
              <label className="flex items-center gap-2 text-sm text-slate-700">
                <input
                  checked={harvestForm.markBatchComplete}
                  disabled={!canLogHarvest || isSubmittingHarvest}
                  onChange={(event) =>
                    setHarvestForm((current) => ({
                      ...current,
                      markBatchComplete: event.target.checked,
                    }))
                  }
                  type="checkbox"
                />
                Mark batch as harvested after logging
              </label>
              <button
                className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-300"
                disabled={!canLogHarvest || isSubmittingHarvest}
                type="submit"
              >
                {isSubmittingHarvest ? "Logging Harvest..." : "Log Harvest"}
              </button>
            </form>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Recent Planting Batches</h2>
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {isLoadingLifecycleData ? "Loading..." : `${batches.length} items`}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {batches.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  No planting batches yet.
                </p>
              ) : (
                batches.slice(0, 6).map((batch) => (
                  <div
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    key={batch.id}
                  >
                    <p className="font-medium">
                      {batch.batchCode} - {batch.cropName}
                    </p>
                    <p className="text-xs text-slate-500">
                      Zone {batch.zoneId} | Status {batch.status} | Planted {formatDateTime(batch.plantedAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Recent Harvest Records</h2>
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {isLoadingLifecycleData ? "Loading..." : `${harvests.length} items`}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {harvests.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  No harvest records yet.
                </p>
              ) : (
                harvests.slice(0, 6).map((record) => (
                  <div
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    key={record.id}
                  >
                    <p className="font-medium">
                      Batch {record.batchId} - {record.usableWeightKg.toFixed(2)} kg usable
                    </p>
                    <p className="text-xs text-slate-500">
                      Zone {record.zoneId} | Rejects {record.rejectWeightKg.toFixed(2)} kg | {record.finalized ? "Finalized" : "Draft"} | {formatDateTime(record.harvestedAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Crop Catalog Manager</h2>
            <p className="mt-1 text-sm text-slate-600">
              Define reusable crop and cultivar references for planting batches.
            </p>
            <form className="mt-4 grid gap-3" onSubmit={submitCropCatalog}>
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={!canManageCatalog || isSubmittingCatalog}
                onChange={(event) =>
                  setCropCatalogForm((current) => ({ ...current, cropName: event.target.value }))
                }
                placeholder="Crop name"
                required
                type="text"
                value={cropCatalogForm.cropName}
              />
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={!canManageCatalog || isSubmittingCatalog}
                onChange={(event) =>
                  setCropCatalogForm((current) => ({ ...current, cultivar: event.target.value }))
                }
                placeholder="Cultivar (optional)"
                type="text"
                value={cropCatalogForm.cultivar}
              />
              <div className="grid gap-3 sm:grid-cols-2">
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  disabled={!canManageCatalog || isSubmittingCatalog}
                  onChange={(event) =>
                    setCropCatalogForm((current) => ({ ...current, seedSupplier: event.target.value }))
                  }
                  placeholder="Seed supplier"
                  type="text"
                  value={cropCatalogForm.seedSupplier}
                />
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  disabled={!canManageCatalog || isSubmittingCatalog}
                  onChange={(event) =>
                    setCropCatalogForm((current) => ({ ...current, seedLotCode: event.target.value }))
                  }
                  placeholder="Seed lot code"
                  type="text"
                  value={cropCatalogForm.seedLotCode}
                />
              </div>
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={!canManageCatalog || isSubmittingCatalog}
                min="1"
                onChange={(event) =>
                  setCropCatalogForm((current) => ({ ...current, targetCycleDays: event.target.value }))
                }
                placeholder="Target cycle days"
                type="number"
                value={cropCatalogForm.targetCycleDays}
              />
              <textarea
                className="min-h-16 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={!canManageCatalog || isSubmittingCatalog}
                onChange={(event) =>
                  setCropCatalogForm((current) => ({ ...current, notes: event.target.value }))
                }
                placeholder="Notes (optional)"
                value={cropCatalogForm.notes}
              />
              <button
                className="rounded-xl bg-emerald-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-emerald-500 disabled:cursor-not-allowed disabled:bg-emerald-300"
                disabled={!canManageCatalog || isSubmittingCatalog}
                type="submit"
              >
                {isSubmittingCatalog ? "Creating Catalog Item..." : "Create Catalog Item"}
              </button>
              {!canManageCatalog ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Crop catalog management requires role: Grow Manager or Admin.
                </p>
              ) : null}
            </form>
          </article>

          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Batch-Zone Assignment Manager</h2>
            <p className="mt-1 text-sm text-slate-600">
              Track assignment intervals as batches move between zones.
            </p>
            <form className="mt-4 grid gap-3" onSubmit={submitBatchAssignment}>
              <select
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={!canManageCatalog || isSubmittingAssignment}
                onChange={(event) => handleAssignmentBatchSelection(event.target.value)}
                required
                value={assignmentForm.batchId}
              >
                <option value="">Select batch</option>
                {batches.map((batch) => (
                  <option key={batch.id} value={batch.id}>
                    {batch.batchCode} ({batch.cropName})
                  </option>
                ))}
              </select>
              <input
                className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={!canManageCatalog || isSubmittingAssignment}
                onChange={(event) =>
                  setAssignmentForm((current) => ({ ...current, zoneId: event.target.value }))
                }
                placeholder="Zone ID"
                required
                type="text"
                value={assignmentForm.zoneId}
              />
              <label className="grid gap-1 text-xs text-slate-600">
                Assignment timestamp (optional)
                <input
                  className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                  disabled={!canManageCatalog || isSubmittingAssignment}
                  onChange={(event) =>
                    setAssignmentForm((current) => ({ ...current, assignedAt: event.target.value }))
                  }
                  type="datetime-local"
                  value={assignmentForm.assignedAt}
                />
              </label>
              <textarea
                className="min-h-16 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm"
                disabled={!canManageCatalog || isSubmittingAssignment}
                onChange={(event) =>
                  setAssignmentForm((current) => ({ ...current, assignmentReason: event.target.value }))
                }
                placeholder="Assignment reason (optional)"
                value={assignmentForm.assignmentReason}
              />
              <button
                className="rounded-xl bg-sky-600 px-4 py-3 text-sm font-medium text-white transition hover:bg-sky-500 disabled:cursor-not-allowed disabled:bg-sky-300"
                disabled={!canManageCatalog || isSubmittingAssignment}
                type="submit"
              >
                {isSubmittingAssignment ? "Assigning Batch..." : "Assign Batch to Zone"}
              </button>
              {!canManageCatalog ? (
                <p className="rounded-xl border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800">
                  Batch-zone assignment requires role: Grow Manager or Admin.
                </p>
              ) : null}
            </form>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Recent Crop Catalog Items</h2>
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {isLoadingLifecycleData ? "Loading..." : `${catalogItems.length} items`}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {catalogItems.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  No crop catalog items yet.
                </p>
              ) : (
                catalogItems.slice(0, 6).map((item) => (
                  <div
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    key={item.id}
                  >
                    <p className="font-medium">
                      {item.cropName}
                      {item.cultivar ? ` / ${item.cultivar}` : ""}
                    </p>
                    <p className="text-xs text-slate-500">
                      {item.seedSupplier ? `Supplier ${item.seedSupplier} | ` : ""}
                      {item.targetCycleDays ? `${item.targetCycleDays} days cycle | ` : ""}
                      Created {formatDateTime(item.createdAt)}
                    </p>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <div className="flex items-center justify-between gap-3">
              <h2 className="text-lg font-semibold">Recent Zone Assignments</h2>
              <span className="text-xs uppercase tracking-wide text-slate-500">
                {isLoadingLifecycleData ? "Loading..." : `${zoneAssignments.length} items`}
              </span>
            </div>
            <div className="mt-4 space-y-2">
              {zoneAssignments.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                  No zone assignments yet.
                </p>
              ) : (
                zoneAssignments.slice(0, 6).map((assignment) => (
                  <div
                    className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700"
                    key={assignment.id}
                  >
                    <p className="font-medium">
                      Batch {assignment.batchId} - Zone {assignment.zoneId}
                    </p>
                    <p className="text-xs text-slate-500">
                      Assigned {formatDateTime(assignment.assignedAt)}
                      {assignment.assignmentReason ? ` | ${assignment.assignmentReason}` : ""}
                    </p>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        {lifecycleError ? (
          <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">
            {lifecycleError}
          </p>
        ) : null}

        {lifecycleSuccess ? (
          <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">
            {lifecycleSuccess}
          </p>
        ) : null}
      </main>
    </div>
  );
}
