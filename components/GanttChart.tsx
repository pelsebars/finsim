"use client";

/**
 * GanttChart renders the timeline header, all asset pølser, SVG arrows, and
 * handles drag interactions (end-resize and row-reorder).
 *
 * Coordinate system:
 *   - visibleStartMonth: 0-based month index from simStart of the left edge
 *   - visibleMonths: how many months fit in the visible window
 *   - Percentage-based positioning: left% = (assetStart - visibleStartMonth) / visibleMonths * 100
 */

import { useCallback, useRef, useState } from "react";
import type { Asset, AssetFunction, EngineResult } from "@/lib/engine/types";
import {
  toMonthIndex, fromMonthIndex, fmtVal, fmtMonthLong, parseYM, avgVariableRate,
} from "@/lib/gantt";

const ROW_H = 48; // px per asset row
const HANDLE_W = 10; // px width of drag handle zones
const ARROW_OFFSET = 15; // px shortening at parent right / child left

// Asset type colours
const TYPE_COLOR: Record<string, { bg: string; dark: string; text: string }> = {
  stock:    { bg: "#2563eb", dark: "#1d4ed8", text: "#bfdbfe" },
  liquid:   { bg: "#16a34a", dark: "#15803d", text: "#bbf7d0" },
  pension:  { bg: "#7c3aed", dark: "#6d28d9", text: "#ddd6fe" },
  property: { bg: "#ea580c", dark: "#c2410c", text: "#fed7aa" },
  loan:     { bg: "#dc2626", dark: "#b91c1c", text: "#fecaca" },
};

const TYPE_ICON: Record<string, string> = {
  stock: "📈", liquid: "💰", pension: "🏖️", property: "🏠", loan: "🏦",
};

interface Tooltip {
  assetId: string;
  label: string;
  x: number; // clientX
  y: number; // clientY
}

interface Props {
  assets: Asset[];
  simulation: { startDate: string; endDate: string };
  engineResult: EngineResult | null;
  visibleStartMonth: number;
  visibleMonths: number;
  onDatesChanged: (assetId: string, startDate: string, endDate: string) => void;
  onReorder: (orderedIds: string[]) => void;
  onClickAsset: (asset: Asset) => void;
  onClickFunction?: (fn: AssetFunction, assetId: string) => void;
}

export default function GanttChart({
  assets, simulation, engineResult, visibleStartMonth, visibleMonths,
  onDatesChanged, onReorder, onClickAsset, onClickFunction,
}: Props) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);
  const [dragOverIdx, setDragOverIdx] = useState<number | null>(null);

  // Sorted by displayOrder
  const sorted = [...assets].sort((a, b) => a.displayOrder - b.displayOrder);

  // Determine error assets: has parentId but parent not found
  const assetIds = new Set(assets.map(a => a.id));
  const errorAssets = new Set(
    assets
      .filter(a => a.parentId && !assetIds.has(a.parentId))
      .map(a => a.id)
  );

  // Also mark all downstream children of error assets as error
  let changed = true;
  while (changed) {
    changed = false;
    for (const a of assets) {
      if (!errorAssets.has(a.id) && a.parentId && errorAssets.has(a.parentId)) {
        errorAssets.add(a.id);
        changed = true;
      }
    }
  }

  // --- Coordinate helpers ---
  function monthFrac(monthIdx: number): number {
    return (monthIdx - visibleStartMonth) / visibleMonths;
  }
  function assetStartFrac(a: Asset): number {
    return monthFrac(toMonthIndex(a.startDate, simulation.startDate));
  }
  function assetEndFrac(a: Asset): number {
    return monthFrac(toMonthIndex(a.endDate, simulation.startDate));
  }

  // --- End-drag ---
  const dragState = useRef<{
    assetId: string;
    side: "start" | "end";
    startX: number;
    containerW: number;
    origMonth: number;
    otherMonth: number;
    parentEndMonth: number | null;
    childrenStartMonth: number | null;
  } | null>(null);

  const onHandleMouseDown = useCallback(
    (e: React.MouseEvent, assetId: string, side: "start" | "end") => {
      e.preventDefault();
      e.stopPropagation();
      const a = assets.find(x => x.id === assetId)!;
      const cw = containerRef.current?.getBoundingClientRect().width ?? 800;
      const startMonthIdx = toMonthIndex(a.startDate, simulation.startDate);
      const endMonthIdx   = toMonthIndex(a.endDate,   simulation.startDate);

      // Constraints
      let parentEndMonth: number | null = null;
      if (a.parentId) {
        const parent = assets.find(x => x.id === a.parentId);
        if (parent) parentEndMonth = toMonthIndex(parent.endDate, simulation.startDate);
      }
      let childrenStartMonth: number | null = null;
      const children = assets.filter(x => x.parentId === assetId);
      if (children.length > 0) {
        childrenStartMonth = Math.min(...children.map(c => toMonthIndex(c.startDate, simulation.startDate)));
      }

      dragState.current = {
        assetId,
        side,
        startX: e.clientX,
        containerW: cw,
        origMonth: side === "start" ? startMonthIdx : endMonthIdx,
        otherMonth: side === "start" ? endMonthIdx : startMonthIdx,
        parentEndMonth,
        childrenStartMonth,
      };

      function onMove(ev: MouseEvent) {
        if (!dragState.current) return;
        const dx = ev.clientX - dragState.current.startX;
        const pxPerMonth = dragState.current.containerW / visibleMonths;
        const deltaMonths = Math.round(dx / pxPerMonth);
        let newMonth = dragState.current.origMonth + deltaMonths;

        // Clamp
        if (dragState.current.side === "start") {
          // start cannot pass end (min 1 month gap)
          newMonth = Math.min(newMonth, dragState.current.otherMonth - 1);
          // if child, cannot be before parent's end
          if (dragState.current.parentEndMonth != null)
            newMonth = Math.max(newMonth, dragState.current.parentEndMonth);
        } else {
          // end cannot pass start
          newMonth = Math.max(newMonth, dragState.current.otherMonth + 1);
          // if has children, cannot move end past earliest child start
          if (dragState.current.childrenStartMonth != null)
            newMonth = Math.min(newMonth, dragState.current.childrenStartMonth);
        }
        // Clamp to simulation bounds
        const totalMonths = toMonthIndex(simulation.endDate, simulation.startDate);
        newMonth = Math.max(0, Math.min(newMonth, totalMonths));

        // Live update via a data attribute for visual feedback (optional — skip for simplicity)
      }

      function onUp(ev: MouseEvent) {
        if (!dragState.current) return;
        const ds = dragState.current;
        dragState.current = null;
        window.removeEventListener("mousemove", onMove);
        window.removeEventListener("mouseup", onUp);

        const dx = ev.clientX - ds.startX;
        const pxPerMonth = ds.containerW / visibleMonths;
        const deltaMonths = Math.round(dx / pxPerMonth);
        let newMonth = ds.origMonth + deltaMonths;

        if (ds.side === "start") {
          newMonth = Math.min(newMonth, ds.otherMonth - 1);
          if (ds.parentEndMonth != null) newMonth = Math.max(newMonth, ds.parentEndMonth);
        } else {
          newMonth = Math.max(newMonth, ds.otherMonth + 1);
          if (ds.childrenStartMonth != null) newMonth = Math.min(newMonth, ds.childrenStartMonth);
        }
        const totalMonths = toMonthIndex(simulation.endDate, simulation.startDate);
        newMonth = Math.max(0, Math.min(newMonth, totalMonths));

        const a2 = assets.find(x => x.id === ds.assetId)!;
        if (ds.side === "start") {
          onDatesChanged(
            ds.assetId,
            fromMonthIndex(newMonth, simulation.startDate),
            a2.endDate
          );
        } else {
          onDatesChanged(
            ds.assetId,
            a2.startDate,
            fromMonthIndex(newMonth, simulation.startDate)
          );
        }
      }

      window.addEventListener("mousemove", onMove);
      window.addEventListener("mouseup", onUp);
    },
    [assets, simulation, visibleMonths, onDatesChanged]
  );

  // --- Tooltip ---
  function handlePølseMouseMove(e: React.MouseEvent, a: Asset) {
    if (!engineResult || !containerRef.current) return;
    const rect = containerRef.current.getBoundingClientRect();
    const xFrac = (e.clientX - rect.left) / rect.width;
    const monthIdx = Math.floor(visibleStartMonth + xFrac * visibleMonths);
    const clampedIdx = Math.max(0, Math.min(monthIdx, engineResult.months.length - 1));
    const label = fmtMonthLong(engineResult.months[clampedIdx]);
    const values = engineResult.assets[a.id];
    const val = values ? fmtVal(values[clampedIdx] ?? 0) : "–";
    setTooltip({
      assetId: a.id,
      label: `${label}: ${val}`,
      x: e.clientX,
      y: e.clientY,
    });
  }

  // --- Vertical DnD ---
  const dragRowId = useRef<string | null>(null);

  function handleDragStart(e: React.DragEvent, id: string) {
    dragRowId.current = id;
    e.dataTransfer.effectAllowed = "move";
  }
  function handleDragOver(e: React.DragEvent, idx: number) {
    e.preventDefault();
    e.dataTransfer.dropEffect = "move";
    setDragOverIdx(idx);
  }
  function handleDrop(e: React.DragEvent, targetIdx: number) {
    e.preventDefault();
    setDragOverIdx(null);
    if (!dragRowId.current) return;
    const fromId = dragRowId.current;
    dragRowId.current = null;
    const currentOrder = [...sorted];
    const fromIdx = currentOrder.findIndex(a => a.id === fromId);
    if (fromIdx === -1 || fromIdx === targetIdx) return;
    const item = currentOrder.splice(fromIdx, 1)[0];
    currentOrder.splice(targetIdx, 0, item);
    onReorder(currentOrder.map(a => a.id));
  }

  // --- Timeline header ---
  const totalSimMonths = toMonthIndex(simulation.endDate, simulation.startDate) + 1;
  const showMonths = visibleMonths <= 36; // show month labels when ≤3 years visible

  function renderHeader() {
    const ticks: { frac: number; label: string; isYear: boolean }[] = [];
    // Iterate through months in visible window
    for (let i = 0; i <= visibleMonths; i++) {
      const absMonth = visibleStartMonth + i;
      if (absMonth > totalSimMonths) break;
      const dateStr = fromMonthIndex(absMonth, simulation.startDate);
      const [y, m] = parseYM(dateStr);
      if (m === 0) {
        // January — year tick
        ticks.push({ frac: i / visibleMonths, label: String(y), isYear: true });
      } else if (showMonths) {
        const monthNames = ["","jan","feb","mar","apr","maj","jun","jul","aug","sep","okt","nov","dec"];
        ticks.push({ frac: i / visibleMonths, label: monthNames[m + 1] ?? "", isYear: false });
      }
    }

    return (
      <div className="relative h-8 border-b border-gray-700 shrink-0 select-none">
        {ticks.map((t, i) => (
          <div
            key={i}
            className="absolute top-0 flex flex-col items-start"
            style={{ left: `${t.frac * 100}%` }}
          >
            <div className={`w-px ${t.isYear ? "h-4 bg-gray-500" : "h-2 bg-gray-600"}`} />
            <span className={`text-xs mt-0.5 whitespace-nowrap ${t.isYear ? "text-gray-300 font-medium" : "text-gray-500"}`}>
              {t.label}
            </span>
          </div>
        ))}
      </div>
    );
  }

  // --- Asset row ---
  function renderAsset(a: Asset, rowIdx: number) {
    const isError = errorAssets.has(a.id);
    const colors = isError
      ? { bg: "#dc2626", dark: "#991b1b", text: "#fecaca" }
      : TYPE_COLOR[a.type] ?? TYPE_COLOR.stock;

    const hasParentInList = a.parentId && assetIds.has(a.parentId);
    const hasChildren = assets.some(x => x.parentId === a.id);

    const startFrac = assetStartFrac(a);
    const endFrac   = assetEndFrac(a);
    const widthFrac = endFrac - startFrac;

    // Skip if entirely outside visible window
    if (startFrac > 1 || endFrac < 0) return null;

    // Clip to visible
    const clippedLeft  = Math.max(startFrac, 0);
    const clippedRight = Math.min(endFrac, 1);
    const clippedWidth = clippedRight - clippedLeft;

    // Arrow offsets in percentage
    const arrowOffsetFrac = ARROW_OFFSET / (containerRef.current?.getBoundingClientRect().width ?? 1200);

    // Parent shortens right end; child delays left end
    const rightShorten = hasChildren ? arrowOffsetFrac : 0;
    const leftDelay    = hasParentInList ? arrowOffsetFrac : 0;

    const leftFrac  = clippedLeft  + leftDelay;
    const rightFrac = clippedRight - rightShorten;
    const wFrac     = Math.max(rightFrac - leftFrac, 0.002);

    // Engine data
    const endMonthIdx = toMonthIndex(a.endDate, simulation.startDate);
    const startMonthIdx = toMonthIndex(a.startDate, simulation.startDate);
    const monthsArr = engineResult?.assets[a.id];
    const startValue = monthsArr ? fmtVal(monthsArr[Math.max(0, startMonthIdx)] ?? a.initialValue) : fmtVal(a.initialValue);
    const endValue   = monthsArr ? fmtVal(monthsArr[Math.min(endMonthIdx, monthsArr.length - 1)] ?? 0) : "–";

    // Surplus warning
    const surplus = engineResult?.surpluses[a.id];
    const hasSurplus = surplus != null && surplus > 0;

    // Rate label
    let rateLabel = "";
    if (a.type !== "loan") {
      if (a.variableRates) {
        const avg = avgVariableRate(a.variableRates, a.startDate, a.endDate);
        rateLabel = `${Math.round(avg * 100)}%`;
      } else if (a.annualRate != null) {
        rateLabel = `${Math.round(a.annualRate * 100)}%`;
      }
    }

    const isDragOver = dragOverIdx === rowIdx;

    return (
      <div
        key={a.id}
        className="relative shrink-0"
        style={{ height: ROW_H, borderBottom: "1px solid rgb(31,41,55)" }}
        draggable
        onDragStart={(e) => handleDragStart(e, a.id)}
        onDragOver={(e) => handleDragOver(e, rowIdx)}
        onDrop={(e) => handleDrop(e, rowIdx)}
        onDragLeave={() => setDragOverIdx(null)}
      >
        {/* Drop indicator */}
        {isDragOver && (
          <div className="absolute top-0 left-0 right-0 h-0.5 bg-blue-400 z-20" />
        )}

        {/* Pølse */}
        <div
          className="absolute top-1/2 -translate-y-1/2 rounded overflow-hidden flex items-center cursor-pointer select-none group"
          style={{
            left: `${leftFrac * 100}%`,
            width: `${wFrac * 100}%`,
            height: 32,
            backgroundColor: colors.bg,
            minWidth: 4,
          }}
          onMouseMove={(e) => handlePølseMouseMove(e, a)}
          onMouseLeave={() => setTooltip(null)}
          onClick={(e) => {
            // Only open edit if not clicking a handle
            const target = e.target as HTMLElement;
            if (target.dataset.handle) return;
            onClickAsset(a);
          }}
        >
          {/* Left darker handle */}
          <div
            className="shrink-0 flex items-center justify-center cursor-ew-resize"
            style={{ width: HANDLE_W, height: "100%", backgroundColor: colors.dark }}
            data-handle="start"
            onMouseDown={(e) => onHandleMouseDown(e, a.id, "start")}
          />

          {/* Start value */}
          <span className="text-xs px-1 whitespace-nowrap opacity-80" style={{ color: colors.text }}>
            {startValue}
          </span>

          {/* Icon + name + rate — centred */}
          <div className="flex-1 flex items-center gap-1 overflow-hidden min-w-0 justify-center">
            <span className="text-sm leading-none">{isError ? "⚠️" : TYPE_ICON[a.type]}</span>
            <span className="text-xs font-medium text-white truncate">{a.name}</span>
            {rateLabel && (
              <span className="text-xs opacity-70 shrink-0" style={{ color: colors.text }}>
                {rateLabel}
              </span>
            )}
          </div>

          {/* End value (with surplus warning) */}
          <div className="flex items-center gap-1">
            {hasSurplus ? (
              <span className="text-xs px-1 whitespace-nowrap text-amber-300">
                {endValue} ⚠ {fmtVal(surplus)} til overs
              </span>
            ) : (
              <span className="text-xs px-1 whitespace-nowrap opacity-80" style={{ color: colors.text }}>
                {endValue}
              </span>
            )}
          </div>

          {/* Right darker handle */}
          <div
            className="shrink-0 flex items-center justify-center cursor-ew-resize"
            style={{ width: HANDLE_W, height: "100%", backgroundColor: colors.dark }}
            data-handle="end"
            onMouseDown={(e) => onHandleMouseDown(e, a.id, "end")}
          />
        </div>

        {/* Function indicators — rendered above the pølse */}
        {a.functions && a.functions.map((fn) => {
          const fnStartIdx = toMonthIndex(fn.startDate, simulation.startDate);
          const isOnce = fn.type === "deposit_once" || fn.type === "withdrawal_once";
          const isDeposit = fn.type === "deposit_once" || fn.type === "deposit_recurring";

          if (isOnce) {
            const xFrac = (fnStartIdx - visibleStartMonth) / visibleMonths;
            if (xFrac < -0.02 || xFrac > 1.02) return null;
            return (
              <div
                key={fn.id}
                className="absolute flex items-center gap-0.5 cursor-pointer z-10"
                style={{
                  left: `${xFrac * 100}%`,
                  top: 4,
                  transform: "translateX(-50%)",
                }}
                title={`${isDeposit ? "Indbetaling" : "Udbetaling"}: ${fmtVal(fn.amount)}`}
                onClick={(e) => { e.stopPropagation(); onClickFunction?.(fn, a.id); }}
              >
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    backgroundColor: isDeposit ? "#16a34a" : "#dc2626",
                    flexShrink: 0,
                  }}
                />
                <span className="text-xs whitespace-nowrap" style={{ color: isDeposit ? "#86efac" : "#fca5a5", fontSize: 10 }}>
                  {fmtVal(fn.amount)}
                </span>
              </div>
            );
          } else {
            // Recurring — center on the pølse range
            const fnEndIdx = fn.endDate
              ? toMonthIndex(fn.endDate, simulation.startDate)
              : toMonthIndex(a.endDate, simulation.startDate);
            const midIdx = (fnStartIdx + fnEndIdx) / 2;
            const xFrac = (midIdx - visibleStartMonth) / visibleMonths;
            if (xFrac < -0.05 || xFrac > 1.05) return null;

            // Calculate total payments
            const interval = fn.intervalMonths ?? 1;
            const paymentCount = Math.max(1, Math.ceil((fnEndIdx - fnStartIdx) / interval) + 1);
            const totalAmount = fn.amount * paymentCount;

            return (
              <div
                key={fn.id}
                className="absolute flex flex-col items-center cursor-pointer z-10"
                style={{
                  left: `${xFrac * 100}%`,
                  top: 2,
                  transform: "translateX(-50%)",
                }}
                title={`${isDeposit ? "Løbende indbetaling" : "Løbende udbetaling"}: ${fmtVal(fn.amount)}/md`}
                onClick={(e) => { e.stopPropagation(); onClickFunction?.(fn, a.id); }}
              >
                <span style={{ color: isDeposit ? "#86efac" : "#fca5a5", fontSize: 13, lineHeight: 1 }}>
                  {isDeposit ? "↓" : "↑"}
                </span>
                <span className="whitespace-nowrap" style={{ color: isDeposit ? "#86efac" : "#fca5a5", fontSize: 9 }}>
                  {fmtVal(totalAmount)}
                </span>
              </div>
            );
          }
        })}

        {/* Visible window clips — show start/end value outside pølse if it's clipped */}
        {startFrac < 0 && (
          <span className="absolute left-0 top-1/2 -translate-y-1/2 text-xs text-gray-500 px-1">
            {startValue}
          </span>
        )}
      </div>
    );
  }

  // --- SVG arrows ---
  function renderArrows() {
    const parentChildPairs = assets
      .filter(a => a.parentId && assetIds.has(a.parentId))
      .map(child => ({ parent: assets.find(x => x.id === child.parentId)!, child }));

    return (
      <svg
        className="absolute inset-0 pointer-events-none"
        style={{ width: "100%", height: sorted.length * ROW_H }}
        overflow="visible"
      >
        {parentChildPairs.map(({ parent, child }) => {
          const parentRowIdx = sorted.findIndex(a => a.id === parent.id);
          const childRowIdx  = sorted.findIndex(a => a.id === child.id);
          if (parentRowIdx === -1 || childRowIdx === -1) return null;

          const parentEndFrac = assetEndFrac(parent);
          const childStartFrac = assetStartFrac(child);

          if (parentEndFrac < 0 || childStartFrac > 1) return null;

          const cw = containerRef.current?.getBoundingClientRect().width ?? 1200;
          const arrowFrac = ARROW_OFFSET / cw;

          const x1 = (parentEndFrac - arrowFrac) * cw;
          const x2 = (childStartFrac + arrowFrac) * cw;
          const y1 = parentRowIdx * ROW_H + ROW_H / 2;
          const y2 = childRowIdx  * ROW_H + ROW_H / 2;
          const colors = TYPE_COLOR[parent.type] ?? TYPE_COLOR.stock;

          if (x2 <= x1) return null; // no space for arrow

          return (
            <g key={`${parent.id}-${child.id}`}>
              <line x1={x1} y1={y1} x2={x2} y2={y2} stroke={colors.bg} strokeWidth={2}
                markerEnd={`url(#arrowhead-${parent.type})`} />
            </g>
          );
        })}

        {/* Arrow marker definitions */}
        <defs>
          {Object.entries(TYPE_COLOR).map(([type, c]) => (
            <marker
              key={type}
              id={`arrowhead-${type}`}
              markerWidth="6" markerHeight="4"
              refX="6" refY="2"
              orient="auto"
            >
              <polygon points="0 0, 6 2, 0 4" fill={c.bg} />
            </marker>
          ))}
        </defs>
      </svg>
    );
  }

  return (
    <div className="flex flex-col h-full overflow-hidden">
      {/* Timeline header */}
      {renderHeader()}

      {/* Asset rows + SVG overlay */}
      <div className="flex-1 overflow-y-auto overflow-x-hidden relative" ref={containerRef}>
        <div className="relative" style={{ minHeight: sorted.length * ROW_H }}>
          {/* SVG arrow layer */}
          {renderArrows()}

          {/* Asset rows */}
          {sorted.map((a, i) => renderAsset(a, i))}

          {sorted.length === 0 && (
            <div className="absolute inset-0 flex items-center justify-center text-gray-600 text-sm select-none">
              Ingen assets — tryk + Asset for at tilføje
            </div>
          )}
        </div>
      </div>

      {/* Tooltip — fixed positioning so it follows the cursor regardless of scroll */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white pointer-events-none shadow"
          style={{
            left: tooltip.x + 12,
            top: tooltip.y,
            transform: "translateY(-50%)",
          }}
        >
          {tooltip.label}
        </div>
      )}
    </div>
  );
}
