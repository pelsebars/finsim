"use client";

import { useEffect, useState } from "react";

interface SimSummary {
  id: string;
  name: string;
  start_date: string;
  end_date: string;
}

interface Props {
  onLoad: (sim: SimSummary) => void;
  onClose: () => void;
}

export default function LoadModal({ onLoad, onClose }: Props) {
  const [sims, setSims] = useState<SimSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);

  useEffect(() => {
    fetch("/api/simulations")
      .then((r) => r.json())
      .then((data) => { setSims(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  async function handleDelete(id: string) {
    setDeletingId(id);
    try {
      const res = await fetch(`/api/simulations/${id}`, { method: "DELETE" });
      if (!res.ok) throw new Error();
      setSims((prev) => prev.filter((s) => s.id !== id));
    } catch {
      // silent — user will see nothing happened
    } finally {
      setDeletingId(null);
      setConfirmId(null);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-[440px] shadow-2xl max-h-[70vh] flex flex-col"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 className="text-white font-semibold text-lg">Hent simulering</h2>
          <button onClick={onClose} className="text-gray-400 hover:text-white text-xl leading-none">×</button>
        </div>

        {loading && <p className="text-gray-400 text-sm">Indlæser…</p>}
        {!loading && sims.length === 0 && (
          <p className="text-gray-400 text-sm">Ingen gemte simuleringer fundet.</p>
        )}

        <div className="overflow-y-auto flex flex-col gap-2">
          {sims.map((s) => (
            <div key={s.id} className="bg-gray-800 border border-gray-700 rounded">
              {confirmId === s.id ? (
                /* Delete confirmation */
                <div className="px-3 py-2 flex items-center gap-2">
                  <span className="text-sm text-red-400 flex-1">Slet &quot;{s.name}&quot;?</span>
                  <button
                    className="text-xs text-red-400 hover:text-red-300 font-medium disabled:opacity-50"
                    onClick={() => handleDelete(s.id)}
                    disabled={deletingId === s.id}
                  >
                    {deletingId === s.id ? "Sletter…" : "Ja, slet"}
                  </button>
                  <button
                    className="text-xs text-gray-400 hover:text-white"
                    onClick={() => setConfirmId(null)}
                  >
                    Annuller
                  </button>
                </div>
              ) : (
                /* Normal row */
                <div className="flex items-stretch">
                  <button
                    className="flex-1 text-left px-3 py-2 hover:bg-gray-700 transition-colors rounded-l"
                    onClick={() => onLoad(s)}
                  >
                    <div className="text-white text-sm font-medium">{s.name}</div>
                    <div className="text-gray-500 text-xs mt-0.5">
                      {s.start_date.slice(0, 7)} → {s.end_date.slice(0, 7)}
                    </div>
                  </button>
                  <button
                    className="px-2 text-gray-600 hover:text-red-400 hover:bg-gray-700 transition-colors rounded-r border-l border-gray-700"
                    onClick={(e) => { e.stopPropagation(); setConfirmId(s.id); }}
                    title="Slet simulering"
                  >
                    ×
                  </button>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
