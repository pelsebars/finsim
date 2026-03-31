import { NextRequest, NextResponse } from "next/server";
import pool from "@/lib/db";
import { getSession } from "@/lib/auth";

export async function GET() {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const res = await pool.query(
    `SELECT id, name,
            to_char(start_date, 'YYYY-MM-DD') AS start_date,
            to_char(end_date, 'YYYY-MM-DD') AS end_date,
            created_at, updated_at
     FROM simulations WHERE user_id = $1
     ORDER BY created_at DESC`,
    [session.userId]
  );
  return NextResponse.json(res.rows);
}

export async function POST(req: NextRequest) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { name, start_date, end_date } = await req.json();
  if (!name || !start_date || !end_date) {
    return NextResponse.json({ error: "name, start_date, and end_date are required" }, { status: 400 });
  }

  const res = await pool.query(
    `INSERT INTO simulations (user_id, name, start_date, end_date)
     VALUES ($1, $2, $3, $4)
     RETURNING id, name,
               to_char(start_date, 'YYYY-MM-DD') AS start_date,
               to_char(end_date, 'YYYY-MM-DD') AS end_date,
               created_at`,
    [session.userId, name, start_date, end_date]
  );
  return NextResponse.json(res.rows[0], { status: 201 });
}
