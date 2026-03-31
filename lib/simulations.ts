/**
 * Database helpers for simulations — loads data and maps to engine types.
 */

import pool from "./db";
import type { Simulation, Asset, AssetFunction, AssetBranch } from "./engine/types";

/** Load a full simulation (with all assets, functions, branches) for a given user. */
export async function loadSimulation(
  simulationId: string,
  userId: string
): Promise<Simulation | null> {
  const simRes = await pool.query(
    `SELECT id, user_id, name,
            to_char(start_date, 'YYYY-MM-DD') AS start_date,
            to_char(end_date, 'YYYY-MM-DD') AS end_date
     FROM simulations WHERE id = $1 AND user_id = $2`,
    [simulationId, userId]
  );
  if (simRes.rows.length === 0) return null;
  const row = simRes.rows[0];

  const assets = await loadAssets(simulationId);

  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    startDate: row.start_date,
    endDate: row.end_date,
    assets,
  };
}

async function loadAssets(simulationId: string): Promise<Asset[]> {
  const assetRes = await pool.query(
    `SELECT id, simulation_id, type, name,
            to_char(start_date, 'YYYY-MM-DD') AS start_date,
            to_char(end_date, 'YYYY-MM-DD') AS end_date,
            initial_value, parent_id, display_order,
            annual_rate, variable_rates, agent_fee, establishment_cost
     FROM assets WHERE simulation_id = $1
     ORDER BY display_order ASC`,
    [simulationId]
  );

  const assetIds = assetRes.rows.map((r: { id: string }) => r.id);
  if (assetIds.length === 0) return [];

  const fnRes = await pool.query(
    `SELECT id, asset_id, type,
            to_char(start_date, 'YYYY-MM-DD') AS start_date,
            to_char(end_date, 'YYYY-MM-DD') AS end_date,
            interval_months, amount, counterpart_asset_id
     FROM asset_functions WHERE asset_id = ANY($1)`,
    [assetIds]
  );

  const branchRes = await pool.query(
    `SELECT id, parent_asset_id, child_asset_id, type, value
     FROM asset_branches WHERE parent_asset_id = ANY($1)`,
    [assetIds]
  );

  // Group functions and branches by asset
  const fnsByAsset = new Map<string, AssetFunction[]>();
  for (const fn of fnRes.rows) {
    const list = fnsByAsset.get(fn.asset_id) ?? [];
    list.push({
      id: fn.id,
      assetId: fn.asset_id,
      type: fn.type,
      startDate: fn.start_date,
      endDate: fn.end_date ?? undefined,
      intervalMonths: fn.interval_months ?? undefined,
      amount: parseFloat(fn.amount),
      counterpartAssetId: fn.counterpart_asset_id ?? undefined,
    });
    fnsByAsset.set(fn.asset_id, list);
  }

  const branchesByAsset = new Map<string, AssetBranch[]>();
  for (const b of branchRes.rows) {
    const list = branchesByAsset.get(b.parent_asset_id) ?? [];
    list.push({
      id: b.id,
      parentAssetId: b.parent_asset_id,
      childAssetId: b.child_asset_id,
      type: b.type,
      value: parseFloat(b.value),
    });
    branchesByAsset.set(b.parent_asset_id, list);
  }

  return assetRes.rows.map((r: {
    id: string;
    simulation_id: string;
    type: string;
    name: string;
    start_date: string;
    end_date: string;
    initial_value: string;
    parent_id: string | null;
    display_order: number;
    annual_rate: string | null;
    variable_rates: Record<string, number> | null;
    agent_fee: string | null;
    establishment_cost: string | null;
  }) => ({
    id: r.id,
    simulationId: r.simulation_id,
    type: r.type as Asset["type"],
    name: r.name,
    startDate: r.start_date,
    endDate: r.end_date,
    initialValue: parseFloat(r.initial_value),
    parentId: r.parent_id ?? undefined,
    displayOrder: r.display_order,
    annualRate: r.annual_rate != null ? parseFloat(r.annual_rate) : undefined,
    variableRates: r.variable_rates ?? undefined,
    agentFee: r.agent_fee != null ? parseFloat(r.agent_fee) : undefined,
    establishmentCost:
      r.establishment_cost != null
        ? parseFloat(r.establishment_cost)
        : undefined,
    functions: fnsByAsset.get(r.id) ?? [],
    branches: branchesByAsset.get(r.id) ?? [],
  }));
}
