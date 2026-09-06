"use client";

import type { BackgroundItem } from "./BackgroundGallery";

/** בחירת תבנית רקע אחת (או "בלי תבנית") מבין הרקעים שהועלו בהגדרות — לשימוש בזמן יצירת פוסט. */
export default function BackgroundPicker({
  items,
  selected,
  onSelect,
  noneLabel,
}: {
  items: BackgroundItem[];
  selected: string | null;
  onSelect: (path: string | null) => void;
  noneLabel: string;
}) {
  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={() => onSelect(null)}
        className={`flex h-32 w-24 items-center justify-center rounded-md border p-1 text-center text-xs ${
          selected === null ? "border-blue-600 ring-2 ring-blue-600" : "border-neutral-300 hover:bg-neutral-50"
        }`}
      >
        {noneLabel}
      </button>
      {items.map((item) => (
        <button
          key={item.path}
          type="button"
          onClick={() => onSelect(item.path)}
          className={`h-32 w-24 rounded-md border overflow-hidden ${
            selected === item.path ? "border-blue-600 ring-2 ring-blue-600" : "border-neutral-300"
          }`}
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={item.url} alt="" className="h-full w-full object-cover" />
        </button>
      ))}
    </div>
  );
}
