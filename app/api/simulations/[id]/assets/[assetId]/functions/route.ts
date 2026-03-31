import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";

async function resolveAsset(assetId: string, simulationId: string, userId: string) {
  const res = await pool.query(
    `SELECT a.id FROM assets a
     JOIN simulations s ON s.id = a.simulation_id
     WHERE a.id = $1 AND a.simulation_id = $2 AND s.user_id = $3`,
    [assetId, simulationId, userId]
  );
  return res.rows.length > 0;
}

export async function POST(
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
  const { type, start_date, end_date, interval_months, amount, counterpart_asset_id } = body;

  const validTypes = ["deposit_once", "withdrawal_once", "deposit_recurring", "withdrawal_recurring"];
  if (!type || !validTypes.includes(type)) {
    return NextResponse.json({ error: "Invalid function type" }, { status: 400 });
  }
  if (!start_date || amount == null) {
    return NextResponse.json({ error: "start_date and amount are required" }, { status: 400 });
  }

  const res = await pool.query(
    `INSERT INTO asset_functions
       (asset_id, type, start_date, end_date, interval_months, amount, counterpart_asset_id)
     VALUES ($1,$2,$3,$4,$5,$6,$7)
     RETURNING id, asset_id, type,
               to_char(start_date, 'YYYY-MM-DD') AS start_date,
               to_char(end_date, 'YYYY-MM-DD') AS end_date,
               interval_months, amount, counterpart_asset_id`,
    [
      assetId, type, start_date, end_date ?? null,
      interval_months ?? null, amount, counterpart_asset_id ?? null,
    ]
  );

  return NextResponse.json(res.rows[0], { status: 201 });
}
