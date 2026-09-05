"use client";

import { useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readNdjsonStream, estimateRemainingSeconds } from "@/lib/ndjsonStream";
import ReelProgress from "@/components/ReelProgress";

const MANUAL_SLIDE_BREAK = "///";
const GLUE_MARKER = "&&";

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
  const [progress, setProgress] = useState<{ rendered: number; total: number } | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  function insertMarker(marker: string) {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value, scrollTop } = textarea;
    const next = value.slice(0, selectionStart) + marker + value.slice(selectionEnd);
    setRawText(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = selectionStart + marker.length;
      textarea.setSelectionRange(pos, pos);
      textarea.scrollTop = scrollTop;
    });
  }

  function handleCancel() {
    abortControllerRef.current?.abort();
  }

  async function handleUpdate() {
    setError(null);
    if (!rawText.trim()) {
      setError("יש להזין טקסט לפוסט");
      return;
    }
    setSaving(true);
    setProgress(null);
    startedAtRef.current = Date.now();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ rawText }),
        signal: controller.signal,
      });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error?.formErrors?.[0] ?? "שגיאה בעדכון הפוסט");
      }

      let succeeded = false;
      await readNdjsonStream(res, (event) => {
        if (event.type === "progress" && event.total) {
          setProgress({ rendered: event.rendered ?? 0, total: event.total });
        } else if (event.type === "done") {
          succeeded = true;
        } else if (event.type === "cancelled") {
          setError("העדכון בוטל");
        } else if (event.type === "error") {
          setError(event.message ?? "שגיאה בעדכון הפוסט");
        }
      });

      if (succeeded) router.refresh();
    } catch (err) {
      if (controller.signal.aborted) {
        setError("העדכון בוטל");
      } else {
        setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
      }
    } finally {
      setSaving(false);
      setProgress(null);
      abortControllerRef.current = null;
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
        <div className="flex flex-col gap-2">
          <div className="flex items-center gap-3">
            <p className="text-xs text-neutral-500">
              סימון חילוק לעמוד (קרוסלה) / משפט (ריל) חדש:{" "}
              <code className="bg-neutral-200 px-1 rounded">{MANUAL_SLIDE_BREAK}</code>
            </p>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertMarker(MANUAL_SLIDE_BREAK)}
              className="shrink-0 rounded-md border px-2 py-1 text-xs hover:bg-neutral-100"
            >
              + סימון חילוק
            </button>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-neutral-500">
              במצב אוטומטי: שני משפטים שחייבים להישאר יחד (לא להיפרד) —{" "}
              <code className="bg-neutral-200 px-1 rounded">{GLUE_MARKER}</code> ביניהם
            </p>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => insertMarker(GLUE_MARKER)}
              className="shrink-0 rounded-md border px-2 py-1 text-xs hover:bg-neutral-100"
            >
              + סימון הדבקה
            </button>
          </div>
        </div>
      )}
      {progress && startedAtRef.current && (
        <ReelProgress
          rendered={progress.rendered}
          total={progress.total}
          etaSeconds={estimateRemainingSeconds(progress.rendered, progress.total, startedAtRef.current)}
          onCancel={handleCancel}
        />
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
