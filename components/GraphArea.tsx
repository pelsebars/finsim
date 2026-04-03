"use client";

/**
 * GraphArea — three stacked SVG line charts for the bottom of SimulationView.
 *
 * Chart 1: total_assets  (green)
 * Chart 2: total_debt    (red)
 * Chart 3: net_worth     (green)
 *
 * Each chart:
 * - Clips data to the visible horizontal window (visibleStartMonth → +visibleMonths)
 * - Scales Y dynamically to min/max of the visible slice
 * - SVG line + area-fill, preserveAspectRatio="none" so it always fills its container
 * - Mouse-over tooltip: date + value in Danish format
 */

import { useRef, useState } from "react";
import type { EngineResult } from "@/lib/engine/types";
import { fmtVal, fmtMonthLong } from "@/lib/gantt";

interface Props {
  engineResult: EngineResult | null;
  visibleStartMonth: number;
  visibleMonths: number;
  hasErrors: boolean;
}

interface ChartDef {
  key: keyof EngineResult["aggregations"];
  label: string;
  stroke: string;
  fill: string;
}

const CHARTS: ChartDef[] = [
  {
    key: "total_assets",
    label: "Aktiver",
    stroke: "#22c55e",
    fill: "rgba(34,197,94,0.12)",
  },
  {
    key: "total_debt",
    label: "Gæld",
    stroke: "#ef4444",
    fill: "rgba(239,68,68,0.12)",
  },
  {
    key: "net_worth",
    label: "Nettoformue",
    stroke: "#22c55e",
    fill: "rgba(34,197,94,0.12)",
  },
];

export default function GraphArea({
  engineResult, visibleStartMonth, visibleMonths, hasErrors,
}: Props) {
  if (hasErrors) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 text-sm select-none">
        NA — assets i fejl-tilstand
      </div>
    );
  }
  if (!engineResult) {
    return (
      <div className="h-full flex items-center justify-center text-gray-600 text-sm select-none">
        Ingen data endnu
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col overflow-hidden">
      {CHARTS.map((def) => (
        <SingleChart
          key={def.key}
          def={def}
          months={engineResult.months}
          data={engineResult.aggregations[def.key]}
          visibleStartMonth={visibleStartMonth}
          visibleMonths={visibleMonths}
        />
      ))}
    </div>
  );
}

// ── Single chart ─────────────────────────────────────────────────────────────

interface SingleChartProps {
  def: ChartDef;
  months: string[];
  data: number[];
  visibleStartMonth: number;
  visibleMonths: number;
}

interface Tooltip {
  screenX: number;
  screenY: number;
  label: string;
}

function SingleChart({ def, months, data, visibleStartMonth, visibleMonths }: SingleChartProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tooltip, setTooltip] = useState<Tooltip | null>(null);

  // Slice to visible window
  const start = Math.max(0, visibleStartMonth);
  const end   = Math.min(months.length - 1, visibleStartMonth + visibleMonths);

  if (start > end) {
    return <div className="flex-1 border-b border-gray-800" />;
  }

  const slice       = data.slice(start, end + 1);
  const monthSlice  = months.slice(start, end + 1);
  const n           = slice.length;

  if (n < 2) {
    return <div className="flex-1 border-b border-gray-800" />;
  }

  // Y scale
  const minVal = Math.min(...slice);
  const maxVal = Math.max(...slice);
  const range  = maxVal - minVal || 1;

  // SVG coordinate space: width=1000, height=100
  // Using preserveAspectRatio="none" so it fills whatever div size is given.
  const W = 1000;
  const H = 100;

  function toX(i: number) {
    return (i / (n - 1)) * W;
  }
  function toY(val: number) {
    // maxVal → top (y=0), minVal → bottom (y=H)
    // Add small padding so the line is never exactly at the SVG border
    const PAD = 6;
    return PAD + ((1 - (val - minVal) / range) * (H - PAD * 2));
  }

  const pts = slice.map((val, i) => [toX(i), toY(val)] as [number, number]);

  const linePath = pts.map(([x, y], i) => `${i === 0 ? "M" : "L"}${x},${y}`).join(" ");

  // Area fill: line + close down to the bottom
  const bottomY = H;
  const areaPath =
    `M${pts[0][0]},${bottomY} ` +
    pts.map(([x, y]) => `L${x},${y}`).join(" ") +
    ` L${pts[n - 1][0]},${bottomY} Z`;

  // Mouse-over: find nearest month index in the slice
  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const xFrac = (e.clientX - rect.left) / rect.width;
    const idx = Math.max(0, Math.min(Math.round(xFrac * (n - 1)), n - 1));
    setTooltip({
      screenX: e.clientX,
      screenY: e.clientY,
      label: `${fmtMonthLong(monthSlice[idx])}: ${fmtVal(slice[idx])}`,
    });
  }

  return (
    <div
      ref={containerRef}
      className="flex-1 relative min-h-0 border-b border-gray-800 overflow-hidden"
      onMouseMove={handleMouseMove}
      onMouseLeave={() => setTooltip(null)}
    >
      {/* Chart label */}
      <span
        className="absolute left-1.5 top-1 text-gray-500 select-none pointer-events-none z-10"
        style={{ fontSize: 10 }}
      >
        {def.label}
      </span>

      {/* Max/min value labels */}
      <span
        className="absolute right-1.5 top-1 text-gray-600 select-none pointer-events-none z-10 tabular-nums"
        style={{ fontSize: 9 }}
      >
        {fmtVal(maxVal)}
      </span>
      <span
        className="absolute right-1.5 bottom-1 text-gray-600 select-none pointer-events-none z-10 tabular-nums"
        style={{ fontSize: 9 }}
      >
        {fmtVal(minVal)}
      </span>

      {/* SVG chart — fills the container, non-uniform scaling */}
      <svg
        width="100%"
        height="100%"
        viewBox={`0 0 ${W} ${H}`}
        preserveAspectRatio="none"
        style={{ display: "block", position: "absolute", inset: 0 }}
      >
        {/* Area fill */}
        <path d={areaPath} fill={def.fill} />

        {/* Line */}
        <path
          d={linePath}
          fill="none"
          stroke={def.stroke}
          strokeWidth="2"
          vectorEffect="non-scaling-stroke"
        />
      </svg>

      {/* Tooltip — fixed so it floats above everything */}
      {tooltip && (
        <div
          className="fixed z-50 bg-gray-800 border border-gray-600 rounded px-2 py-1 text-xs text-white pointer-events-none shadow"
          style={{
            left: tooltip.screenX + 14,
            top: tooltip.screenY,
            transform: "translateY(-50%)",
          }}
        >
          {tooltip.label}
        </div>
      )}
    </div>
  );
}
