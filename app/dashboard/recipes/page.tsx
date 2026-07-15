"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import type { Recipe, FarmZone, ZoneRecipeAssignment } from "@/types";

type ZoneFormState = {
  name: string;
  zoneType: "tier-as-zone" | "column-as-zone" | "custom";
  memberIds: string;
  actuatorGroup: string;
  notes: string;
};

type RecipeFormState = {
  name: string;
  cropName: string;
  topologyMode: "tier-as-zone" | "column-as-zone" | "custom";
  notes: string;
  phasesJson: string;
};

type AssignmentFormState = {
  zoneId: string;
  recipeId: string;
  startedAt: string;
  notes: string;
};

const INITIAL_ZONE_FORM: ZoneFormState = {
  name: "",
  zoneType: "tier-as-zone",
  memberIds: "",
  actuatorGroup: "",
  notes: "",
};

const INITIAL_RECIPE_FORM: RecipeFormState = {
  name: "",
  cropName: "",
  topologyMode: "tier-as-zone",
  notes: "",
  phasesJson: JSON.stringify(
    [
      {
        name: "Establishment",
        order: 1,
        durationDays: 7,
        setpoints: { ph: 6.0, humidity: 65, temperature: 22 },
      },
    ],
    null,
    2,
  ),
};

const INITIAL_ASSIGNMENT_FORM: AssignmentFormState = {
  zoneId: "",
  recipeId: "",
  startedAt: "",
  notes: "",
};

function formatDateTime(iso: string) {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) {
    return iso;
  }
  return date.toLocaleString();
}

export default function RecipesPage() {
  const [zones, setZones] = useState<FarmZone[]>([]);
  const [recipes, setRecipes] = useState<Recipe[]>([]);
  const [assignments, setAssignments] = useState<ZoneRecipeAssignment[]>([]);
  const [zoneForm, setZoneForm] = useState<ZoneFormState>(INITIAL_ZONE_FORM);
  const [recipeForm, setRecipeForm] = useState<RecipeFormState>(INITIAL_RECIPE_FORM);
  const [assignmentForm, setAssignmentForm] = useState<AssignmentFormState>(INITIAL_ASSIGNMENT_FORM);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreatingZone, setIsCreatingZone] = useState(false);
  const [isCreatingRecipe, setIsCreatingRecipe] = useState(false);
  const [isAssigningRecipe, setIsAssigningRecipe] = useState(false);
  const [activeAssignmentId, setActiveAssignmentId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  async function loadData() {
    setIsLoading(true);
    setError(null);

    try {
      const [zonesResponse, recipesResponse, assignmentsResponse] = await Promise.all([
        fetch("/api/protected/zones?limit=200", { cache: "no-store" }),
        fetch("/api/protected/recipes?limit=200", { cache: "no-store" }),
        fetch("/api/protected/zone-recipe-assignments?limit=250", { cache: "no-store" }),
      ]);

      if (!zonesResponse.ok || !recipesResponse.ok || !assignmentsResponse.ok) {
        throw new Error("Unable to load recipes workspace.");
      }

      const zonesData: { items?: FarmZone[] } = await zonesResponse.json();
      const recipesData: { items?: Recipe[] } = await recipesResponse.json();
      const assignmentsData: { items?: ZoneRecipeAssignment[] } = await assignmentsResponse.json();

      const parsedZones = Array.isArray(zonesData.items) ? zonesData.items : [];
      const parsedRecipes = Array.isArray(recipesData.items) ? recipesData.items : [];
      const parsedAssignments = Array.isArray(assignmentsData.items) ? assignmentsData.items : [];

      setZones(parsedZones);
      setRecipes(parsedRecipes);
      setAssignments(parsedAssignments);

      setAssignmentForm((current) => ({
        ...current,
        zoneId: current.zoneId || parsedZones[0]?.id || "",
        recipeId: current.recipeId || parsedRecipes[0]?.id || "",
      }));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to load recipes workspace.");
    } finally {
      setIsLoading(false);
    }
  }

  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void loadData();
  }, []);

  async function createZone() {
    setIsCreatingZone(true);
    setError(null);
    setSuccess(null);

    try {
      const memberIds = zoneForm.memberIds
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item.length > 0);

      const response = await fetch("/api/protected/zones", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: zoneForm.name,
          zoneType: zoneForm.zoneType,
          memberIds,
          actuatorGroup: zoneForm.actuatorGroup || undefined,
          notes: zoneForm.notes || undefined,
        }),
      });

      const payload: { error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create zone.");
      }

      setZoneForm(INITIAL_ZONE_FORM);
      setSuccess("Zone created.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create zone.");
    } finally {
      setIsCreatingZone(false);
    }
  }

  async function createRecipe() {
    setIsCreatingRecipe(true);
    setError(null);
    setSuccess(null);

    try {
      const phases = JSON.parse(recipeForm.phasesJson);
      if (!Array.isArray(phases) || phases.length === 0) {
        throw new Error("Recipe phases must be a non-empty JSON array.");
      }

      const response = await fetch("/api/protected/recipes", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          name: recipeForm.name,
          cropName: recipeForm.cropName || undefined,
          topologyMode: recipeForm.topologyMode,
          notes: recipeForm.notes || undefined,
          phases,
        }),
      });

      const payload: { error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to create recipe.");
      }

      setRecipeForm(INITIAL_RECIPE_FORM);
      setSuccess("Recipe created.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to create recipe.");
    } finally {
      setIsCreatingRecipe(false);
    }
  }

  async function assignRecipe() {
    setIsAssigningRecipe(true);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch("/api/protected/zone-recipe-assignments", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          zoneId: assignmentForm.zoneId,
          recipeId: assignmentForm.recipeId,
          startedAt: assignmentForm.startedAt
            ? new Date(assignmentForm.startedAt).toISOString()
            : undefined,
          notes: assignmentForm.notes || undefined,
        }),
      });

      const payload: { error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to assign recipe.");
      }

      setAssignmentForm(INITIAL_ASSIGNMENT_FORM);
      setSuccess("Recipe assigned to zone.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to assign recipe.");
    } finally {
      setIsAssigningRecipe(false);
    }
  }

  async function closeAssignment(assignmentId: string) {
    setActiveAssignmentId(assignmentId);
    setError(null);
    setSuccess(null);

    try {
      const response = await fetch(`/api/protected/zone-recipe-assignments/${assignmentId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ status: "completed" }),
      });
      const payload: { error?: string } = await response.json().catch(() => ({}));
      if (!response.ok) {
        throw new Error(payload.error ?? "Unable to close assignment.");
      }

      setSuccess("Assignment completed.");
      await loadData();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to close assignment.");
    } finally {
      setActiveAssignmentId(null);
    }
  }

  const zoneById = useMemo(() => new Map(zones.map((zone) => [zone.id, zone])), [zones]);
  const recipeById = useMemo(() => new Map(recipes.map((recipe) => [recipe.id, recipe])), [recipes]);

  return (
    <div className="relative min-h-screen overflow-hidden bg-[radial-gradient(circle_at_16%_10%,#ecf7df_0%,#eef8ff_36%,#f7eee2_68%,#fefefe_100%)] text-slate-900">
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(130deg,rgba(16,185,129,.08),rgba(2,132,199,.08),rgba(249,115,22,.08))]" />

      <main className="relative mx-auto flex w-full max-w-7xl flex-col gap-8 px-6 py-10 md:px-10">
        <header className="flex flex-col gap-4 rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm md:flex-row md:items-center md:justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-[0.2em] text-emerald-700">Phase 4 Workspace</p>
            <h1 className="mt-2 text-3xl font-bold tracking-tight md:text-4xl">Recipes and Zone Topology</h1>
            <p className="mt-2 text-sm text-slate-600 md:text-base">
              Create zones, define recipe phases, and assign recipes with conflict safeguards.
            </p>
          </div>
          <div className="flex items-center gap-3">
            <button
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:cursor-not-allowed disabled:bg-slate-100"
              disabled={isLoading}
              onClick={() => {
                void loadData();
              }}
              type="button"
            >
              {isLoading ? "Refreshing..." : "Refresh"}
            </button>
            <Link className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50" href="/dashboard">
              Back to Dashboard
            </Link>
          </div>
        </header>

        {error ? <p className="rounded-xl border border-rose-200 bg-rose-50 px-4 py-3 text-sm text-rose-700">{error}</p> : null}
        {success ? <p className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-700">{success}</p> : null}

        <section className="grid gap-4 lg:grid-cols-3">
          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Create Zone</h2>
            <div className="mt-4 grid gap-3">
              <input className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Zone name" value={zoneForm.name} onChange={(event) => setZoneForm((current) => ({ ...current, name: event.target.value }))} />
              <select className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" value={zoneForm.zoneType} onChange={(event) => setZoneForm((current) => ({ ...current, zoneType: event.target.value as ZoneFormState["zoneType"] }))}>
                <option value="tier-as-zone">tier-as-zone</option>
                <option value="column-as-zone">column-as-zone</option>
                <option value="custom">custom</option>
              </select>
              <input className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Members (comma-separated IDs)" value={zoneForm.memberIds} onChange={(event) => setZoneForm((current) => ({ ...current, memberIds: event.target.value }))} />
              <input className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Actuator group (optional)" value={zoneForm.actuatorGroup} onChange={(event) => setZoneForm((current) => ({ ...current, actuatorGroup: event.target.value }))} />
              <textarea className="min-h-20 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Notes (optional)" value={zoneForm.notes} onChange={(event) => setZoneForm((current) => ({ ...current, notes: event.target.value }))} />
              <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-300" disabled={isCreatingZone || zoneForm.name.trim().length < 2} onClick={() => { void createZone(); }} type="button">
                {isCreatingZone ? "Creating..." : "Create Zone"}
              </button>
            </div>
          </article>

          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Create Recipe</h2>
            <div className="mt-4 grid gap-3">
              <input className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Recipe name" value={recipeForm.name} onChange={(event) => setRecipeForm((current) => ({ ...current, name: event.target.value }))} />
              <input className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Crop name (optional)" value={recipeForm.cropName} onChange={(event) => setRecipeForm((current) => ({ ...current, cropName: event.target.value }))} />
              <select className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" value={recipeForm.topologyMode} onChange={(event) => setRecipeForm((current) => ({ ...current, topologyMode: event.target.value as RecipeFormState["topologyMode"] }))}>
                <option value="tier-as-zone">tier-as-zone</option>
                <option value="column-as-zone">column-as-zone</option>
                <option value="custom">custom</option>
              </select>
              <textarea className="min-h-20 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Notes (optional)" value={recipeForm.notes} onChange={(event) => setRecipeForm((current) => ({ ...current, notes: event.target.value }))} />
              <textarea className="min-h-32 rounded-xl border border-slate-300 bg-white px-3 py-2 font-mono text-xs" placeholder="Recipe phases JSON" value={recipeForm.phasesJson} onChange={(event) => setRecipeForm((current) => ({ ...current, phasesJson: event.target.value }))} />
              <button className="rounded-xl bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-emerald-300" disabled={isCreatingRecipe || recipeForm.name.trim().length < 2} onClick={() => { void createRecipe(); }} type="button">
                {isCreatingRecipe ? "Creating..." : "Create Recipe"}
              </button>
            </div>
          </article>

          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Assign Recipe</h2>
            <div className="mt-4 grid gap-3">
              <select className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" value={assignmentForm.zoneId} onChange={(event) => setAssignmentForm((current) => ({ ...current, zoneId: event.target.value }))}>
                <option value="">Select zone</option>
                {zones.map((zone) => (
                  <option key={zone.id} value={zone.id}>{zone.name}</option>
                ))}
              </select>
              <select className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" value={assignmentForm.recipeId} onChange={(event) => setAssignmentForm((current) => ({ ...current, recipeId: event.target.value }))}>
                <option value="">Select recipe</option>
                {recipes.map((recipe) => (
                  <option key={recipe.id} value={recipe.id}>{recipe.name}</option>
                ))}
              </select>
              <label className="grid gap-1 text-xs text-slate-600">
                Start time (optional)
                <input className="rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" type="datetime-local" value={assignmentForm.startedAt} onChange={(event) => setAssignmentForm((current) => ({ ...current, startedAt: event.target.value }))} />
              </label>
              <textarea className="min-h-20 rounded-xl border border-slate-300 bg-white px-3 py-2 text-sm" placeholder="Assignment notes" value={assignmentForm.notes} onChange={(event) => setAssignmentForm((current) => ({ ...current, notes: event.target.value }))} />
              <button className="rounded-xl bg-slate-900 px-4 py-2 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:bg-slate-400" disabled={isAssigningRecipe || !assignmentForm.zoneId || !assignmentForm.recipeId} onClick={() => { void assignRecipe(); }} type="button">
                {isAssigningRecipe ? "Assigning..." : "Assign Recipe"}
              </button>
            </div>
          </article>
        </section>

        <section className="grid gap-4 lg:grid-cols-2">
          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Zones</h2>
            <div className="mt-4 space-y-2">
              {zones.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">No zones yet.</p>
              ) : (
                zones.map((zone) => (
                  <div key={zone.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <p className="font-semibold">{zone.name}</p>
                    <p className="text-xs text-slate-500">{zone.zoneType} | members {zone.memberIds.length} | group {zone.actuatorGroup ?? "n/a"}</p>
                  </div>
                ))
              )}
            </div>
          </article>

          <article className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
            <h2 className="text-lg font-semibold">Recipes</h2>
            <div className="mt-4 space-y-2">
              {recipes.length === 0 ? (
                <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">No recipes yet.</p>
              ) : (
                recipes.map((recipe) => (
                  <div key={recipe.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                    <p className="font-semibold">{recipe.name}</p>
                    <p className="text-xs text-slate-500">{recipe.topologyMode} | phases {recipe.phases.length} | crop {recipe.cropName ?? "n/a"}</p>
                  </div>
                ))
              )}
            </div>
          </article>
        </section>

        <section className="rounded-3xl border border-white/60 bg-white/75 p-6 shadow-[0_18px_40px_-26px_rgba(15,23,42,.5)] backdrop-blur-sm">
          <h2 className="text-lg font-semibold">Zone Recipe Assignments</h2>
          <div className="mt-4 space-y-2">
            {assignments.length === 0 ? (
              <p className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">No assignments yet.</p>
            ) : (
              assignments.map((assignment) => (
                <div key={assignment.id} className="rounded-xl border border-slate-200 bg-white px-3 py-2 text-sm text-slate-700">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <p className="font-semibold">
                      {zoneById.get(assignment.zoneId)?.name ?? assignment.zoneId}
                      {" -> "}
                      {recipeById.get(assignment.recipeId)?.name ?? assignment.recipeId}
                    </p>
                    <span className="rounded-full border border-slate-300 px-2 py-1 text-[10px] font-semibold uppercase tracking-wide text-slate-700">{assignment.status}</span>
                  </div>
                  <p className="mt-1 text-xs text-slate-500">Started {formatDateTime(assignment.startedAt)}{assignment.endedAt ? ` | Ended ${formatDateTime(assignment.endedAt)}` : ""}</p>
                  {assignment.status === "active" ? (
                    <div className="mt-3">
                      <button
                        className="rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold uppercase tracking-wide text-white disabled:cursor-not-allowed disabled:bg-slate-400"
                        disabled={activeAssignmentId === assignment.id}
                        onClick={() => {
                          void closeAssignment(assignment.id);
                        }}
                        type="button"
                      >
                        {activeAssignmentId === assignment.id ? "Closing..." : "Complete Assignment"}
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
