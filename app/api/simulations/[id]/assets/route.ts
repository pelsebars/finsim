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
  const {
    type, name, start_date, end_date, initial_value = 0, parent_id,
    display_order = 0, annual_rate, variable_rates, agent_fee,
    establishment_cost,
  } = body;

  if (!type || !name || !start_date || !end_date) {
    return NextResponse.json(
      { error: "type, name, start_date, and end_date are required" },
      { status: 400 }
    );
  }

  const validTypes = ["stock", "liquid", "pension", "property", "loan"];
  if (!validTypes.includes(type)) {
    return NextResponse.json({ error: "Invalid asset type" }, { status: 400 });
  }

  const res = await pool.query(
    `INSERT INTO assets (
       simulation_id, type, name, start_date, end_date, initial_value,
       parent_id, display_order, annual_rate, variable_rates, agent_fee,
       establishment_cost
     ) VALUES ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12)
     RETURNING id, simulation_id, type, name,
               to_char(start_date, 'YYYY-MM-DD') AS start_date,
               to_char(end_date, 'YYYY-MM-DD') AS end_date,
               initial_value, parent_id, display_order,
               annual_rate, variable_rates, agent_fee, establishment_cost`,
    [
      id, type, name, start_date, end_date, initial_value,
      parent_id ?? null, display_order, annual_rate ?? null,
      variable_rates ? JSON.stringify(variable_rates) : null,
      agent_fee ?? null, establishment_cost ?? null,
    ]
  );

  // Update simulation updated_at
  await pool.query("UPDATE simulations SET updated_at = NOW() WHERE id = $1", [id]);

  return NextResponse.json(res.rows[0], { status: 201 });
}
