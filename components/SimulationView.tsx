"use client";

/**
 * SimulationView — the entire app shell below the Navbar.
 * Owns all simulation state and orchestrates API calls.
 *
 * Layout (top → bottom):
 *   Command bar  (fixed height)
 *   ──────────────────────────
 *   Gantt area   (resizable)
 *   ── drag divider ──────────
 *   Graph area   (placeholder, min 20% of flex container)
 *   ──────────────────────────
 *   Horizontal scrollbar
 */

import { useCallback, useEffect, useRef, useState } from "react";
import type { Asset, EngineResult } from "@/lib/engine/types";
import type { Simulation } from "@/lib/engine/types";
import { toMonthIndex, simTotalMonths } from "@/lib/gantt";
import Navbar from "./Navbar";
import Toast, { type ToastMessage } from "./Toast";
import NewSimModal from "./NewSimModal";
import LoadModal from "./LoadModal";
import AssetModal from "./AssetModal";
import GanttChart from "./GanttChart";

interface Props {
  email: string;
  /** ID of the simulation to auto-load (most recent), or null if user has none. */
  initialSimId: string | null;
}

let toastCounter = 0;
function mkToast(message: string, type: ToastMessage["type"] = "success"): ToastMessage {
  return { id: String(++toastCounter), message, type };
}

export default function SimulationView({ email, initialSimId }: Props) {
  const [simulation, setSimulation] = useState<Simulation | null>(null);
  const [engineResult, setEngineResult] = useState<EngineResult | null>(null);
  const [includePension, setIncludePension] = useState(true);

  // Viewport: visible window on the timeline
  const [visibleStartMonth, setVisibleStartMonth] = useState(0);
  const [visibleMonths, setVisibleMonths] = useState(12); // initialised on sim load

  // Divider: gantt takes `ganttPct`% of the flex body, graph takes the rest
  const [ganttPct, setGanttPct] = useState(65);
  const flexBodyRef = useRef<HTMLDivElement>(null);

  // Toasts
  const [toasts, setToasts] = useState<ToastMessage[]>([]);
  const pushToast = useCallback((msg: string, type: ToastMessage["type"] = "success") => {
    setToasts((prev) => [...prev, mkToast(msg, type)]);
  }, []);
  const dismissToast = useCallback((id: string) => {
    setToasts((prev) => prev.filter((t) => t.id !== id));
  }, []);

  // Modals
  const [showNewSim, setShowNewSim]     = useState(false);
  const [showLoad, setShowLoad]         = useState(false);
  const [showAsset, setShowAsset]       = useState(false);
  const [editingAsset, setEditingAsset] = useState<Asset | null>(null);

  // ── Load simulation ──────────────────────────────────────────────────────

  const loadSimulation = useCallback(async (simId: string) => {
    try {
      const res = await fetch(`/api/simulations/${simId}`);
      if (!res.ok) throw new Error("Kunne ikke hente simulering.");
      const sim: Simulation = await res.json();
      setSimulation(sim);
      // Default zoom = full period
      const total = simTotalMonths(sim.startDate, sim.endDate);
      setVisibleStartMonth(0);
      setVisibleMonths(total);
      return sim;
    } catch (e: unknown) {
      pushToast(e instanceof Error ? e.message : "Fejl.", "error");
      return null;
    }
  }, [pushToast]);

  const calculate = useCallback(async (simId: string, pension: boolean) => {
    try {
      const res = await fetch(
        `/api/simulations/${simId}/calculate${pension ? "" : "?include_pension=false"}`
      );
      if (!res.ok) throw new Error("Beregning fejlede.");
      const result: EngineResult = await res.json();
      setEngineResult(result);
    } catch {
      // Non-critical — don't block the UI
    }
  }, []);

  // Auto-load on mount
  useEffect(() => {
    if (initialSimId) {
      loadSimulation(initialSimId).then((sim) => {
        if (sim) calculate(sim.id, includePension);
      });
    } else {
      setShowNewSim(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Recalculate whenever includePension changes
  useEffect(() => {
    if (simulation) calculate(simulation.id, includePension);
  }, [includePension, simulation, calculate]);

  // ── Draggable divider ────────────────────────────────────────────────────

  function onDividerMouseDown(e: React.MouseEvent) {
    e.preventDefault();
    const startY   = e.clientY;
    const bodyH    = flexBodyRef.current?.getBoundingClientRect().height ?? 600;
    const startPct = ganttPct;

    function onMove(ev: MouseEvent) {
      const dy     = ev.clientY - startY;
      const newPct = startPct + (dy / bodyH) * 100;
      setGanttPct(Math.max(20, Math.min(80, newPct)));
    }
    function onUp() {
      window.removeEventListener("mousemove", onMove);
      window.removeEventListener("mouseup",   onUp);
    }
    window.addEventListener("mousemove", onMove);
    window.addEventListener("mouseup",   onUp);
  }

  // ── Zoom ─────────────────────────────────────────────────────────────────

  const totalMonths = simulation
    ? simTotalMonths(simulation.startDate, simulation.endDate)
    : 12;

  function zoomIn() {
    if (!simulation) return;
    const newV = Math.max(12, visibleMonths - 12);
    const center = visibleStartMonth + visibleMonths / 2;
    const newStart = Math.max(0, Math.min(Math.round(center - newV / 2), totalMonths - newV));
    setVisibleMonths(newV);
    setVisibleStartMonth(newStart);
  }

  function zoomOut() {
    if (!simulation) return;
    const newV = Math.min(totalMonths, visibleMonths + 12);
    const center = visibleStartMonth + visibleMonths / 2;
    const newStart = Math.max(0, Math.min(Math.round(center - newV / 2), totalMonths - newV));
    setVisibleMonths(newV);
    setVisibleStartMonth(newStart);
  }

  // ── Horizontal scroll ────────────────────────────────────────────────────

  const maxScroll = Math.max(0, totalMonths - visibleMonths);

  function onScroll(e: React.ChangeEvent<HTMLInputElement>) {
    setVisibleStartMonth(parseInt(e.target.value));
  }

  // ── Asset mutations ───────────────────────────────────────────────────────

  async function handleAssetSaved(saved: Asset, isNew: boolean) {
    if (!simulation) return;
    setShowAsset(false);
    setEditingAsset(null);

    setSimulation((prev) => {
      if (!prev) return prev;
      const assets = isNew
        ? [...prev.assets, saved]
        : prev.assets.map((a) => (a.id === saved.id ? saved : a));
      return { ...prev, assets };
    });

    await calculate(simulation.id, includePension);
    pushToast(isNew ? "Asset oprettet." : "Asset gemt.");
  }

  async function handleAssetDeleted(assetId: string) {
    if (!simulation) return;
    setShowAsset(false);
    setEditingAsset(null);

    setSimulation((prev) => {
      if (!prev) return prev;
      return { ...prev, assets: prev.assets.filter((a) => a.id !== assetId) };
    });

    await calculate(simulation.id, includePension);
    pushToast("Asset slettet.");
  }

  async function handleDatesChanged(assetId: string, startDate: string, endDate: string) {
    if (!simulation) return;

    // Optimistic update
    setSimulation((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        assets: prev.assets.map((a) =>
          a.id === assetId ? { ...a, startDate, endDate } : a
        ),
      };
    });

    try {
      await fetch(`/api/simulations/${simulation.id}/assets/${assetId}`, {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ start_date: startDate, end_date: endDate }),
      });
      await calculate(simulation.id, includePension);
    } catch {
      pushToast("Fejl ved opdatering af datoer.", "error");
    }
  }

  async function handleReorder(orderedIds: string[]) {
    if (!simulation) return;

    // Build new display_order mapping
    const updates = orderedIds.map((id, idx) => ({ id, displayOrder: idx }));

    setSimulation((prev) => {
      if (!prev) return prev;
      return {
        ...prev,
        assets: prev.assets.map((a) => {
          const u = updates.find((x) => x.id === a.id);
          return u ? { ...a, displayOrder: u.displayOrder } : a;
        }),
      };
    });

    // Persist each updated order in parallel
    await Promise.all(
      updates.map(({ id, displayOrder }) =>
        fetch(`/api/simulations/${simulation.id}/assets/${id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ display_order: displayOrder }),
        })
      )
    );
  }

  // ── New simulation created ────────────────────────────────────────────────

  async function handleNewSimCreated(sim: {
    id: string; name: string; start_date: string; end_date: string;
  }) {
    setShowNewSim(false);
    const loaded = await loadSimulation(sim.id);
    if (loaded) calculate(loaded.id, includePension);
  }

  // ── Load from modal ───────────────────────────────────────────────────────

  async function handleLoad(sim: { id: string }) {
    setShowLoad(false);
    const loaded = await loadSimulation(sim.id);
    if (loaded) {
      await calculate(loaded.id, includePension);
      pushToast("Simulering indlæst.");
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────

  const hasErrors = simulation
    ? (() => {
        const ids = new Set(simulation.assets.map((a) => a.id));
        return simulation.assets.some((a) => a.parentId && !ids.has(a.parentId));
      })()
    : false;

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* ── Navbar ── */}
      <Navbar email={email} showLogout />

      {/* ── Command bar ── */}
      <div className="shrink-0 bg-gray-900 border-b border-gray-800 px-4 py-2 flex items-center gap-2 flex-wrap">
        {/* Simulation name */}
        {simulation && (
          <span className="text-gray-300 text-sm font-medium mr-2 truncate max-w-48">
            {simulation.name}
          </span>
        )}

        <CmdBtn onClick={() => setShowLoad(true)}>Load</CmdBtn>

        <CmdBtn
          onClick={() => {
            if (!simulation) { pushToast("Ingen simulering at gemme.", "error"); return; }
            pushToast("Alt er gemt automatisk ✓");
          }}
        >
          Gem
        </CmdBtn>

        <CmdBtn
          onClick={() => {
            if (!simulation) { pushToast("Opret en simulering først.", "error"); return; }
            setEditingAsset(null);
            setShowAsset(true);
          }}
          accent
        >
          + Asset
        </CmdBtn>

        <CmdBtn
          onClick={() => pushToast("Funktioner kommer i fase 4.", "info")}
        >
          + Ny funktion
        </CmdBtn>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        <CmdBtn onClick={zoomIn} disabled={!simulation || visibleMonths <= 12}>
          Zoom ind
        </CmdBtn>
        <CmdBtn onClick={zoomOut} disabled={!simulation || visibleMonths >= totalMonths}>
          Zoom ud
        </CmdBtn>

        <div className="w-px h-5 bg-gray-700 mx-1" />

        {/* Medtag pension toggle */}
        <button
          className={`text-xs px-3 py-1.5 rounded border transition-colors ${
            includePension
              ? "border-purple-500 bg-purple-900/40 text-purple-300"
              : "border-gray-600 bg-gray-800 text-gray-500"
          }`}
          onClick={() => setIncludePension((v) => !v)}
        >
          {includePension ? "✓ " : ""}Medtag pension
        </button>

        <CmdBtn onClick={() => pushToast("Scenarier kommer senere.", "info")}>
          + Scenario
        </CmdBtn>
      </div>

      {/* ── Body: Gantt + divider + Graph + scrollbar ── */}
      <div ref={flexBodyRef} className="flex-1 flex flex-col overflow-hidden min-h-0">

        {/* Gantt area */}
        <div
          className="relative overflow-hidden"
          style={{ height: `${ganttPct}%`, minHeight: 80 }}
        >
          {simulation ? (
            <GanttChart
              assets={simulation.assets}
              simulation={{ startDate: simulation.startDate, endDate: simulation.endDate }}
              engineResult={engineResult}
              visibleStartMonth={visibleStartMonth}
              visibleMonths={visibleMonths}
              onDatesChanged={handleDatesChanged}
              onReorder={handleReorder}
              onClickAsset={(a) => { setEditingAsset(a); setShowAsset(true); }}
            />
          ) : (
            <div className="h-full flex items-center justify-center text-gray-600 text-sm select-none">
              Ingen simulering indlæst
            </div>
          )}
        </div>

        {/* Drag divider */}
        <div
          className="shrink-0 h-1.5 bg-gray-800 hover:bg-gray-600 cursor-row-resize transition-colors flex items-center justify-center border-y border-gray-700"
          onMouseDown={onDividerMouseDown}
        >
          <div className="w-12 h-0.5 bg-gray-600 rounded-full" />
        </div>

        {/* Graph placeholder */}
        <div
          className="flex-1 bg-gray-900 flex items-center justify-center border-t border-gray-800 overflow-hidden"
          style={{ minHeight: "20%" }}
        >
          <span className="text-gray-600 text-sm select-none">
            {hasErrors ? "NA — assets i fejl-tilstand" : "Grafer — kommer i fase 5"}
          </span>
        </div>

        {/* Horizontal scrollbar */}
        {simulation && maxScroll > 0 && (
          <div className="shrink-0 bg-gray-950 border-t border-gray-800 px-4 py-1.5">
            <input
              type="range"
              min={0}
              max={maxScroll}
              value={visibleStartMonth}
              onChange={onScroll}
              className="w-full h-2 accent-gray-500 cursor-pointer"
            />
          </div>
        )}
      </div>

      {/* ── Modals ── */}
      {showNewSim && (
        <NewSimModal onCreated={handleNewSimCreated} />
      )}

      {showLoad && (
        <LoadModal
          onLoad={handleLoad}
          onClose={() => setShowLoad(false)}
        />
      )}

      {showAsset && simulation && (
        <AssetModal
          simulationId={simulation.id}
          simStart={simulation.startDate}
          simEnd={simulation.endDate}
          existingAssets={simulation.assets}
          asset={editingAsset ?? undefined}
          onSaved={handleAssetSaved}
          onDeleted={handleAssetDeleted}
          onClose={() => { setShowAsset(false); setEditingAsset(null); }}
        />
      )}

      {/* ── Toasts ── */}
      <Toast toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

// ── Small helper: command bar button ─────────────────────────────────────────

function CmdBtn({
  children, onClick, accent, disabled,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  accent?: boolean;
  disabled?: boolean;
}) {
  return (
    <button
      className={`text-xs px-3 py-1.5 rounded border transition-colors disabled:opacity-40 ${
        accent
          ? "border-blue-500 bg-blue-900/40 text-blue-300 hover:bg-blue-800/50"
          : "border-gray-600 bg-gray-800 text-gray-300 hover:border-gray-500 hover:text-white"
      }`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  );
}
