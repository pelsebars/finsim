"use client";

import { useState } from "react";
import type { Asset, AssetFunction, FunctionType } from "@/lib/engine/types";

interface Props {
  simulationId: string;
  simStart: string;
  simEnd: string;
  /** All assets in the simulation (for asset + counterpart dropdowns). */
  assets: Asset[];
  /** Pre-selected asset id (e.g. from clicking a row). */
  defaultAssetId?: string;
  /** If provided, the modal is in edit mode. */
  existingFunction?: AssetFunction;
  /** Asset id that owns the existingFunction (required in edit mode). */
  existingFunctionAssetId?: string;
  onSaved: () => void;
  onDeleted: () => void;
  onClose: () => void;
}

const FUNCTION_TYPE_OPTIONS: { value: FunctionType; label: string }[] = [
  { value: "deposit_once",         label: "Én indbetaling" },
  { value: "withdrawal_once",      label: "Én udbetaling" },
  { value: "deposit_recurring",    label: "Løbende indbetaling" },
  { value: "withdrawal_recurring", label: "Løbende udbetaling" },
];

/** Asset types that support functions (dynamic assets). */
const DYNAMIC_TYPES = new Set(["stock", "liquid", "pension"]);

const MONTHS = [
  { v: "01", l: "Jan" }, { v: "02", l: "Feb" }, { v: "03", l: "Mar" },
  { v: "04", l: "Apr" }, { v: "05", l: "Maj" }, { v: "06", l: "Jun" },
  { v: "07", l: "Jul" }, { v: "08", l: "Aug" }, { v: "09", l: "Sep" },
  { v: "10", l: "Okt" }, { v: "11", l: "Nov" }, { v: "12", l: "Dec" },
];

function yearRange(from: string, to: string): number[] {
  const sy = parseInt(from.split("-")[0]);
  const ey = parseInt(to.split("-")[0]);
  const out: number[] = [];
  for (let y = sy; y <= ey + 5; y++) out.push(y);
  return out;
}

function splitDate(dateStr: string): { m: string; y: string } {
  const p = dateStr.split("-");
  return { m: p[1] ?? "01", y: p[0] ?? "2025" };
}

/** Parse "100" → 100000 (display value in thousands). */
function parseDisplayValue(raw: string): number {
  const cleaned = raw.replace(/\./g, "").replace(/,/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n * 1000;
}

/** Format raw DKK to display string: 100000 → "100". */
function toDisplayValue(value: number): string {
  return Math.round(value / 1000).toLocaleString("da-DK");
}

export default function FunctionModal({
  simulationId, simStart, simEnd, assets,
  defaultAssetId, existingFunction, existingFunctionAssetId,
  onSaved, onDeleted, onClose,
}: Props) {
  const isEdit = !!existingFunction;

  // Only dynamic asset types can receive functions
  const eligibleAssets = assets.filter(a => DYNAMIC_TYPES.has(a.type));

  // Determine initial asset id
  const initialAssetId = (() => {
    if (isEdit && existingFunctionAssetId) return existingFunctionAssetId;
    if (defaultAssetId && eligibleAssets.some(a => a.id === defaultAssetId)) return defaultAssetId;
    return eligibleAssets[0]?.id ?? "";
  })();

  const [assetId, setAssetId] = useState(initialAssetId);
  const [fnType, setFnType] = useState<FunctionType>(existingFunction?.type ?? "deposit_once");
  const [amount, setAmount] = useState(existingFunction ? toDisplayValue(existingFunction.amount) : "");
  const [counterpartAssetId, setCounterpartAssetId] = useState(existingFunction?.counterpartAssetId ?? "");

  const isOnce = fnType === "deposit_once" || fnType === "withdrawal_once";

  // One-time date
  const startInit = splitDate(existingFunction?.startDate ?? simStart);
  const [startM, setStartM] = useState(startInit.m);
  const [startY, setStartY] = useState(startInit.y);

  // Recurring dates
  const endInit = splitDate(existingFunction?.endDate ?? simEnd);
  const [endM, setEndM] = useState(endInit.m);
  const [endY, setEndY] = useState(endInit.y);
  const [intervalMonths, setIntervalMonths] = useState(
    existingFunction?.intervalMonths != null ? String(existingFunction.intervalMonths) : "1"
  );

  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const years = yearRange(simStart, simEnd);

  async function handleSave() {
    if (!assetId) { setError("Vælg et asset."); return; }
    const rawAmount = parseDisplayValue(amount);
    if (rawAmount <= 0) { setError("Angiv et beløb større end 0."); return; }

    const startDate = `${startY}-${startM}-01`;

    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      type: fnType,
      amount: rawAmount,
      start_date: startDate,
      counterpart_asset_id: counterpartAssetId || null,
    };

    if (!isOnce) {
      const endDate = `${endY}-${endM}-01`;
      if (endDate <= startDate) { setError("Slutdato skal være efter startdato."); return; }
      const iv = parseInt(intervalMonths);
      if (isNaN(iv) || iv < 1) { setError("Angiv et gyldigt interval (min 1 måned)."); return; }
      body.end_date = endDate;
      body.interval_months = iv;
    }

    setSaving(true);
    setError("");

    try {
      if (isEdit && existingFunction && existingFunctionAssetId) {
        // Delete old, then create new (no PUT endpoint)
        const delRes = await fetch(
          `/api/simulations/${simulationId}/assets/${existingFunctionAssetId}/functions/${existingFunction.id}`,
          { method: "DELETE" }
        );
        if (!delRes.ok) throw new Error("Sletning af gammel funktion fejlede.");
      }

      const res = await fetch(
        `/api/simulations/${simulationId}/assets/${assetId}/functions`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      );
      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Fejl ved oprettelse af funktion.");
      }
      onSaved();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ukendt fejl.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!existingFunction || !existingFunctionAssetId) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/simulations/${simulationId}/assets/${existingFunctionAssetId}/functions/${existingFunction.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Sletning fejlede.");
      onDeleted();
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Fejl.");
      setSaving(false);
    }
  }

  if (eligibleAssets.length === 0) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
        <div
          className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-lg">Ny funktion</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
          </div>
          <p className="text-gray-400 text-sm">
            Ingen dynamiske assets (aktier, likviditet, pension). Opret et sådant asset først.
          </p>
          <button
            className="mt-4 w-full bg-gray-700 hover:bg-gray-600 text-white text-sm py-2 rounded"
            onClick={onClose}
          >
            Luk
          </button>
        </div>
      </div>
    );
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 overflow-y-auto py-8"
      onClick={onClose}
    >
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-[480px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">
            {isEdit ? "Rediger funktion" : "Ny funktion"}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="flex flex-col gap-3">
          {/* Asset selection */}
          <Field label="Asset">
            <select
              className={`${selectCls} w-full`}
              value={assetId}
              onChange={(e) => setAssetId(e.target.value)}
            >
              {eligibleAssets.map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>

          {/* Function type */}
          <Field label="Type">
            <select
              className={`${selectCls} w-full`}
              value={fnType}
              onChange={(e) => setFnType(e.target.value as FunctionType)}
            >
              {FUNCTION_TYPE_OPTIONS.map(opt => (
                <option key={opt.value} value={opt.value}>{opt.label}</option>
              ))}
            </select>
          </Field>

          {/* Amount */}
          <Field label="Beløb (tusinde — 100 = 100.000 kr)">
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
              value={amount}
              onChange={(e) => setAmount(e.target.value)}
              placeholder="100"
            />
          </Field>

          {/* Date — one-time */}
          {isOnce && (
            <Field label="Dato">
              <div className="flex gap-1">
                <select className={selectCls} value={startM} onChange={(e) => setStartM(e.target.value)}>
                  {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                </select>
                <select className={`${selectCls} w-20`} value={startY} onChange={(e) => setStartY(e.target.value)}>
                  {years.map(y => <option key={y} value={y}>{y}</option>)}
                </select>
              </div>
            </Field>
          )}

          {/* Date range — recurring */}
          {!isOnce && (
            <>
              <div className="flex gap-3">
                <Field label="Startdato" className="flex-1">
                  <div className="flex gap-1">
                    <select className={selectCls} value={startM} onChange={(e) => setStartM(e.target.value)}>
                      {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                    </select>
                    <select className={`${selectCls} w-20`} value={startY} onChange={(e) => setStartY(e.target.value)}>
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </Field>
                <Field label="Slutdato" className="flex-1">
                  <div className="flex gap-1">
                    <select className={selectCls} value={endM} onChange={(e) => setEndM(e.target.value)}>
                      {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
                    </select>
                    <select className={`${selectCls} w-20`} value={endY} onChange={(e) => setEndY(e.target.value)}>
                      {years.map(y => <option key={y} value={y}>{y}</option>)}
                    </select>
                  </div>
                </Field>
              </div>

              <Field label="Interval (måneder)">
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
                  value={intervalMonths}
                  onChange={(e) => setIntervalMonths(e.target.value)}
                  placeholder="1"
                />
              </Field>
            </>
          )}

          {/* Counterpart asset (optional) */}
          <Field label="Modpart-asset (valgfri — til overførsler)">
            <select
              className={`${selectCls} w-full`}
              value={counterpartAssetId}
              onChange={(e) => setCounterpartAssetId(e.target.value)}
            >
              <option value="">— Ingen —</option>
              {assets.filter(a => a.id !== assetId).map(a => (
                <option key={a.id} value={a.id}>{a.name}</option>
              ))}
            </select>
          </Field>
        </div>

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

        <div className="mt-4 flex gap-2">
          <button
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded transition-colors"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Gemmer…" : isEdit ? "Gem ændringer" : "Opret funktion"}
          </button>
        </div>

        {isEdit && (
          <div className="mt-3 border-t border-gray-700 pt-3">
            {confirmDel ? (
              <div className="flex gap-2">
                <span className="text-sm text-red-400 flex-1">Er du sikker?</span>
                <button
                  className="text-sm text-red-400 hover:text-red-300 font-medium"
                  onClick={handleDelete}
                  disabled={saving}
                >
                  Ja, slet
                </button>
                <button
                  className="text-sm text-gray-400 hover:text-white"
                  onClick={() => setConfirmDel(false)}
                >
                  Annuller
                </button>
              </div>
            ) : (
              <button
                className="text-sm text-red-500 hover:text-red-400"
                onClick={() => setConfirmDel(true)}
              >
                Slet funktion
              </button>
            )}
          </div>
        )}
      </div>
    </div>
  );
}

// --- helpers ---

const selectCls =
  "flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white focus:outline-none focus:border-gray-500";

function Field({
  label, children, className,
}: {
  label: string;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div className={className}>
      <label className="block text-sm text-gray-400 mb-1">{label}</label>
      {children}
    </div>
  );
}
