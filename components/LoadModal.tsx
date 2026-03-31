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

  useEffect(() => {
    fetch("/api/simulations")
      .then((r) => r.json())
      .then((data) => { setSims(data); setLoading(false); })
      .catch(() => setLoading(false));
  }, []);

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60" onClick={onClose}>
      <div
        className="bg-gray-900 border border-gray-700 rounded-lg p-6 w-96 shadow-2xl max-h-[70vh] flex flex-col"
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
            <button
              key={s.id}
              className="text-left bg-gray-800 hover:bg-gray-700 border border-gray-700 rounded px-3 py-2 transition-colors"
              onClick={() => onLoad(s)}
            >
              <div className="text-white text-sm font-medium">{s.name}</div>
              <div className="text-gray-500 text-xs mt-0.5">
                {s.start_date.slice(0, 7)} → {s.end_date.slice(0, 7)}
              </div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
