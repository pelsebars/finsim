import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";
import { loadSimulation } from "@/lib/simulations";

export async function GET(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sim = await loadSimulation(id, session.userId);
  if (!sim) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json(sim);
}

export async function DELETE(
  _req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const res = await pool.query(
    "DELETE FROM simulations WHERE id = $1 AND user_id = $2 RETURNING id",
    [id, session.userId]
  );
  if (res.rows.length === 0) return NextResponse.json({ error: "Not found" }, { status: 404 });

  return NextResponse.json({ deleted: true });
}
