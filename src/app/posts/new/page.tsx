"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { SELECTABLE_TARGETS, ALWAYS_FIRST_HASHTAG, type SelectedTarget } from "@/lib/labels";
import { readNdjsonStream, estimateRemainingSeconds } from "@/lib/ndjsonStream";
import ReelProgress from "@/components/ReelProgress";
import HashtagBadge from "@/components/HashtagBadge";
import BackgroundPicker from "@/components/BackgroundPicker";
import type { BackgroundItem } from "@/components/BackgroundGallery";
import { buildFileUrlFromPath } from "@/lib/files";

const MANUAL_SLIDE_BREAK = "///";
const GLUE_MARKER = "&&";
const DRAFT_STORAGE_KEY = "newPostDraft";

interface DraftShape {
  rawText: string;
  selectedTargets: SelectedTarget[];
  splitMode: "auto" | "manual";
  revealMode: "word" | "letter";
  manualHashtags: string;
  carouselBackgroundPath: string | null;
  reelBackgroundPath: string | null;
  coverBackgroundPath: string | null;
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
  const [carouselBackgroundPath, setCarouselBackgroundPath] = useState<string | null>(
    () => loadDraft().carouselBackgroundPath ?? null
  );
  const [reelBackgroundPath, setReelBackgroundPath] = useState<string | null>(
    () => loadDraft().reelBackgroundPath ?? null
  );
  const [coverBackgroundPath, setCoverBackgroundPath] = useState<string | null>(
    () => loadDraft().coverBackgroundPath ?? null
  );
  const [carouselBackgrounds, setCarouselBackgrounds] = useState<BackgroundItem[]>([]);
  const [reelBackgrounds, setReelBackgrounds] = useState<BackgroundItem[]>([]);
  const [coverBackgrounds, setCoverBackgrounds] = useState<BackgroundItem[]>([]);
  const [facebookProfileUrl, setFacebookProfileUrl] = useState<string | null>(null);
  const [facebookSearchQuery, setFacebookSearchQuery] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ rendered: number; total: number } | null>(null);
  const startedAtRef = useRef<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  // שומר את הטיוטה בכל שינוי — אבל לא דורסים טיוטה קיימת בדיסק במצב ריק
  // (לפני שהוקלד תוכן, או אם ה-state התאפס מסיבה כלשהי): בלי זה, כל דריסה
  // בטעות של ה-localStorage (למשל ניקוי ידני בכלי פיתוח, או תג אחר שנקרא
  // מהדפדפן) הופכת מיד לבלתי-הפיכה, כי ה-effect הזה כותב חזרה על גביה.
  useEffect(() => {
    const isEmptyDraft = !rawText.trim() && !manualHashtags.trim();
    if (isEmptyDraft) return;
    const draft: DraftShape = {
      rawText,
      selectedTargets,
      splitMode,
      revealMode,
      manualHashtags,
      carouselBackgroundPath,
      reelBackgroundPath,
      coverBackgroundPath,
    };
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [
    rawText,
    selectedTargets,
    splitMode,
    revealMode,
    manualHashtags,
    carouselBackgroundPath,
    reelBackgroundPath,
    coverBackgroundPath,
  ]);

  // טוען את רשימת תבניות הרקע שהועלו בהגדרות, לבחירה בזמן יצירת הפוסט.
  useEffect(() => {
    fetch("/api/settings/profile")
      .then((res) => res.json())
      .then((data) => {
        const paths: string[] = data.profile?.carouselBackgroundImagePaths ?? [];
        const reelPaths: string[] = data.profile?.reelBackgroundImagePaths ?? [];
        const coverPaths: string[] = data.profile?.coverBackgroundImagePaths ?? [];
        setCarouselBackgrounds(paths.map((path) => ({ path, url: buildFileUrlFromPath(path) })));
        setReelBackgrounds(reelPaths.map((path) => ({ path, url: buildFileUrlFromPath(path) })));
        setCoverBackgrounds(coverPaths.map((path) => ({ path, url: buildFileUrlFromPath(path) })));
        setFacebookProfileUrl(data.profile?.facebookProfileUrl ?? null);
      })
      .catch(() => {});
  }, []);

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
          carouselBackgroundPath,
          reelBackgroundPath,
          coverBackgroundPath,
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

  const showCarouselOptions = selectedTargets.includes("instagram_carousel");
  const showReelOptions = selectedTargets.includes("instagram_reel");

  function openFacebookProfile() {
    window.open(facebookProfileUrl || "https://www.facebook.com/", "_blank");
  }

  function openFacebookGeneralSearch() {
    const query = facebookSearchQuery.trim();
    if (!query) return;
    const url = `https://www.facebook.com/search/top?q=${encodeURIComponent(query)}`;
    window.open(url, "_blank");
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-brand-maroon">פוסט חדש</h1>

      {/* מצאי טקסט מפוסט ישן בפייסבוק — פייסבוק הסירו את הקישור הישיר לחיפוש
          בתוך פרופיל, אז זה פותח את הפרופיל עצמו; החיפוש בתגית (למשל
          #קוטג) נעשה ידנית משם, באמצעות סימן החיפוש שבתוך הפרופיל. */}
      <div className="flex flex-col gap-2 rounded-lg border border-brand-pink/40 p-3 bg-brand-pink/10">
        <label className="font-medium text-sm">מצאי טקסט מפוסט ישן בפייסבוק</label>
        <div className="flex flex-wrap gap-2">
          <button
            type="button"
            onClick={openFacebookProfile}
            className="self-start rounded-md border border-brand-pink/40 px-3 py-2 text-sm hover:bg-white"
          >
            פתחו את הפרופיל שלי בפייסבוק 🔗
          </button>
          <input
            type="text"
            value={facebookSearchQuery}
            onChange={(e) => setFacebookSearchQuery(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") {
                e.preventDefault();
                openFacebookGeneralSearch();
              }
            }}
            placeholder="תגית לחיפוש, למשל #קוטג'"
            className="rounded-md border border-brand-pink/40 px-3 py-2 text-sm bg-white"
          />
          <button
            type="button"
            onClick={openFacebookGeneralSearch}
            disabled={!facebookSearchQuery.trim()}
            className="self-start rounded-md border border-brand-pink/40 px-3 py-2 text-sm hover:bg-white disabled:opacity-50"
          >
            חיפוש כללי בפייסבוק לפי תגית 🔍
          </button>
        </div>
        <p className="text-xs text-brand-maroon/60">
          משם, לחצי על סימן החיפוש שבתוך הפרופיל וחפשי לפי תגית (למשל #קוטג) — פייסבוק לא מאפשרת יותר קישור ישיר
          לחיפוש בתוך פרופיל. כפתור החיפוש הכללי מחפש בכל פייסבוק (לא רק בפרופיל שלך) את מה שכתוב בתיבה שלמעלה. את
          הטקסט הרלוונטי מעתיקים ומדביקים בתיבה שמתחת.
        </p>
      </div>

      {/* 1. הטקסט עצמו */}
      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm">טקסט הפוסט (גולמי)</label>
        <textarea
          ref={textareaRef}
          value={rawText}
          onChange={(e) => setRawText(e.target.value)}
          rows={8}
          className="rounded-lg border border-brand-pink/40 p-3 text-base bg-white"
          placeholder="כתבו כאן את הפוסט המקורי..."
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm">
          תגיות ידניות (אופציונלי — במקום ההצעה האוטומטית. <HashtagBadge text={ALWAYS_FIRST_HASHTAG} /> תמיד תתווסף
          ראשונה)
        </label>
        <input
          type="text"
          value={manualHashtags}
          onChange={(e) => setManualHashtags(e.target.value)}
          className="rounded-lg border border-brand-pink/40 p-2 text-sm bg-white"
          placeholder={`${ALWAYS_FIRST_HASHTAG} #תגית2 #תגית3`}
        />
      </div>

      {/* 2. בחירת הפלט — קובע אילו קטגוריות אפשרויות יופיעו מכאן ואילך */}
      <div className="flex flex-col gap-2 rounded-lg border border-brand-pink/40 p-3">
        <label className="font-medium text-sm">מה הפלט שאת צריכה?</label>
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

      {/* 3. אפשרויות משותפות לקרוסלה + ריל */}
      {(showCarouselOptions || showReelOptions) && (
        <div className="flex flex-col gap-2 rounded-lg border border-brand-pink/40 p-3 bg-brand-pink/10">
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

      {/* 4. אפשרויות לקרוסלה בלבד */}
      {showCarouselOptions && (carouselBackgrounds.length > 0 || coverBackgrounds.length > 0) && (
        <div className="flex flex-col gap-4 rounded-lg border border-brand-pink/40 p-3">
          <h2 className="font-semibold text-sm border-b pb-2">הגדרות לפוסט הקרוסלה</h2>
          {carouselBackgrounds.length > 0 && (
            <div className="flex flex-col gap-2 bg-brand-pink/10 rounded-lg p-2">
              <label className="font-medium text-sm">רקע לפוסט הקרוסלה</label>
              <BackgroundPicker
                items={carouselBackgrounds}
                selected={carouselBackgroundPath}
                onSelect={setCarouselBackgroundPath}
                noneLabel="ללא (רקע לבן)"
              />
            </div>
          )}
          {coverBackgrounds.length > 0 && (
            <div className="flex flex-col gap-2 bg-brand-pink/10 rounded-lg p-2">
              <label className="font-medium text-sm">עמוד שער (עמוד ראשון עם התיוג הראשי במרכז)</label>
              <BackgroundPicker
                items={coverBackgrounds}
                selected={coverBackgroundPath}
                onSelect={setCoverBackgroundPath}
                noneLabel="ללא עמוד שער"
              />
            </div>
          )}
        </div>
      )}

      {/* 5. אפשרויות לריל בלבד */}
      {showReelOptions && (
        <div className="flex flex-col gap-4 rounded-lg border border-brand-pink/40 p-3">
          <h2 className="font-semibold text-sm border-b pb-2">הגדרות לריל</h2>
          <div className="flex flex-col gap-2 bg-brand-pink/10 rounded-lg p-2">
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
          {reelBackgrounds.length > 0 && (
            <div className="flex flex-col gap-2 bg-brand-pink/10 rounded-lg p-2">
              <label className="font-medium text-sm">רקע לריל</label>
              <BackgroundPicker
                items={reelBackgrounds}
                selected={reelBackgroundPath}
                onSelect={setReelBackgroundPath}
                noneLabel="ללא תבנית (רקע אוטומטי)"
              />
            </div>
          )}
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
        type="submit"
        disabled={submitting}
        className="rounded-lg bg-brand-red px-4 py-2 text-white font-medium hover:bg-brand-red-dark disabled:opacity-50"
      >
        {submitting ? "מכין דראפטים..." : "הכן דראפטים"}
      </button>
    </form>
  );
}
