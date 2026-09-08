"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** מוחקת את הפוסט לצמיתות (רשומה + תיקיית הקבצים) — אחרי אישור מפורש, כי זה בלתי הפיך. */
export default function DeletePostButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);

  async function handleClick() {
    const confirmed = window.confirm(
      "למחוק את הפוסט הזה לצמיתות? זה ימחק גם את התיקייה שלו עם כל הקבצים (תמונות/סרטון). לא ניתן לשחזר."
    );
    if (!confirmed) return;

    setError(null);
    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error ?? "שגיאה במחיקת הפוסט");
      }
      router.push("/");
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
      setDeleting(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={deleting}
        className="text-sm text-red-600 hover:text-red-700 hover:underline disabled:opacity-50"
      >
        {deleting ? "מוחקת..." : "🗑️ מחקו פוסט (לצמיתות, כולל התיקייה)"}
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
