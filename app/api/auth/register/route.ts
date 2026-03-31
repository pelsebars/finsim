import { NextRequest, NextResponse } from "next/server";
import bcrypt from "bcryptjs";
import pool from "@/lib/db";
import { signToken, COOKIE_NAME } from "@/lib/auth";

export async function POST(req: NextRequest) {
  const { email, password } = await req.json();

  // Validate email format
  const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  if (!email || !emailRegex.test(email)) {
    return NextResponse.json({ error: "Ugyldig e-mailadresse." }, { status: 400 });
  }

  // Validate password length
  if (!password || password.length < 8) {
    return NextResponse.json({ error: "Adgangskode skal være mindst 8 tegn." }, { status: 400 });
  }

  // Check if email already taken
  const existing = await pool.query("SELECT id FROM users WHERE email = $1", [email]);
  if (existing.rows.length > 0) {
    return NextResponse.json({ error: "E-mailadressen er allerede i brug." }, { status: 400 });
  }

  const passwordHash = await bcrypt.hash(password, 12);
  const result = await pool.query(
    "INSERT INTO users (email, password_hash) VALUES ($1, $2) RETURNING id, email",
    [email, passwordHash]
  );
  const user = result.rows[0];

  const token = signToken({ userId: user.id, email: user.email });

  const response = NextResponse.json({ id: user.id, email: user.email }, { status: 201 });
  response.cookies.set(COOKIE_NAME, token, {
    httpOnly: true,
    secure: process.env.NODE_ENV === "production",
    sameSite: "lax",
    maxAge: 60 * 60 * 24 * 7,
    path: "/",
  });

  return response;
}
