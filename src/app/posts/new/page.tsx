"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SELECTABLE_TARGETS, ALWAYS_FIRST_HASHTAG, type SelectedTarget } from "@/lib/labels";
import { readNdjsonStream, estimateRemainingSeconds } from "@/lib/ndjsonStream";
import ReelProgress from "@/components/ReelProgress";

const MANUAL_SLIDE_BREAK = "///";
const GLUE_MARKER = "&&";
const DRAFT_STORAGE_KEY = "newPostDraft";

interface DraftShape {
  rawText: string;
  selectedTargets: SelectedTarget[];
  splitMode: "auto" | "manual";
  revealMode: "word" | "letter";
  manualHashtags: string;
}

/** קורא שדה בודד מהטיוטה השמורה מקומית. תמיד מוגן מ-SSR (window לא קיים) ומ-JSON פגום. */
function loadDraft(): Partial<DraftShape> {
  if (typeof window === "undefined") return {};
  try {
    const saved = window.localStorage.getItem(DRAFT_STORAGE_KEY);
    return saved ? (JSON.parse(saved) as Partial<DraftShape>) : {};
  } catch {
    return {};
  }
}

export default function NewPostPage() {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  // כל ה-useState כאן משוחזרים מהטיוטה השמורה מקומית (אם קיימת) כבר ברינדור
  // הראשון — כדי שמעבר לעמוד אחר (למשל הגדרות) ובחזרה לא ימחק את מה שהתחלנו
  // להכין. הפונקציה שמועברת רצה פעם אחת בלבד (לפי React), כך שאין תלות
  // בתזמון effect-ים (שרגיש ל-Strict Mode של React בפיתוח).
  const [rawText, setRawText] = useState(() => loadDraft().rawText ?? "");
  const [selectedTargets, setSelectedTargets] = useState<SelectedTarget[]>(
    () => loadDraft().selectedTargets ?? ["instagram_carousel"]
  );
  const [splitMode, setSplitMode] = useState<"auto" | "manual">(() => loadDraft().splitMode ?? "auto");
  const [revealMode, setRevealMode] = useState<"word" | "letter">(() => loadDraft().revealMode ?? "word");
  const [manualHashtags, setManualHashtags] = useState(() => loadDraft().manualHashtags ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ rendered: number; total: number } | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // שומר את הטיוטה בכל שינוי.
  useEffect(() => {
    const draft: DraftShape = { rawText, selectedTargets, splitMode, revealMode, manualHashtags };
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [rawText, selectedTargets, splitMode, revealMode, manualHashtags]);

  function insertMarkerAt(
    textarea: HTMLTextAreaElement,
    marker: string,
    setValue: (next: string) => void
  ) {
    const { selectionStart, selectionEnd, value, scrollTop } = textarea;
    const next = value.slice(0, selectionStart) + marker + value.slice(selectionEnd);
    setValue(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = selectionStart + marker.length;
      textarea.setSelectionRange(pos, pos);
      textarea.scrollTop = scrollTop;
    });
  }

  function insertSplitMarker() {
    if (textareaRef.current) insertMarkerAt(textareaRef.current, MANUAL_SLIDE_BREAK, setRawText);
  }

  function insertGlueMarker() {
    if (textareaRef.current) insertMarkerAt(textareaRef.current, GLUE_MARKER, setRawText);
  }

  function toggleTarget(target: SelectedTarget) {
    setSelectedTargets((prev) =>
      prev.includes(target) ? prev.filter((t) => t !== target) : [...prev, target]
    );
  }

  function handleCancel() {
    abortControllerRef.current?.abort();
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (!rawText.trim()) {
      setError("יש להזין טקסט לפוסט");
      return;
    }
    if (selectedTargets.length === 0) {
      setError("יש לבחור לפחות יעד אחד");
      return;
    }

    setSubmitting(true);
    setProgress(null);
    startedAtRef.current = Date.now();
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText,
          selectedTargets,
          splitMode,
          revealMode,
          manualHashtags: manualHashtags.trim() ? manualHashtags.trim().split(/\s+/) : null,
        }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error?.formErrors?.[0] ?? "שגיאה בהכנת הפוסט");
      }

      let redirectId: string | null = null;
      await readNdjsonStream(res, (event) => {
        if (event.type === "progress" && event.total) {
          setProgress({ rendered: event.rendered ?? 0, total: event.total });
        } else if (event.type === "done") {
          redirectId = (event.post as { id: string }).id;
        } else if (event.type === "cancelled") {
          setError("היצירה בוטלה");
        } else if (event.type === "error") {
          setError(event.message ?? "שגיאה בהכנת הפוסט");
        }
      });

      if (redirectId) {
        window.localStorage.removeItem(DRAFT_STORAGE_KEY);
        router.push(`/posts/${redirectId}`);
      }
    } catch (err) {
      if (controller.signal.aborted) {
        setError("היצירה בוטלה");
      } else {
        setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
      }
    } finally {
      setSubmitting(false);
      setProgress(null);
      abortControllerRef.current = null;
    }
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">פוסט חדש</h1>

      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm">טקסט הפוסט (גולמי)</label>
        <textarea
          ref={textareaRef}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={8}
          className="rounded-lg border p-3 text-base"
          placeholder="כתבו כאן את הפוסט המקורי..."
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm">
          תגיות ידניות (אופציונלי — במקום ההצעה האוטומטית. {ALWAYS_FIRST_HASHTAG} תמיד תתווסף ראשונה)
        </label>
        <input
          type="text"
          value={manualHashtags}
          onChange={(e) => setManualHashtags(e.target.value)}
          className="rounded-lg border p-2 text-sm"
          placeholder={`${ALWAYS_FIRST_HASHTAG} #תגית2 #תגית3`}
        />
      </div>

      {(selectedTargets.includes("instagram_carousel") || selectedTargets.includes("instagram_reel")) && (
        <div className="flex flex-col gap-2 rounded-lg border p-3 bg-neutral-50">
          <label className="font-medium text-sm">חילוק לעמודים בקרוסלה / למשפטים בריל</label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="splitMode"
                checked={splitMode === "auto"}
                onChange={() => setSplitMode("auto")}
              />
              אוטומטי (לפי כמות טקסט; אפשר גם להוסיף ‎///‎ לחילוק נוסף בנקודה מסוימת)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="splitMode"
                checked={splitMode === "manual"}
                onChange={() => setSplitMode("manual")}
              />
              ידני (רק ‎///‎ קובע איפה מתחיל עמוד/משפט חדש)
            </label>
          </div>
          <div className="flex items-center gap-3">
            <p className="text-xs text-neutral-500">
              הציבו את הסמן בטקסט במקום שבו רוצים לפצל, ולחצו על הכפתור להוספת סימון (
              <code className="bg-neutral-200 px-1 rounded">{MANUAL_SLIDE_BREAK}</code>).
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
          <div className="flex items-center gap-3">
            <p className="text-xs text-neutral-500">
              במצב אוטומטי: אם יש שני משפטים שחייבים להישאר יחד באותו עמוד/כתובית
              (למשל הקדמה ופאנץ׳ליין), הציבו את הסמן ביניהם ולחצו כאן (
              <code className="bg-neutral-200 px-1 rounded">{GLUE_MARKER}</code>) — לא יופרדו בשום מקרה,
              גם אם זה חורג מהאורך הרגיל לעמוד.
            </p>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={insertGlueMarker}
              className="shrink-0 rounded-md border px-2 py-1 text-xs hover:bg-neutral-100"
            >
              + סימון הדבקה
            </button>
          </div>
        </div>
      )}

      {selectedTargets.includes("instagram_reel") && (
        <div className="flex flex-col gap-2 rounded-lg border p-3 bg-neutral-50">
          <label className="font-medium text-sm">אנימציית הופעת הטקסט בריל</label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="revealMode"
                checked={revealMode === "word"}
                onChange={() => setRevealMode("word")}
              />
              מילה-מילה
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="revealMode"
                checked={revealMode === "letter"}
                onChange={() => setRevealMode("letter")}
              />
              אות-אות
            </label>
          </div>
        </div>
      )}

      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm">אילו יעדים רלוונטיים לפוסט הזה?</label>
        <div className="flex flex-col gap-2">
          {SELECTABLE_TARGETS.map((target) => (
            <label key={target.value} className="flex items-center gap-2 text-sm">
              <input
                type="checkbox"
                checked={selectedTargets.includes(target.value)}
                onChange={() => toggleTarget(target.value)}
              />
              {target.label}
            </label>
          ))}
          <label className="flex items-center gap-2 text-sm text-neutral-400">
            <input type="checkbox" disabled />
            וואטסאפ אוטומטי (בקרוב, שלב 2)
          </label>
        </div>
      </div>

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
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {submitting ? "מכין דראפטים..." : "הכן דראפטים"}
      </button>
    </form>
  );
}
