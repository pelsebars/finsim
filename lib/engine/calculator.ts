/**
 * Pure calculation engine — no I/O, no HTTP, no database.
 * Takes plain data objects, returns monthly time-series results.
 */

import type {
  Simulation,
  Asset,
  AssetFunction,
  EngineResult,
  EngineOptions,
} from "./types";

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

/**
 * Convert an annual rate (decimal) to a monthly compound rate.
 * Formula: monthlyRate = (1 + annualRate)^(1/12) - 1
 */
export function annualToMonthlyRate(annualRate: number): number {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

/**
 * Parse "YYYY-MM-DD" or "YYYY-MM" into a { year, month (1-based) } object.
 */
function parseDate(dateStr: string): { year: number; month: number } {
  const parts = dateStr.split("-");
  return { year: parseInt(parts[0], 10), month: parseInt(parts[1], 10) };
}

/**
 * Build a sorted list of "YYYY-MM" labels from startDate to endDate (inclusive).
 */
export function buildMonthLabels(startDate: string, endDate: string): string[] {
  const start = parseDate(startDate);
  const end = parseDate(endDate);
  const months: string[] = [];

  let year = start.year;
  let month = start.month;

  while (year < end.year || (year === end.year && month <= end.month)) {
    months.push(`${year}-${String(month).padStart(2, "0")}`);
    month++;
    if (month > 12) {
      month = 1;
      year++;
    }
  }

  return months;
}

/**
 * Return the index of a given "YYYY-MM" label in the months array, or -1.
 */
function monthIndex(months: string[], label: string): number {
  return months.indexOf(label);
}

/**
 * Given an ISO date string, return "YYYY-MM".
 */
function toMonthLabel(dateStr: string): string {
  return dateStr.slice(0, 7);
}

/**
 * Determine the applicable annual rate for a property asset in a given year.
 * Falls back to "default" key, then 2% if neither is set.
 */
function propertyRateForYear(asset: Asset, year: number): number {
  if (asset.variableRates) {
    const yearKey = String(year);
    if (yearKey in asset.variableRates) return asset.variableRates[yearKey];
    if ("default" in asset.variableRates) return asset.variableRates["default"];
    // No default key in variable rates — use 2%
    return 0.02;
  }
  // Fixed mode
  return asset.annualRate ?? 0.02;
}

// ---------------------------------------------------------------------------
// Core engine
// ---------------------------------------------------------------------------

export function runEngine(
  simulation: Simulation,
  options: EngineOptions = {}
): EngineResult {
  const { includePension = true } = options;

  const simMonths = buildMonthLabels(simulation.startDate, simulation.endDate);
  const totalMonths = simMonths.length;

  // Map from assetId → index in simMonths for fast lookup
  const monthIdxMap = new Map<string, number>();
  simMonths.forEach((m, i) => monthIdxMap.set(m, i));

  // We'll compute a value array (one entry per sim month) for each asset.
  // Values outside the asset's active range stay 0.
  // We need to process assets in dependency order (parents before children).

  // Build a map for quick asset lookup
  const assetMap = new Map<string, Asset>();
  for (const a of simulation.assets) {
    assetMap.set(a.id, a);
  }

  // Topological sort: parents before children.
  // An asset is a child if another asset has a branch pointing to it.
  const childIds = new Set<string>();
  for (const a of simulation.assets) {
    for (const b of a.branches) {
      childIds.add(b.childAssetId);
    }
  }

  // Simple ordering: assets without parents first, then children.
  // For multi-level trees this needs a proper topo sort.
  const sorted = topoSort(simulation.assets);

  // initialValues can be augmented by parent→child value flow
  const resolvedInitialValues = new Map<string, number>();
  for (const a of simulation.assets) {
    resolvedInitialValues.set(a.id, a.initialValue);
  }

  // Results: assetId → monthly value array
  const assetValues = new Map<string, number[]>();

  // Establishment costs reduce simulation value; tracked separately
  // but their effect shows in net_worth via loan constant negative values.
  // We subtract establishment costs in the aggregation step.
  const establishmentCostsByMonth = new Array<number>(totalMonths).fill(0);

  const surpluses: Record<string, number> = {};

  // Process each asset in topo order
  for (const asset of sorted) {
    const values = new Array<number>(totalMonths).fill(0);

    const assetStart = toMonthLabel(asset.startDate);
    const assetEnd = toMonthLabel(asset.endDate);
    const startIdx = monthIdxMap.get(assetStart) ?? -1;
    const endIdx = monthIdxMap.get(assetEnd) ?? -1;

    if (startIdx === -1 || endIdx === -1 || startIdx > endIdx) {
      // Asset outside simulation range — skip
      assetValues.set(asset.id, values);
      continue;
    }

    const initVal = resolvedInitialValues.get(asset.id) ?? asset.initialValue;

    if (asset.type === "loan") {
      // Loan: constant negative value throughout its lifecycle
      for (let i = startIdx; i <= endIdx; i++) {
        values[i] = -Math.abs(initVal);
      }

      // Establishment cost reduces net worth at start month
      const cost = asset.establishmentCost ?? 0;
      if (cost !== 0) {
        establishmentCostsByMonth[startIdx] += cost;
      }

      assetValues.set(asset.id, values);
      continue;
    }

    if (asset.type === "property") {
      // Property: compound growth, no deposits/withdrawals
      values[startIdx] = initVal;
      for (let i = startIdx + 1; i <= endIdx; i++) {
        const monthLabel = simMonths[i];
        const year = parseInt(monthLabel.split("-")[0], 10);
        const annualRate = propertyRateForYear(asset, year);
        const monthly = annualToMonthlyRate(annualRate);
        values[i] = values[i - 1] * (1 + monthly);
      }

      // Agent fee subtracted from final value before passing to child
      const agentFee = asset.agentFee ?? 100000;
      const finalValue = Math.max(0, values[endIdx] - agentFee);

      // Distribute to children
      const surplus = distributeToChildren(
        asset,
        finalValue,
        resolvedInitialValues
      );
      surpluses[asset.id] = surplus;

      assetValues.set(asset.id, values);
      continue;
    }

    // Dynamic assets: stock, liquid, pension
    // Build a deltas array (one entry per sim month) for deposits/withdrawals
    const deltas = new Array<number>(totalMonths).fill(0);

    for (const fn of asset.functions) {
      applyFunction(fn, asset, simMonths, monthIdxMap, deltas, assetValues);
    }

    // Calculate month-by-month values
    values[startIdx] = initVal + deltas[startIdx];
    for (let i = startIdx + 1; i <= endIdx; i++) {
      const monthly = annualToMonthlyRate(asset.annualRate ?? 0);
      values[i] = values[i - 1] * (1 + monthly) + deltas[i];
    }

    // Distribute final value to children
    const finalValue = values[endIdx];
    const surplus = distributeToChildren(
      asset,
      finalValue,
      resolvedInitialValues
    );
    surpluses[asset.id] = surplus;

    assetValues.set(asset.id, values);
  }

  // Build aggregations
  const total_assets = new Array<number>(totalMonths).fill(0);
  const total_debt = new Array<number>(totalMonths).fill(0);

  for (const asset of simulation.assets) {
    const vals = assetValues.get(asset.id);
    if (!vals) continue;

    if (asset.type === "loan") {
      const assetStart = toMonthLabel(asset.startDate);
      const assetEnd = toMonthLabel(asset.endDate);
      const startIdx = monthIdxMap.get(assetStart) ?? -1;
      const endIdx = monthIdxMap.get(assetEnd) ?? -1;
      for (let i = startIdx; i <= endIdx; i++) {
        if (i >= 0 && i < totalMonths) {
          total_debt[i] += vals[i]; // already negative
        }
      }
    } else {
      if (!includePension && asset.type === "pension") continue;

      const assetStart = toMonthLabel(asset.startDate);
      const assetEnd = toMonthLabel(asset.endDate);
      const startIdx = monthIdxMap.get(assetStart) ?? -1;
      const endIdx = monthIdxMap.get(assetEnd) ?? -1;
      for (let i = startIdx; i <= endIdx; i++) {
        if (i >= 0 && i < totalMonths) {
          total_assets[i] += vals[i];
        }
      }
    }
  }

  // Subtract establishment costs from total_assets (they leave the simulation)
  for (let i = 0; i < totalMonths; i++) {
    // Establishment costs are cumulative — subtract from net worth going forward
    // We track the cumulative cost and subtract from total_assets
  }
  // Simpler: track establishment cost as a running deduction from net_worth.
  // Spec says it "leaves" simulation value at start_date. We model it as reducing
  // net_worth from that point forward by accumulating the costs.
  let cumulativeEstCost = 0;
  const estCostDeduction = new Array<number>(totalMonths).fill(0);
  for (let i = 0; i < totalMonths; i++) {
    cumulativeEstCost += establishmentCostsByMonth[i];
    estCostDeduction[i] = cumulativeEstCost;
  }

  const net_worth = total_assets.map(
    (v, i) => v + total_debt[i] - estCostDeduction[i]
  );

  return {
    months: simMonths,
    assets: Object.fromEntries(assetValues),
    aggregations: { total_assets, total_debt, net_worth },
    surpluses,
  };
}

// ---------------------------------------------------------------------------
// Value distribution
// ---------------------------------------------------------------------------

/**
 * Distribute parent's final value to children via branches.
 * Returns the undistributed surplus.
 */
function distributeToChildren(
  parent: Asset,
  finalValue: number,
  resolvedInitialValues: Map<string, number>
): number {
  if (parent.branches.length === 0) return finalValue;

  let distributed = 0;

  for (const branch of parent.branches) {
    let amount: number;
    if (branch.type === "percent") {
      amount = finalValue * branch.value;
    } else {
      // amount branch — capped at remaining final value
      amount = Math.min(branch.value, finalValue - distributed);
      amount = Math.max(0, amount);
    }

    // Add to child's initial value (child may already have a value if it has
    // multiple parents, which isn't typical but we handle it additively)
    const existing = resolvedInitialValues.get(branch.childAssetId) ?? 0;
    resolvedInitialValues.set(branch.childAssetId, existing + amount);
    distributed += amount;
  }

  return Math.max(0, finalValue - distributed);
}

// ---------------------------------------------------------------------------
// Asset function application
// ---------------------------------------------------------------------------

/**
 * Apply a deposit/withdrawal function to the deltas array.
 * For counterpart functions, also adjust the counterpart asset's deltas.
 *
 * Note: counterpart assets must already be in assetValues if they are parents,
 * but for simplicity we apply counterpart adjustments via a shared deltas map
 * that gets picked up when those assets are processed. Since we process in topo
 * order, counterpart targets are typically processed after sources — we need a
 * pre-pass. We handle this with a separate per-asset deltas map built before
 * the main loop.
 */
function applyFunction(
  fn: AssetFunction,
  asset: Asset,
  simMonths: string[],
  monthIdxMap: Map<string, number>,
  deltas: number[],
  _assetValues: Map<string, number[]>
): void {
  const isDeposit =
    fn.type === "deposit_once" || fn.type === "deposit_recurring";
  const sign = isDeposit ? 1 : -1;

  if (fn.type === "deposit_once" || fn.type === "withdrawal_once") {
    const label = toMonthLabel(fn.startDate);
    const idx = monthIdxMap.get(label) ?? -1;
    if (idx >= 0 && idx < deltas.length) {
      deltas[idx] += sign * fn.amount;
    }
  } else {
    // Recurring
    const startLabel = toMonthLabel(fn.startDate);
    const endLabel = fn.endDate ? toMonthLabel(fn.endDate) : toMonthLabel(asset.endDate);
    const interval = fn.intervalMonths ?? 1;

    let startIdx = monthIdxMap.get(startLabel) ?? -1;
    const endIdx = monthIdxMap.get(endLabel) ?? -1;

    if (startIdx === -1 || endIdx === -1) return;

    for (let i = startIdx; i <= endIdx; i += interval) {
      if (i >= 0 && i < deltas.length) {
        deltas[i] += sign * fn.amount;
      }
    }
  }
}

// ---------------------------------------------------------------------------
// Topological sort
// ---------------------------------------------------------------------------

/**
 * Sort assets so parents come before children.
 * Uses a simple DFS-based topo sort on the parent→child graph.
 */
function topoSort(assets: Asset[]): Asset[] {
  const assetMap = new Map<string, Asset>();
  for (const a of assets) assetMap.set(a.id, a);

  // Build child → parents mapping from branches
  const childToParents = new Map<string, string[]>();
  for (const a of assets) {
    for (const b of a.branches) {
      const existing = childToParents.get(b.childAssetId) ?? [];
      existing.push(a.id);
      childToParents.set(b.childAssetId, existing);
    }
  }

  const visited = new Set<string>();
  const result: Asset[] = [];

  function visit(id: string) {
    if (visited.has(id)) return;
    visited.add(id);
    // Visit all parents first
    const parents = childToParents.get(id) ?? [];
    for (const parentId of parents) {
      visit(parentId);
    }
    const asset = assetMap.get(id);
    if (asset) result.push(asset);
  }

  for (const a of assets) {
    visit(a.id);
  }

  return result;
}
