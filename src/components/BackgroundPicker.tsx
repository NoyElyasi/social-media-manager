"use client";

import { useEffect, useMemo, useState } from "react";
import type { BackgroundItem } from "./BackgroundGallery";

// אותן מילות המפתח כמו FORMAT_LABELS/aiFormat במקומות אחרים בכלי — קטגוריה
// כמו "מכתב ביום" גם היא "מכתב" (התאמת "מכיל", לא שוויון מדויק).
const LETTER_KEYWORD = "מכתב";
const TIP_KEYWORD = "טיפ";

function matchesKeyword(category: string | undefined, keyword: string): boolean {
  return (category ?? "").includes(keyword);
}

type FilterState = { mode: "all" } | { mode: "regular" } | { mode: "exact"; value: string } | { mode: "contains"; value: string };

/**
 * בחירת תבנית רקע אחת (או "בלי תבנית") מבין הרקעים שהועלו בהגדרות — לשימוש
 * בזמן יצירת/עריכת פוסט. כוללת את אותם פילטרי קטגוריה/"סקין" (למשל "מכתב",
 * "טיפ") שיש בגלריית ההגדרות, כדי שקל לראות ולבחור מבין הרבה תבניות —
 * בחירת פילטר היא בפועל גם הדרך לסווג את הפוסט לפי הסקין שלו, כי היא
 * מציגה רק את הרקעים הרלוונטיים לסוג הזה.
 *
 * formatFilter (סוג הפוסט שנבחר — regular/letter/tip) מסנכרן את הפילטר
 * אוטומטית — "כאילו בחרתי גם שם" (לפי בקשה מפורשת): letter/tip מסננים לפי
 * קטגוריה שמכילה "מכתב"/"טיפ" בהתאמה, ו-regular מציג רק קטגוריות שאינן
 * "מכתב" ואינן "טיפ" (הטאב "רגיל"). עדיין אפשר לבחור פילטר אחר ידנית אחרי
 * זה — הבחירה האוטומטית היא רק נקודת פתיחה, לא נעילה.
 */
export default function BackgroundPicker({
  items,
  selected,
  onSelect,
  noneLabel,
  formatFilter,
}: {
  items: BackgroundItem[];
  selected: string | null;
  onSelect: (path: string | null) => void;
  noneLabel: string;
  formatFilter?: "regular" | "letter" | "tip";
}) {
  const [filter, setFilter] = useState<FilterState>({ mode: "all" });

  useEffect(() => {
    Promise.resolve().then(() => {
      if (formatFilter === "letter") setFilter({ mode: "contains", value: LETTER_KEYWORD });
      else if (formatFilter === "tip") setFilter({ mode: "contains", value: TIP_KEYWORD });
      else if (formatFilter === "regular") setFilter({ mode: "regular" });
    });
  }, [formatFilter]);

  const existingCategories = useMemo(
    () => [...new Set(items.map((i) => i.category?.trim()).filter((c): c is string => !!c))].sort(),
    [items]
  );

  const visibleItems = useMemo(() => {
    switch (filter.mode) {
      case "all":
        return items;
      case "regular":
        return items.filter((i) => !matchesKeyword(i.category, LETTER_KEYWORD) && !matchesKeyword(i.category, TIP_KEYWORD));
      case "exact":
        return items.filter((i) => (i.category?.trim() || "") === filter.value);
      case "contains":
        return items.filter((i) => matchesKeyword(i.category, filter.value));
    }
  }, [items, filter]);

  function tabClass(active: boolean): string {
    return `rounded-full px-3 py-1 ${active ? "bg-brand-red text-white" : "bg-brand-pink/10 text-brand-maroon hover:bg-brand-pink/20"}`;
  }

  return (
    <div className="flex flex-col gap-2">
      <div className="flex flex-wrap gap-2 text-xs">
        <button type="button" onClick={() => setFilter({ mode: "all" })} className={tabClass(filter.mode === "all")}>
          הכל
        </button>
        <button type="button" onClick={() => setFilter({ mode: "regular" })} className={tabClass(filter.mode === "regular")}>
          רגיל
        </button>
        {existingCategories.map((cat) => (
          <button
            key={cat}
            type="button"
            onClick={() => setFilter({ mode: "exact", value: cat })}
            className={tabClass((filter.mode === "exact" || filter.mode === "contains") && filter.value === cat)}
          >
            {cat}
          </button>
        ))}
      </div>
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
