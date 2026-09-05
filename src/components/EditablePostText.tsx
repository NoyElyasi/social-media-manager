"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";

const MANUAL_SLIDE_BREAK = "///";

export default function EditablePostText({
  postId,
  initialRawText,
  hasSplitTarget,
}: {
  postId: string;
  initialRawText: string;
  hasSplitTarget: boolean;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [rawText, setRawText] = useState(initialRawText);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function insertSplitMarker() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value, scrollTop } = textarea;
    const next = value.slice(0, selectionStart) + MANUAL_SLIDE_BREAK + value.slice(selectionEnd);
    setRawText(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = selectionStart + MANUAL_SLIDE_BREAK.length;
      textarea.setSelectionRange(pos, pos);
      textarea.scrollTop = scrollTop;
    });
  }

  async function handleUpdate() {
    setError(null);
    if (!rawText.trim()) {
      setError("יש להזין טקסט לפוסט");
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error?.formErrors?.[0] ?? "שגיאה בעדכון הפוסט");
      }
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2">
      <textarea
        ref={textareaRef}
        value={rawText}
        onChange={(e) => setRawText(e.target.value)}
        rows={6}
        className="rounded-lg border p-3 text-base"
      />
      {hasSplitTarget && (
        <div className="flex items-center gap-3">
          <p className="text-xs text-neutral-500">
            סימון חילוק לעמוד (קרוסלה) / משפט (ריל) חדש:{" "}
            <code className="bg-neutral-200 px-1 rounded">{MANUAL_SLIDE_BREAK}</code>
          </p>
          <button
            type="button"
            onMouseDown={(e) => e.preventDefault()}
            onClick={insertSplitMarker}
            className="shrink-0 rounded-md border px-2 py-1 text-xs hover:bg-neutral-100"
          >
            + סימון חילוק
          </button>
        </div>
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <button
        type="button"
        onClick={handleUpdate}
        disabled={saving}
        className="self-start rounded-lg bg-blue-600 px-4 py-2 text-white text-sm font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "מעדכן ומייצר תמונות..." : "שמור טקסט"}
      </button>
    </div>
  );
}
