"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SELECTABLE_TARGETS, ALWAYS_FIRST_HASHTAG, type SelectedTarget } from "@/lib/labels";

const MANUAL_SLIDE_BREAK = "///";
const DRAFT_STORAGE_KEY = "newPostDraft";

interface DraftShape {
  rawText: string;
  selectedTargets: SelectedTarget[];
  carouselSplitMode: "auto" | "manual";
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
  const [carouselSplitMode, setCarouselSplitMode] = useState<"auto" | "manual">(
    () => loadDraft().carouselSplitMode ?? "auto"
  );
  const [manualHashtags, setManualHashtags] = useState(() => loadDraft().manualHashtags ?? "");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // שומר את הטיוטה בכל שינוי.
  useEffect(() => {
    const draft: DraftShape = { rawText, selectedTargets, carouselSplitMode, manualHashtags };
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [rawText, selectedTargets, carouselSplitMode, manualHashtags]);

  function insertSplitMarker() {
    const textarea = textareaRef.current;
    if (!textarea) return;
    const { selectionStart, selectionEnd, value, scrollTop } = textarea;
    const insertion = `${MANUAL_SLIDE_BREAK}`;
    const next = value.slice(0, selectionStart) + insertion + value.slice(selectionEnd);
    setRawText(next);
    requestAnimationFrame(() => {
      textarea.focus();
      const pos = selectionStart + insertion.length;
      textarea.setSelectionRange(pos, pos);
      textarea.scrollTop = scrollTop;
    });
  }

  function toggleTarget(target: SelectedTarget) {
    setSelectedTargets((prev) =>
      prev.includes(target) ? prev.filter((t) => t !== target) : [...prev, target]
    );
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
    try {
      const res = await fetch("/api/posts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText,
          selectedTargets,
          carouselSplitMode,
          manualHashtags: manualHashtags.trim() ? manualHashtags.trim().split(/\s+/) : null,
        }),
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error?.formErrors?.[0] ?? "שגיאה בהכנת הפוסט");
      }

      const { post } = await res.json();
      window.localStorage.removeItem(DRAFT_STORAGE_KEY);
      router.push(`/posts/${post.id}`);
    } catch (err) {
      setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
    } finally {
      setSubmitting(false);
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

      {selectedTargets.includes("instagram_carousel") && (
        <div className="flex flex-col gap-2 rounded-lg border p-3 bg-neutral-50">
          <label className="font-medium text-sm">חילוק לעמודים בקרוסלה</label>
          <div className="flex gap-4 text-sm">
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="splitMode"
                checked={carouselSplitMode === "auto"}
                onChange={() => setCarouselSplitMode("auto")}
              />
              אוטומטי (לפי כמות טקסט לעמוד)
            </label>
            <label className="flex items-center gap-2">
              <input
                type="radio"
                name="splitMode"
                checked={carouselSplitMode === "manual"}
                onChange={() => setCarouselSplitMode("manual")}
              />
              ידני (אני בוחרת איפה מתחיל עמוד חדש)
            </label>
          </div>
          {carouselSplitMode === "manual" && (
            <div className="flex items-center gap-3">
              <p className="text-xs text-neutral-500">
                הציבו את הסמן בטקסט במקום שבו יתחיל עמוד חדש, ולחצו על הכפתור להוספת סימון (
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
          )}
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
