import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { signToken, COOKIE_NAME } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  if (!email || !password) {
    return NextResponse.json({ error: "E-mail og adgangskode er påkrævet." }, { status: 400 });
  }

  const result = await pool.query("SELECT id, email, password_hash FROM users WHERE email = $1", [email]);
  const user = result.rows[0];

  if (!user) {
    return NextResponse.json({ error: "Forkert e-mail eller adgangskode." }, { status: 401 });
  }

  const valid = await bcrypt.compare(password, user.password_hash);
  if (!valid) {
    return NextResponse.json({ error: "Forkert e-mail eller adgangskode." }, { status: 401 });
  }

  const token = signToken({ userId: user.id, email: user.email });

  const response = NextResponse.json({ id: user.id, email: user.email });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return response;
}
