"use client";

import { useMemo, useState } from "react";
import type { BackgroundItem } from "./BackgroundGallery";

/**
 * בחירת תבנית רקע אחת (או "בלי תבנית") מבין הרקעים שהועלו בהגדרות — לשימוש
 * בזמן יצירת/עריכת פוסט. כוללת את אותם פילטרי קטגוריה/"סקין" (למשל "מכתב",
 * "טיפ") שיש בגלריית ההגדרות, כדי שקל לראות ולבחור מבין הרבה תבניות —
 * בחירת פילטר היא בפועל גם הדרך לסווג את הפוסט לפי הסקין שלו, כי היא
 * מציגה רק את הרקעים הרלוונטיים לסוג הזה.
 */
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
  const [activeFilter, setActiveFilter] = useState<string | null>(null);

  const existingCategories = useMemo(
    () => [...new Set(items.map((i) => i.category?.trim()).filter((c): c is string => !!c))].sort(),
    [items]
  );
  const visibleItems = activeFilter === null ? items : items.filter((i) => (i.category?.trim() || "") === activeFilter);

  return (
    <div className="flex flex-col gap-2">
      {existingCategories.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveFilter(null)}
            className={`rounded-full px-3 py-1 ${
              activeFilter === null ? "bg-brand-red text-white" : "bg-brand-pink/10 text-brand-maroon hover:bg-brand-pink/20"
            }`}
          >
            הכל
          </button>
          {existingCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveFilter(cat)}
              className={`rounded-full px-3 py-1 ${
                activeFilter === cat ? "bg-brand-red text-white" : "bg-brand-pink/10 text-brand-maroon hover:bg-brand-pink/20"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}
      <div className="flex flex-wrap gap-3">
        <button
          type="button"
          onClick={() => onSelect(null)}
          className={`flex h-32 w-24 items-center justify-center rounded-md border p-1 text-center text-xs ${
            selected === null ? "border-brand-red ring-2 ring-brand-red" : "border-brand-pink/40 hover:bg-brand-pink/10"
          }`}
        >
          {noneLabel}
        </button>
        {visibleItems.map((item) => (
          <div key={item.path} className="flex flex-col items-center gap-1">
            <button
              type="button"
              onClick={() => onSelect(item.path)}
              className={`h-32 w-24 rounded-md border overflow-hidden ${
                selected === item.path ? "border-brand-red ring-2 ring-brand-red" : "border-brand-pink/40"
              }`}
            >
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={item.url} alt="" className="h-full w-full object-cover" />
            </button>
            {item.category?.trim() && <span className="text-[10px] text-brand-maroon/60">{item.category.trim()}</span>}
          </div>
        ))}
      </div>
    </div>
  );
}
