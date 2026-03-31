"use client";

import { useState } from "react";
import type { Asset, AssetType } from "@/lib/engine/types";

interface Props {
  simulationId: string;
  simStart: string;
  simEnd: string;
  existingAssets: Asset[];
  /** If provided, the modal is in edit mode. */
  asset?: Asset;
  onSaved: (asset: Asset, isNew: boolean) => void;
  onDeleted?: (assetId: string) => void;
  onClose: () => void;
}

const TYPE_OPTIONS: { value: AssetType; label: string }[] = [
  { value: "stock",    label: "Aktiebeholdning" },
  { value: "liquid",   label: "Likvid beholdning" },
  { value: "pension",  label: "Pension" },
  { value: "property", label: "Fast ejendom" },
  { value: "loan",     label: "Lån" },
];

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

/** Parse "1.000" or "1000" → 1000000 (multiply by 1000). */
function parseDisplayValue(raw: string): number {
  const cleaned = raw.replace(/\./g, "").replace(/,/g, "").trim();
  const n = parseFloat(cleaned);
  return isNaN(n) ? 0 : n * 1000;
}

/** Format a raw value (e.g. 1000000) → "1.000" display string. */
function toDisplayValue(value: number): string {
  return Math.round(value / 1000).toLocaleString("da-DK");
}

interface VarRateRow { year: string; rate: string }

export default function AssetModal({
  simulationId, simStart, simEnd, existingAssets, asset, onSaved, onDeleted, onClose,
}: Props) {
  const isEdit = !!asset;

  const [step, setStep] = useState<1 | 2>(isEdit ? 2 : 1);
  const [assetType, setAssetType] = useState<AssetType>(asset?.type ?? "stock");

  // Common fields
  const [name, setName]         = useState(asset?.name ?? "");
  const startInit = splitDate(asset?.startDate ?? simStart);
  const endInit   = splitDate(asset?.endDate   ?? simEnd);
  const [startM, setStartM]     = useState(startInit.m);
  const [startY, setStartY]     = useState(startInit.y);
  const [endM, setEndM]         = useState(endInit.m);
  const [endY, setEndY]         = useState(endInit.y);
  const [initVal, setInitVal]   = useState(asset ? toDisplayValue(asset.initialValue) : "");
  const [parentId, setParentId] = useState<string>(asset?.parentId ?? "");

  // Stock / Liquid / Pension
  const [annualRate, setAnnualRate] = useState(
    asset?.annualRate != null ? String(Math.round(asset.annualRate * 100)) : ""
  );

  // Property
  const [rateType, setRateType] = useState<"fixed" | "variable">(
    asset?.variableRates ? "variable" : "fixed"
  );
  const [fixedRate, setFixedRate] = useState(
    asset?.annualRate != null ? String(Math.round(asset.annualRate * 100)) : ""
  );
  const [varRows, setVarRows] = useState<VarRateRow[]>(() => {
    if (asset?.variableRates) {
      return Object.entries(asset.variableRates)
        .filter(([k]) => k !== "default")
        .map(([k, v]) => ({ year: k, rate: String(Math.round(v * 100)) }));
    }
    return [];
  });
  const [varDefault, setVarDefault] = useState(
    asset?.variableRates?.default != null
      ? String(Math.round((asset.variableRates.default as number) * 100))
      : "2"
  );
  const [agentFee, setAgentFee] = useState(
    asset?.agentFee != null ? toDisplayValue(asset.agentFee) : "100"
  );

  // Loan
  const [estCost, setEstCost] = useState(
    asset?.establishmentCost != null ? toDisplayValue(asset.establishmentCost) : "0"
  );

  const [error, setError]     = useState("");
  const [saving, setSaving]   = useState(false);
  const [confirmDel, setConfirmDel] = useState(false);

  const years = yearRange(simStart, simEnd);

  // Parent options: exclude self, exclude loans, exclude assets where it would create a cycle
  const parentOptions = existingAssets.filter(
    (a) => a.type !== "loan" && a.id !== asset?.id
  );

  const hasParent = !!parentId;

  async function handleSave() {
    if (!name.trim()) { setError("Angiv et navn."); return; }

    const startDate = `${startY}-${startM}-01`;
    const endDate   = `${endY}-${endM}-01`;
    if (startDate >= endDate) { setError("Slutdato skal være efter startdato."); return; }

    // Build payload
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const body: Record<string, any> = {
      name: name.trim(),
      start_date: startDate,
      end_date: endDate,
      initial_value: hasParent ? 0 : parseDisplayValue(initVal),
      parent_id: parentId || null,
      display_order: asset?.displayOrder ?? existingAssets.length,
    };

    if (assetType === "stock" || assetType === "liquid" || assetType === "pension") {
      const r = parseFloat(annualRate);
      if (isNaN(r)) { setError("Angiv en gyldig rente."); return; }
      body.annual_rate = r / 100;
    }

    if (assetType === "property") {
      if (rateType === "fixed") {
        const r = parseFloat(fixedRate);
        if (isNaN(r)) { setError("Angiv en gyldig rente."); return; }
        body.annual_rate = r / 100;
        body.variable_rates = null;
      } else {
        const vr: Record<string, number> = { default: parseFloat(varDefault) / 100 || 0.02 };
        for (const row of varRows) {
          if (row.year && row.rate) vr[row.year] = parseFloat(row.rate) / 100;
        }
        body.variable_rates = vr;
        body.annual_rate = null;
      }
      body.agent_fee = parseDisplayValue(agentFee);
    }

    if (assetType === "loan") {
      body.establishment_cost = parseDisplayValue(estCost);
      body.parent_id = null;
    }

    setSaving(true);
    setError("");
    try {
      let res: Response;
      if (isEdit && asset) {
        res = await fetch(`/api/simulations/${simulationId}/assets/${asset.id}`, {
          method: "PUT",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        });
      } else {
        res = await fetch(`/api/simulations/${simulationId}/assets`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ ...body, type: assetType }),
        });
      }

      if (!res.ok) {
        const d = await res.json().catch(() => ({}));
        throw new Error(d.error ?? "Fejl ved gem.");
      }
      const saved = await res.json();
      // Normalise field names from snake_case API to camelCase Asset type
      const normalised: Asset = {
        id: saved.id,
        simulationId: saved.simulation_id,
        type: saved.type,
        name: saved.name,
        startDate: saved.start_date,
        endDate: saved.end_date,
        initialValue: parseFloat(saved.initial_value),
        parentId: saved.parent_id ?? undefined,
        displayOrder: saved.display_order,
        annualRate: saved.annual_rate != null ? parseFloat(saved.annual_rate) : undefined,
        variableRates: saved.variable_rates ?? undefined,
        agentFee: saved.agent_fee != null ? parseFloat(saved.agent_fee) : undefined,
        establishmentCost:
          saved.establishment_cost != null ? parseFloat(saved.establishment_cost) : undefined,
        functions: [],
        branches: [],
      };
      onSaved(normalised, !isEdit);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ukendt fejl.");
    } finally {
      setSaving(false);
    }
  }

  async function handleDelete() {
    if (!asset || !onDeleted) return;
    setSaving(true);
    try {
      const res = await fetch(
        `/api/simulations/${simulationId}/assets/${asset.id}`,
        { method: "DELETE" }
      );
      if (!res.ok) throw new Error("Sletning fejlede.");
      onDeleted(asset.id);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Fejl.");
      setSaving(false);
    }
  }

  // --- Step 1: type selection ---
  if (step === 1) {
    return (
      <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
        <div
          className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96 shadow-2xl"
          onClick={(e) => e.stopPropagation()}
        >
          <div className="flex items-center justify-between mb-4">
            <h2 className="text-white font-semibold text-lg">Vælg asset-type</h2>
            <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
          </div>
          <div className="flex flex-col gap-2 mb-4">
            {TYPE_OPTIONS.map((opt) => (
              <button
                key={opt.value}
                className={`text-left px-4 py-3 rounded border transition-colors ${
                  assetType === opt.value
                    ? "border-blue-500 bg-blue-900/40 text-white"
                    : "border-gray-700 bg-gray-800 text-gray-300 hover:border-gray-500"
                }`}
                onClick={() => setAssetType(opt.value)}
              >
                {opt.label}
              </button>
            ))}
          </div>
          <button
            className="w-full bg-blue-600 hover:bg-blue-500 text-white text-sm font-medium py-2 rounded transition-colors"
            onClick={() => setStep(2)}
          >
            Næste →
          </button>
        </div>
      </div>
    );
  }

  // --- Step 2: form ---
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 overflow-y-auto py-8" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-[480px] shadow-2xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">
            {isEdit ? "Rediger asset" : TYPE_OPTIONS.find(o => o.value === assetType)?.label}
          </h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        <div className="flex flex-col gap-3">
          {/* Name */}
          <Field label="Navn">
            <input
              className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
              value={name} onChange={(e) => setName(e.target.value)} autoFocus
            />
          </Field>

          {/* Dates */}
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

          {/* Parent (not for loan) */}
          {assetType !== "loan" && (
            <Field label="Forælder-asset (valgfri)">
              <select
                className={`${selectCls} w-full`}
                value={parentId}
                onChange={(e) => setParentId(e.target.value)}
              >
                <option value="">— Ingen —</option>
                {parentOptions.map(a => (
                  <option key={a.id} value={a.id}>{a.name}</option>
                ))}
              </select>
            </Field>
          )}

          {/* Initial value — hidden when parent selected */}
          {!hasParent && (
            <Field label="Startværdi (tusinde — 1.000 = 1 mio)">
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
                value={initVal}
                onChange={(e) => setInitVal(e.target.value)}
                placeholder="0"
              />
            </Field>
          )}
          {hasParent && (
            <p className="text-xs text-gray-500 italic">Startværdi arves fra forælder-asset.</p>
          )}

          {/* Stock / Liquid / Pension: annual rate */}
          {(assetType === "stock" || assetType === "liquid" || assetType === "pension") && (
            <Field label="Årlig rente (%)">
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
                value={annualRate} onChange={(e) => setAnnualRate(e.target.value)} placeholder="5"
              />
            </Field>
          )}

          {/* Property */}
          {assetType === "property" && (
            <>
              <Field label="Forrentningstype">
                <div className="flex gap-3">
                  {(["fixed","variable"] as const).map(t => (
                    <label key={t} className="flex items-center gap-2 text-sm text-gray-300 cursor-pointer">
                      <input
                        type="radio" className="accent-blue-500"
                        checked={rateType === t} onChange={() => setRateType(t)}
                      />
                      {t === "fixed" ? "Fast rente" : "Variabel rente per år"}
                    </label>
                  ))}
                </div>
              </Field>

              {rateType === "fixed" && (
                <Field label="Fast rente (%)">
                  <input
                    className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
                    value={fixedRate} onChange={(e) => setFixedRate(e.target.value)} placeholder="3"
                  />
                </Field>
              )}

              {rateType === "variable" && (
                <div>
                  <label className="block text-sm text-gray-400 mb-1">Renter per år</label>
                  <div className="flex flex-col gap-1 mb-2">
                    {varRows.map((row, i) => (
                      <div key={i} className="flex gap-2 items-center">
                        <input
                          className="w-20 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none"
                          value={row.year}
                          onChange={(e) => {
                            const nr = [...varRows]; nr[i] = { ...nr[i], year: e.target.value };
                            setVarRows(nr);
                          }}
                          placeholder="År"
                        />
                        <input
                          className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none"
                          value={row.rate}
                          onChange={(e) => {
                            const nr = [...varRows]; nr[i] = { ...nr[i], rate: e.target.value };
                            setVarRows(nr);
                          }}
                          placeholder="%"
                        />
                        <button
                          className="text-gray-500 hover:text-red-400 text-xs"
                          onClick={() => setVarRows(varRows.filter((_, j) => j !== i))}
                        >
                          ✕
                        </button>
                      </div>
                    ))}
                  </div>
                  <div className="flex gap-2 items-center mb-2">
                    <button
                      className="text-xs text-blue-400 hover:text-blue-300"
                      onClick={() => setVarRows([...varRows, { year: "", rate: "" }])}
                    >
                      + Tilføj år
                    </button>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="text-sm text-gray-400">Andre år:</span>
                    <input
                      className="w-16 bg-gray-800 border border-gray-700 rounded px-2 py-1 text-sm text-white focus:outline-none"
                      value={varDefault} onChange={(e) => setVarDefault(e.target.value)} placeholder="2"
                    />
                    <span className="text-sm text-gray-500">%</span>
                  </div>
                </div>
              )}

              <Field label="Mæglergebyr (tusinde)">
                <input
                  className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
                  value={agentFee} onChange={(e) => setAgentFee(e.target.value)} placeholder="100"
                />
              </Field>
            </>
          )}

          {/* Loan */}
          {assetType === "loan" && (
            <Field label="Etableringsomkostninger (tusinde)">
              <input
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white focus:outline-none focus:border-gray-500"
                value={estCost} onChange={(e) => setEstCost(e.target.value)} placeholder="0"
              />
            </Field>
          )}
        </div>

        {error && <p className="text-red-400 text-sm mt-3">{error}</p>}

        <div className="mt-4 flex gap-2">
          {!isEdit && (
            <button
              className="text-sm text-gray-400 hover:text-white px-3 py-2"
              onClick={() => setStep(1)}
            >
              ← Tilbage
            </button>
          )}
          <button
            className="flex-1 bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded transition-colors"
            onClick={handleSave}
            disabled={saving}
          >
            {saving ? "Gemmer…" : isEdit ? "Gem ændringer" : "Opret asset"}
          </button>
        </div>

        {isEdit && onDeleted && (
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
                Slet asset
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
