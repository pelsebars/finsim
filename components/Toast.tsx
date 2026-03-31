"use client";

import { useEffect } from "react";

export interface ToastMessage {
  id: string;
  message: string;
  type: "success" | "error" | "info";
}

interface Props {
  toasts: ToastMessage[];
  onDismiss: (id: string) => void;
}

export default function Toast({ toasts, onDismiss }: Props) {
  // Auto-dismiss after 3 s
  useEffect(() => {
    if (toasts.length === 0) return;
    const newest = toasts[toasts.length - 1];
    const t = setTimeout(() => onDismiss(newest.id), 3000);
    return () => clearTimeout(t);
  }, [toasts, onDismiss]);

  if (toasts.length === 0) return null;

  return (
    <div className="fixed bottom-6 right-6 z-50 flex flex-col gap-2 pointer-events-none">
      {toasts.map((t) => (
        <div
          key={t.id}
          className={`px-4 py-2 rounded shadow-lg text-sm font-medium pointer-events-auto cursor-pointer select-none
            ${t.type === "success" ? "bg-green-700 text-white" :
              t.type === "error"   ? "bg-red-700 text-white" :
                                     "bg-gray-700 text-white"}`}
          onClick={() => onDismiss(t.id)}
        >
          {t.message}
        </div>
      ))}
    </div>
  );
}
