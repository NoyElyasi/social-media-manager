"use client";

import { useState } from "react";

/** לינק יחיד בתחתית עמוד הפוסט שפותח ב-Finder את תיקיית הפוסט הראשית (לא תת-תיקייה ליעד ספציפי). */
export default function OpenFolderButton({ postId }: { postId: string }) {
  const [error, setError] = useState<string | null>(null);
  const [opening, setOpening] = useState(false);

  async function handleClick() {
    setError(null);
    setOpening(true);
    try {
      const res = await fetch(`/api/posts/${postId}/open-folder`, { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setError(data?.error ?? "שגיאה בפתיחת התיקייה");
      }
    } catch {
      setError("שגיאה בפתיחת התיקייה");
    } finally {
      setOpening(false);
    }
  }

  return (
    <div className="flex flex-col items-start gap-1">
      <button
        type="button"
        onClick={handleClick}
        disabled={opening}
        className="text-sm text-brand-red hover:text-brand-red-dark hover:underline disabled:opacity-50"
      >
        📁 פתחו את תיקיית הפוסט
      </button>
      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
