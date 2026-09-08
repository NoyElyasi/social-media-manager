"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** פח קטן על כרטיס פוסט ברשימה — מוחק את הפוסט (רשומה + תיקייה) אחרי אישור מפורש. */
export default function DeletePostIconButton({ postId }: { postId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);

  async function handleClick(e: React.MouseEvent) {
    // מונע ניווט לעמוד הפוסט (הכרטיס עצמו הוא לינק) כשלוחצים על הפח.
    e.preventDefault();
    e.stopPropagation();

    const confirmed = window.confirm(
      "למחוק את הפוסט הזה לצמיתות? זה ימחק גם את התיקייה שלו עם כל הקבצים (תמונות/סרטון). לא ניתן לשחזר."
    );
    if (!confirmed) return;

    setDeleting(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, { method: "DELETE" });
      if (res.ok) {
        router.refresh();
      } else {
        const data = await res.json();
        window.alert(data?.error ?? "שגיאה במחיקת הפוסט");
        setDeleting(false);
      }
    } catch {
      window.alert("שגיאה לא צפויה במחיקת הפוסט");
      setDeleting(false);
    }
  }

  return (
    <button
      type="button"
      onClick={handleClick}
      disabled={deleting}
      title="מחקי פוסט"
      className="absolute top-3 left-3 z-10 h-8 w-8 rounded-full bg-white/90 border border-brand-pink/40 text-sm text-red-600 hover:bg-red-50 disabled:opacity-50"
    >
      {deleting ? "…" : "🗑️"}
    </button>
  );
}
