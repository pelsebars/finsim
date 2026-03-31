"use client";

import { useRouter } from "next/navigation";

interface NavbarProps {
  email?: string;
  showLogout?: boolean;
}

export default function Navbar({ email, showLogout }: NavbarProps) {
  const router = useRouter();

  async function handleLogout() {
    await fetch("/api/auth/logout", { method: "POST" });
    router.push("/login");
  }

  return (
    <nav className="h-12 bg-gray-900 border-b border-gray-800 flex items-center justify-between px-6 shrink-0">
      <span className="text-white font-semibold tracking-wide text-sm">FinSim</span>
      {showLogout && (
        <div className="flex items-center gap-4">
          {email && (
            <span className="text-gray-400 text-sm">{email}</span>
          )}
          <button
            onClick={handleLogout}
            className="text-sm text-gray-300 hover:text-white transition-colors"
          >
            Log ud
          </button>
        </div>
      )}
    </nav>
  );
}
