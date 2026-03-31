import { NextRequest, NextResponse } from "next/server";
import { getSession } from "@/lib/auth";
import { loadSimulation } from "@/lib/simulations";
import { runEngine } from "@/lib/engine";

export async function GET(
  req: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await getSession();
  if (!session) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const sim = await loadSimulation(id, session.userId);
  if (!sim) return NextResponse.json({ error: "Not found" }, { status: 404 });

  // Optional query param: include_pension=false to toggle pension out of aggregations
  const includePension = req.nextUrl.searchParams.get("include_pension") !== "false";

  const result = runEngine(sim, { includePension });
  return NextResponse.json(result);
}
