import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";

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
