import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";

/** Verify the asset belongs to a simulation owned by the user. Returns old parent_id or false. */
async function resolveAsset(
  assetId: string, simulationId: string, userId: string
): Promise<{ oldParentId: string | null } | false> {
  const res = await pool.query(
    `SELECT a.parent_id FROM assets a
     JOIN simulations s ON s.id = a.simulation_id
     WHERE a.id = $1 AND a.simulation_id = $2 AND s.user_id = $3`,
    [assetId, simulationId, userId]
  );
  if (res.rows.length === 0) return false;
  return { oldParentId: res.rows[0].parent_id ?? null };
}

/**
 * Auto-create a percent branch from parentId → childId.
 * Allocates whatever percentage remains after existing percent branches.
 */
async function upsertBranch(parentAssetId: string, childAssetId: string) {
  const existing = await pool.query(
    `SELECT id FROM asset_branches WHERE parent_asset_id = $1 AND child_asset_id = $2`,
    [parentAssetId, childAssetId]
  );
  if (existing.rows.length > 0) return;

  const sumRes = await pool.query(
    `SELECT COALESCE(SUM(value), 0) AS total
     FROM asset_branches WHERE parent_asset_id = $1 AND type = 'percent'`,
    [parentAssetId]
  );
  const allocated = parseFloat(sumRes.rows[0].total);
  const remaining = Math.max(0, 1.0 - allocated);
  if (remaining <= 0) return;

  await pool.query(
    `INSERT INTO asset_branches (parent_asset_id, child_asset_id, type, value)
     VALUES ($1, $2, 'percent', $3)`,
    [parentAssetId, childAssetId, remaining]
  );
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, assetId } = await params;
  const resolved = await resolveAsset(assetId, id, session.userId);
  if (!resolved) return NextResponse.json({ error: "Not found" }, { status: 404 });

  const body = await req.json();
  const {
    name, start_date, end_date, initial_value, parent_id,
    display_order, annual_rate, variable_rates, agent_fee, establishment_cost,
  } = body;

  // Detect parent change — only when parent_id is explicitly in the body
  const parentChanging = "parent_id" in body;
  const oldParentId = resolved.oldParentId;
  const newParentId = parent_id ?? null;

  const res = await pool.query(
    `UPDATE assets SET
       name = COALESCE($1, name),
       start_date = COALESCE($2, start_date),
       end_date = COALESCE($3, end_date),
       initial_value = COALESCE($4, initial_value),
       parent_id = $5,
       display_order = COALESCE($6, display_order),
       annual_rate = $7,
       variable_rates = $8,
       agent_fee = $9,
       establishment_cost = $10
     WHERE id = $11
     RETURNING id, simulation_id, type, name,
               to_char(start_date, 'YYYY-MM-DD') AS start_date,
               to_char(end_date, 'YYYY-MM-DD') AS end_date,
               initial_value, parent_id, display_order,
               annual_rate, variable_rates, agent_fee, establishment_cost`,
    [
      name ?? null, start_date ?? null, end_date ?? null,
      initial_value ?? null, parent_id ?? null, display_order ?? null,
      annual_rate ?? null,
      variable_rates !== undefined ? JSON.stringify(variable_rates) : null,
      agent_fee ?? null, establishment_cost ?? null,
      assetId,
    ]
  );

  await pool.query("UPDATE simulations SET updated_at = NOW() WHERE id = $1", [id]);

  // Sync branches when parent changes
  if (parentChanging && oldParentId !== newParentId) {
    // Remove old branch
    if (oldParentId) {
      await pool.query(
        `DELETE FROM asset_branches WHERE parent_asset_id = $1 AND child_asset_id = $2`,
        [oldParentId, assetId]
      );
    }
    // Create new branch
    if (newParentId) {
      await upsertBranch(newParentId, assetId);
    }
  }

  return NextResponse.json(res.rows[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, assetId } = await params;
  const resolved = await resolveAsset(assetId, id, session.userId);
  if (!resolved) return NextResponse.json({ error: "Not found" }, { status: 404 });

  await pool.query("DELETE FROM assets WHERE id = $1", [assetId]);
  await pool.query("UPDATE simulations SET updated_at = NOW() WHERE id = $1", [id]);

  return NextResponse.json({ deleted: true });
}
