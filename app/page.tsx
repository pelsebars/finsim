import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import pool from "@/lib/db";
import SimulationView from "@/components/SimulationView";

export default async function HomePage() {
  const session = await getSession();
  if (!session) redirect("/login");

  // Fetch the most recent simulation ID for this user (if any)
  const res = await pool.query(
    `SELECT id FROM simulations WHERE user_id = $1 ORDER BY created_at DESC LIMIT 1`,
    [session.userId]
  );
  const initialSimId: string | null = res.rows[0]?.id ?? null;

  return (
    <SimulationView
      email={session.email}
      initialSimId={initialSimId}
    />
  );
}
