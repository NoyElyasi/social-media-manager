"use client";

export default function ReelProgress({
  rendered,
  total,
  etaSeconds,
  onCancel,
}: {
  rendered: number;
  total: number;
  etaSeconds: number | null;
  onCancel: () => void;
}) {
  const pct = total > 0 ? Math.min(100, Math.round((rendered / total) * 100)) : 0;

  return (
    <div className="flex items-center gap-3 rounded-md border border-brand-pink/40 bg-brand-pink/10 px-3 py-2">
      <div className="flex-1">
        <div className="h-2 w-full rounded-full bg-brand-pink/30 overflow-hidden">
          <div className="h-full bg-brand-red transition-all" style={{ width: `${pct}%` }} />
        </div>
        <p className="text-xs text-neutral-500 mt-1">
          מייצרת ריל... {rendered}/{total} תמונות
          {etaSeconds !== null && ` · נותרו כ-${etaSeconds} שניות`}
        </p>
      </div>
      <button
        type="button"
        onClick={onCancel}
        className="shrink-0 rounded-md border border-red-300 text-red-700 px-3 py-1.5 text-xs hover:bg-red-50"
      >
        עצור
      </button>
    </div>
  );
}
