import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";

async function ownsSimulation(simulationId: string, userId: string): Promise<boolean> {
  const res = await pool.query(
    "SELECT id FROM simulations WHERE id = $1 AND user_id = $2",
    [simulationId, userId]
  );
  return res.rows.length > 0;
}

export async function POST(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  if (!(await ownsSimulation(id, session.userId))) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const body = await req.json();
  const { parent_asset_id, child_asset_id, type, value } = body;

  if (!parent_asset_id || !child_asset_id || !type || value == null) {
    return NextResponse.json(
      { error: "parent_asset_id, child_asset_id, type, and value are required" },
      { status: 400 }
    );
  }
  if (!["amount", "percent"].includes(type)) {
    return NextResponse.json({ error: "type must be 'amount' or 'percent'" }, { status: 400 });
  }

  // Both assets must belong to this simulation
  const assetCheck = await pool.query(
    "SELECT id FROM assets WHERE id = ANY($1) AND simulation_id = $2",
    [[parent_asset_id, child_asset_id], id]
  );
  if (assetCheck.rows.length < 2) {
    return NextResponse.json({ error: "Assets not found in simulation" }, { status: 400 });
  }

  const res = await pool.query(
    `INSERT INTO asset_branches (parent_asset_id, child_asset_id, type, value)
     VALUES ($1, $2, $3, $4)
     RETURNING id, parent_asset_id, child_asset_id, type, value`,
    [parent_asset_id, child_asset_id, type, value]
  );

  return NextResponse.json(res.rows[0], { status: 201 });
}
