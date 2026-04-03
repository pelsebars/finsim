import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function PUT(
  req: NextRequest,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, branchId } = await params;

  // Verify ownership
  const check = await pool.query(
    `SELECT ab.id, ab.parent_asset_id FROM asset_branches ab
     JOIN assets a ON a.id = ab.parent_asset_id
     WHERE ab.id = $1 AND a.simulation_id = $2 AND EXISTS (
       SELECT 1 FROM simulations s WHERE s.id = $2 AND s.user_id = $3
     )`,
    [branchId, id, session.userId]
  );
  if (check.rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  const { value, type } = await req.json();
  if (value == null) return NextResponse.json({ error: "value is required" }, { status: 400 });

  // Over-100% validation for percent branches
  if (type === "percent" || !type) {
    const parentId = check.rows[0].parent_asset_id;
    const sumRes = await pool.query(
      `SELECT COALESCE(SUM(value), 0) AS total
       FROM asset_branches
       WHERE parent_asset_id = $1 AND type = 'percent' AND id != $2`,
      [parentId, branchId]
    );
    const otherTotal = parseFloat(sumRes.rows[0].total);
    if (otherTotal + value > 1.0001) {
      return NextResponse.json(
        { error: "Fordelinger overstiger 100%" },
        { status: 400 }
      );
    }
  }

  const res = await pool.query(
    `UPDATE asset_branches SET value = $1 WHERE id = $2
     RETURNING id, parent_asset_id, child_asset_id, type, value`,
    [value, branchId]
  );
  return NextResponse.json(res.rows[0]);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; branchId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, branchId } = await params;

  const check = await pool.query(
    `SELECT ab.id FROM asset_branches ab
     JOIN assets a ON a.id = ab.parent_asset_id
     JOIN simulations s ON s.id = a.simulation_id
     WHERE ab.id = $1 AND a.simulation_id = $2 AND s.user_id = $3`,
    [branchId, id, session.userId]
  );
  if (check.rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await pool.query("DELETE FROM asset_branches WHERE id = $1", [branchId]);
  return NextResponse.json({ deleted: true });
}
