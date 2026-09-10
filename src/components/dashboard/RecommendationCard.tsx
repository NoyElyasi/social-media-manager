"use client";

import { useState } from "react";

export interface RecommendationBreakdownRow {
  label: string;
  value: number;
  count: number;
}

/** כרטיס המלצה עם אייקון "i" — בלחיצה נפתח פירוט הנתונים שמגבים את ההמלצה. */
export default function RecommendationCard({
  action,
  detail,
  breakdown,
  unit,
  highlighted,
  icon = "🎯",
}: {
  action: string;
  detail: string;
  breakdown: RecommendationBreakdownRow[];
  unit?: string;
  highlighted?: boolean;
  icon?: string;
}) {
  const [open, setOpen] = useState(false);

  return (
    <div
      className={`min-w-[260px] max-w-[300px] shrink-0 self-start snap-start rounded-lg border p-4 text-sm ${
        highlighted ? "border-2 border-brand-red bg-brand-pink/10" : "border-brand-pink/40 bg-brand-pink/10"
      }`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-medium text-brand-red">{icon} {action}</p>
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          aria-label="הסבר מבוסס נתונים"
          className="shrink-0 flex h-5 w-5 items-center justify-center rounded-full border border-brand-red text-[10px] font-bold text-brand-red hover:bg-brand-red hover:text-white"
        >
          i
        </button>
      </div>
      <p className="mt-1 text-xs text-brand-maroon/70">{detail}</p>
      {open && (
        <div className="mt-2 flex flex-col gap-1 border-t border-brand-pink/40 pt-2 text-xs text-brand-maroon/70">
          {breakdown.map((b) => (
            <div key={b.label} className="flex items-baseline justify-between gap-2">
              <span className="text-brand-maroon/60 shrink-0">{b.label}</span>
              <span className="font-medium text-left whitespace-nowrap" dir="ltr">
                {b.value.toFixed(1).replace(/\.0$/, "")}
                {unit ?? ""} ({b.count})
              </span>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
