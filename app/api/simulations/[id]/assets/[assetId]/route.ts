import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";

/** Verify the asset belongs to a simulation owned by the user. */
async function resolveAsset(assetId: string, simulationId: string, userId: string) {
  const res = await pool.query(
    `SELECT a.id FROM assets a
     JOIN simulations s ON s.id = a.simulation_id
     WHERE a.id = $1 AND a.simulation_id = $2 AND s.user_id = $3`,
    [assetId, simulationId, userId]
  );
  return res.rows.length > 0;
}

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, assetId } = await params;
  if (!(await resolveAsset(assetId, id, session.userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const {
    name, start_date, end_date, initial_value, parent_id,
    display_order, annual_rate, variable_rates, agent_fee, establishment_cost,
  } = body;

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

  return NextResponse.json(res.rows[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, assetId } = await params;
  if (!(await resolveAsset(assetId, id, session.userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await pool.query("DELETE FROM assets WHERE id = $1", [assetId]);
  await pool.query("UPDATE simulations SET updated_at = NOW() WHERE id = $1", [id]);

  return NextResponse.json({ deleted: true });
}
