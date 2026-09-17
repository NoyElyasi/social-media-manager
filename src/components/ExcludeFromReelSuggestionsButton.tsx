"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/**
 * מסמנת קרוסלה כ"לא רוצה בהמלצות לרילים הבאים" (ראו dashboard/page.tsx) —
 * לא מוחקת שום דבר, רק מוציאה אותה מהחישוב הבא, כדי לפנות מקום להמלצות
 * אחרות במקום שהיא תמשיך לתקוע את הרשימה.
 */
export default function ExcludeFromReelSuggestionsButton({ mediaId }: { mediaId: string }) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    e.preventDefault();
    e.stopPropagation();
    setSaving(true);
    await fetch(`/api/settings/meta/media/${mediaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ excludedFromReelSuggestions: true }),
    });
    router.refresh();
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={saving}
      title="לא רוצה בהמלצות — הסתירי את הפוסט הזה מכאן"
      className="absolute top-1 left-1 flex h-5 w-5 items-center justify-center rounded-full bg-white/90 text-[11px] text-brand-maroon/60 hover:bg-white hover:text-brand-red disabled:opacity-50"
    >
      ✕
    </button>
  );
}
