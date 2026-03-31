"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);

    try {
      const res = await fetch("/api/auth/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, password }),
      });

      const data = await res.json();

      if (!res.ok) {
        setError(data.error ?? "Der opstod en fejl.");
        return;
      }

      router.push("/");
    } catch {
      setError("Kunne ikke kontakte serveren.");
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen flex flex-col">
      <nav className="h-12 bg-gray-900 border-b border-gray-800 flex items-center px-6">
        <span className="text-white font-semibold tracking-wide text-sm">FinSim</span>
      </nav>
      <div className="flex-1 flex items-center justify-center">
        <div className="w-full max-w-sm">
          <h1 className="text-xl font-semibold text-gray-100 mb-6">Log ind</h1>
          <form onSubmit={handleSubmit} className="space-y-4">
            <div>
              <label className="block text-sm text-gray-400 mb-1">E-mail</label>
              <input
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-gray-500"
              />
            </div>
            <div>
              <label className="block text-sm text-gray-400 mb-1">Adgangskode</label>
              <input
                type="password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                required
                className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-gray-100 focus:outline-none focus:border-gray-500"
              />
            </div>
            {error && <p className="text-red-400 text-sm">{error}</p>}
            <button
              type="submit"
              disabled={loading}
              className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded transition-colors"
            >
              {loading ? "Logger ind…" : "Log ind"}
            </button>
          </form>
          <p className="mt-4 text-sm text-gray-500">
            Ingen konto?{" "}
            <Link href="/register" className="text-gray-300 hover:text-white">
              Opret bruger
            </Link>
          </p>
        </div>
      </div>
    </div>
  );
}
