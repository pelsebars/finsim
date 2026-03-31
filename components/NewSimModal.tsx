"use client";

import { useState } from "react";

interface Props {
  onCreated: (sim: { id: string; name: string; start_date: string; end_date: string }) => void;
}

const MONTHS = [
  { v: "01", l: "Januar" }, { v: "02", l: "Februar" }, { v: "03", l: "Marts" },
  { v: "04", l: "April" },  { v: "05", l: "Maj" },      { v: "06", l: "Juni" },
  { v: "07", l: "Juli" },   { v: "08", l: "August" },   { v: "09", l: "September" },
  { v: "10", l: "Oktober" },{ v: "11", l: "November" }, { v: "12", l: "December" },
];

function yearOptions() {
  const cur = new Date().getFullYear();
  const opts: number[] = [];
  for (let y = cur - 5; y <= cur + 60; y++) opts.push(y);
  return opts;
}

export default function NewSimModal({ onCreated }: Props) {
  const [name, setName] = useState("");
  const [startM, setStartM] = useState("01");
  const [startY, setStartY] = useState(String(new Date().getFullYear()));
  const [endM, setEndM]   = useState("12");
  const [endY, setEndY]   = useState(String(new Date().getFullYear() + 20));
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    if (!name.trim()) { setError("Angiv et navn."); return; }
    const start = `${startY}-${startM}-01`;
    const end   = `${endY}-${endM}-01`;
    if (start >= end) { setError("Slutdato skal være efter startdato."); return; }
    setSaving(true);
    setError("");
    try {
      const res = await fetch("/api/simulations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), start_date: start, end_date: end }),
      });
      if (!res.ok) throw new Error("Fejl ved oprettelse.");
      const sim = await res.json();
      onCreated(sim);
    } catch (e: unknown) {
      setError(e instanceof Error ? e.message : "Ukendt fejl.");
    } finally {
      setSaving(false);
    }
  }

  const years = yearOptions();

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60">
      <div className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96 shadow-2xl">
        <h2 className="text-white font-semibold text-lg mb-4">Opret ny simulering</h2>

        <label className="block text-sm text-gray-400 mb-1">Navn</label>
        <input
          className="w-full bg-gray-800 border border-gray-700 rounded px-3 py-2 text-sm text-white mb-4 focus:outline-none focus:border-gray-500"
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Min simulering"
          autoFocus
        />

        <div className="flex gap-3 mb-4">
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1">Startdato</label>
            <div className="flex gap-1">
              <select
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white focus:outline-none"
                value={startM} onChange={(e) => setStartM(e.target.value)}
              >
                {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              <select
                className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white focus:outline-none"
                value={startY} onChange={(e) => setStartY(e.target.value)}
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
          <div className="flex-1">
            <label className="block text-sm text-gray-400 mb-1">Slutdato</label>
            <div className="flex gap-1">
              <select
                className="flex-1 bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white focus:outline-none"
                value={endM} onChange={(e) => setEndM(e.target.value)}
              >
                {MONTHS.map(m => <option key={m.v} value={m.v}>{m.l}</option>)}
              </select>
              <select
                className="w-24 bg-gray-800 border border-gray-700 rounded px-2 py-2 text-sm text-white focus:outline-none"
                value={endY} onChange={(e) => setEndY(e.target.value)}
              >
                {years.map(y => <option key={y} value={y}>{y}</option>)}
              </select>
            </div>
          </div>
        </div>

        {error && <p className="text-red-400 text-sm mb-3">{error}</p>}

        <button
          className="w-full bg-blue-600 hover:bg-blue-500 disabled:opacity-50 text-white text-sm font-medium py-2 rounded transition-colors"
          onClick={handleSave}
          disabled={saving}
        >
          {saving ? "Opretter…" : "Opret simulering"}
        </button>
      </div>
    </div>
  );
}
