import { redirect } from "next/navigation";
import { getSession } from "@/lib/auth";
import Navbar from "@/components/Navbar";

export default async function HomePage() {
  const session = await getSession();
  if (!session) {
    redirect("/login");
  }

  return (
    <div className="flex flex-col h-screen">
      <Navbar email={session.email} showLogout />
      <main className="flex-1 flex items-center justify-center">
        <div className="text-center">
          <h1 className="text-2xl font-semibold text-gray-100 mb-2">
            Velkommen, {session.email}
          </h1>
          <p className="text-gray-500 text-sm">FinSim er klar til brug.</p>
        </div>
      </main>
    </div>
  );
}
