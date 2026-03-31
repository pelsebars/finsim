import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string; assetId: string; fnId: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id, assetId, fnId } = await params;

  // Verify ownership
  const check = await pool.query(
    `SELECT af.id FROM asset_functions af
     JOIN assets a ON a.id = af.asset_id
     JOIN simulations s ON s.id = a.simulation_id
     WHERE af.id = $1 AND af.asset_id = $2 AND a.simulation_id = $3 AND s.user_id = $4`,
    [fnId, assetId, id, session.userId]
  );
  if (check.rows.length === 0) {
    return NextResponse.json({ error: "Not found" }, { status: 404 });
  }

  await pool.query("DELETE FROM asset_functions WHERE id = $1", [fnId]);
  return NextResponse.json({ deleted: true });
}
