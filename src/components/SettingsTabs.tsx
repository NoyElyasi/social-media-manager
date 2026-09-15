"use client";

import { useState } from "react";

export interface SettingsTab {
  id: string;
  label: string;
  content: React.ReactNode;
}

/**
 * מסדרת את ההגדרות כטאבים ברשימה בצד שמאל (לא הכל בעמוד אחד רצוף) — כדי
 * שקטגוריות לא קשורות (למשל טעינת רקעים והחיבור לאינסטגרם) לא יופיעו
 * ביחד. סדר האלמנטים ב-DOM הפוך בכוונה (תוכן קודם, רשימת הטאבים אחריו) —
 * כדי שברירת המחדל של flex ב-RTL תשים את הרשימה בצד שמאל בפועל.
 */
export default function SettingsTabs({ tabs }: { tabs: SettingsTab[] }) {
  const [activeId, setActiveId] = useState(tabs[0]?.id);
  const active = tabs.find((t) => t.id === activeId) ?? tabs[0];

  return (
    <div className="flex gap-6">
      <div className="flex-1 min-w-0 flex flex-col gap-4">{active?.content}</div>
      <div className="w-44 shrink-0 flex flex-col gap-1">
        {tabs.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveId(tab.id)}
            className={`rounded-lg px-3 py-2 text-right text-sm font-medium transition-colors ${
              tab.id === active?.id
                ? "bg-brand-pink/30 text-brand-maroon"
                : "text-brand-maroon/60 hover:bg-brand-pink/10 hover:text-brand-maroon"
            }`}
          >
            {tab.label}
          </button>
        ))}
      </div>
    </div>
  );
}
