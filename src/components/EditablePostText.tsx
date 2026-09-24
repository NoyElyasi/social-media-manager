"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readNdjsonStream, estimateRemainingSeconds } from "@/lib/ndjsonStream";
import ReelProgress from "@/components/ReelProgress";
import BackgroundPicker from "@/components/BackgroundPicker";
import type { BackgroundItem } from "@/components/BackgroundGallery";
import { buildFileUrlFromPath } from "@/lib/files";
import NarrationInput, { type CapturedNarration } from "@/components/NarrationInput";

const MANUAL_SLIDE_BREAK = "///";
const GLUE_MARKER = "&&";

export default function EditablePostText({
  postId,
  initialRawText,
  hasSplitTarget,
  hasCarousel,
  hasReel,
  splitMode,
  initialCarouselBackgroundPath,
  initialReelBackgroundPath,
  initialCoverBackgroundPath,
  existingNarrationUrl,
  notionTag,
  notionUrl,
}: {
  postId: string;
  initialRawText: string;
  hasSplitTarget: boolean;
  hasCarousel: boolean;
  hasReel: boolean;
  splitMode: "auto" | "manual";
  initialCarouselBackgroundPath: string | null;
  initialReelBackgroundPath: string | null;
  initialCoverBackgroundPath: string | null;
  existingNarrationUrl: string | null;
  /** התגית/קישור שממנו יובא הטקסט מנושיין, אם ככה — מציגה כפתור "עדכני מהנושיין" (ראו refresh-from-notion). */
  notionTag: string | null;
  notionUrl: string | null;
}) {
  const router = useRouter();
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const [rawText, setRawText] = useState(initialRawText);
  const [saving, setSaving] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ rendered: number; total: number } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  const [showBackgroundEditor, setShowBackgroundEditor] = useState(false);
  const [carouselBackgrounds, setCarouselBackgrounds] = useState<BackgroundItem[]>([]);
  const [reelBackgrounds, setReelBackgrounds] = useState<BackgroundItem[]>([]);
  const [coverBackgrounds, setCoverBackgrounds] = useState<BackgroundItem[]>([]);
  const [carouselBackgroundPath, setCarouselBackgroundPath] = useState<string | null>(initialCarouselBackgroundPath);
  const [reelBackgroundPath, setReelBackgroundPath] = useState<string | null>(initialReelBackgroundPath);
  const [coverBackgroundPath, setCoverBackgroundPath] = useState<string | null>(initialCoverBackgroundPath);
  const [updateCarousel, setUpdateCarousel] = useState(true);
  const [updateReel, setUpdateReel] = useState(true);
  // undefined = לא נגעה בהקלטה בעריכה הזו — משתמשים מחדש בהקלטה הקיימת
  // (אם יש) בצד השרת; null = לחצה "הסירי הקלטה" בכוונה. לפי משוב מפורש
  // שרינדור מחדש (למשל שינוי רקע) לא צריך למחוק הקלטה קיימת בטעות.
  const [reelNarration, setReelNarration] = useState<CapturedNarration | null | undefined>(undefined);

  // מסנכרן את הרקע הנבחר עם מה שבאמת שמור על התוכן — כדי שהוספת יעד חדש
  // (למשל ריל, עם רקע שנבחר בזמן ההוספה) לא תישאר עם ערך ישן מהעלייה
  // הראשונה של הקומפוננטה (שהיה null לפני שהיעד הזה בכלל התווסף לפוסט).
  useEffect(() => {
    Promise.resolve().then(() => setCarouselBackgroundPath(initialCarouselBackgroundPath));
  }, [initialCarouselBackgroundPath]);
  useEffect(() => {
    Promise.resolve().then(() => setReelBackgroundPath(initialReelBackgroundPath));
  }, [initialReelBackgroundPath]);
  useEffect(() => {
    Promise.resolve().then(() => setCoverBackgroundPath(initialCoverBackgroundPath));
  }, [initialCoverBackgroundPath]);

  useEffect(() => {
    if (!showBackgroundEditor) return;
    fetch("/api/settings/profile")
      .then((r) => r.json())
      .then((data) => {
        const carouselEntries: { path: string; category?: string }[] = data.profile?.carouselBackgroundImagePaths ?? [];
        const reelEntries: { path: string; category?: string }[] = data.profile?.reelBackgroundImagePaths ?? [];
        const coverEntries: { path: string; category?: string }[] = data.profile?.coverBackgroundImagePaths ?? [];
        setCarouselBackgrounds(
          carouselEntries.map((e) => ({ path: e.path, url: buildFileUrlFromPath(e.path), category: e.category }))
        );
        setReelBackgrounds(
          reelEntries.map((e) => ({ path: e.path, url: buildFileUrlFromPath(e.path), category: e.category }))
        );
        setCoverBackgrounds(
          coverEntries.map((e) => ({ path: e.path, url: buildFileUrlFromPath(e.path), category: e.category }))
        );
      });
  }, [showBackgroundEditor]);

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
    if (hasCarousel && hasReel && !updateCarousel && !updateReel) {
      setError("בחרי לפחות תוכן אחד לעדכן (קרוסלה או ריל)");
      return;
    }
    setSaving(true);
    setProgress(null);
    setStartedAt(Date.now());
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`/api/posts/${postId}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          rawText,
          ...(hasCarousel
            ? {
                carouselBackgroundPath,
                coverBackgroundPath,
                regenerateCarousel: hasReel ? updateCarousel : true,
              }
            : {}),
          ...(hasReel
            ? {
                reelBackgroundPath,
                regenerateReel: hasCarousel ? updateReel : true,
                ...(reelNarration !== undefined ? { reelNarration } : {}),
              }
            : {}),
        }),
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

  /** שולפת מחדש את הטקסט העדכני מנושיין (לפי notionTag) ומרנדרת מחדש, בלחיצה אחת — כמו לחיצה על "שמור טקסט" עם טקסט שנשלף אוטומטית. */
  async function handleRefreshFromNotion() {
    setError(null);
    setRefreshing(true);
    setProgress(null);
    setStartedAt(Date.now());
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch(`/api/posts/${postId}/refresh-from-notion`, { method: "POST", signal: controller.signal });
      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error ?? "שגיאה בעדכון מהנושיין");
      }

      let updatedText: string | null = null;
      await readNdjsonStream(res, (event) => {
        if (event.type === "progress" && event.total) {
          setProgress({ rendered: event.rendered ?? 0, total: event.total });
        } else if (event.type === "done") {
          updatedText = (event.post as { rawText: string }).rawText;
        } else if (event.type === "cancelled") {
          setError("העדכון בוטל");
        } else if (event.type === "error") {
          setError(event.message ?? "שגיאה בעדכון מהנושיין");
        }
      });

      if (updatedText !== null) {
        setRawText(updatedText);
        router.refresh();
      }
    } catch (err) {
      if (controller.signal.aborted) {
        setError("העדכון בוטל");
      } else {
        setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
      }
    } finally {
      setRefreshing(false);
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
        className="rounded-lg border border-brand-pink/40 p-3 text-base bg-white"
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
              className="shrink-0 rounded-md border border-brand-pink/40 px-2 py-1 text-xs hover:bg-brand-pink/10"
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
              className="shrink-0 rounded-md border border-brand-pink/40 px-2 py-1 text-xs hover:bg-brand-pink/10"
            >
              + סימון הדבקה
            </button>
          </div>
        </div>
      )}
      {hasCarousel && hasReel && (
        <div className="flex items-center gap-4 text-xs">
          <span className="text-neutral-500">עדכן ברענון:</span>
          <label className="flex items-center gap-1.5">
            <input
              type="checkbox"
              checked={updateCarousel}
              onChange={(e) => setUpdateCarousel(e.target.checked)}
            />
            קרוסלה
          </label>
          <label className="flex items-center gap-1.5">
            <input type="checkbox" checked={updateReel} onChange={(e) => setUpdateReel(e.target.checked)} />
            ריל
          </label>
        </div>
      )}
      {hasReel && updateReel && (
        <div className="flex flex-col gap-2">
          {existingNarrationUrl && reelNarration === undefined && (
            <div className="flex flex-col gap-2 rounded-lg border border-green-200 bg-green-50 p-2">
              <p className="text-xs text-green-700">
                🎙️ יש הקלטה משויכת לריל הזה — היא תישמר אוטומטית. אפשר להאזין לה, להסיר אותה, או להעלות/להקליט אחת חדשה למטה (זה יחליף אותה).
              </p>
              {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
              <audio src={existingNarrationUrl} controls className="w-full" />
              <button
                type="button"
                onClick={() => setReelNarration(null)}
                className="self-start text-xs text-brand-red hover:underline"
              >
                הסירי הקלטה
              </button>
            </div>
          )}
          <NarrationInput key={`${rawText}-${splitMode}`} onCaptured={setReelNarration} />
        </div>
      )}
      {(hasCarousel || hasReel) && (
        <div className="flex flex-col gap-2">
          <button
            type="button"
            onClick={() => setShowBackgroundEditor((v) => !v)}
            className="self-start text-xs text-brand-red hover:underline"
          >
            {showBackgroundEditor ? "סגרי בחירת רקע/שער" : "החליפי רקע/שער לפני שמירה"}
          </button>
          {showBackgroundEditor && (
            <div className="flex flex-col gap-4 rounded-lg border border-brand-pink/40 bg-brand-pink/10 p-3">
              {hasCarousel && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium">רקע לקרוסלה</label>
                  <BackgroundPicker
                    items={carouselBackgrounds}
                    selected={carouselBackgroundPath}
                    onSelect={setCarouselBackgroundPath}
                    noneLabel="בלי תבנית (לבן)"
                  />
                </div>
              )}
              {hasCarousel && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium">עמוד שער</label>
                  <BackgroundPicker
                    items={coverBackgrounds}
                    selected={coverBackgroundPath}
                    onSelect={setCoverBackgroundPath}
                    noneLabel="בלי עמוד שער"
                  />
                </div>
              )}
              {hasReel && (
                <div className="flex flex-col gap-2">
                  <label className="text-xs font-medium">רקע לריל</label>
                  <BackgroundPicker
                    items={reelBackgrounds}
                    selected={reelBackgroundPath}
                    onSelect={setReelBackgroundPath}
                    noneLabel="בלי תבנית (צבע אוטומטי)"
                  />
                </div>
              )}
              <p className="text-xs text-brand-maroon/60">
                הבחירה כאן תיכנס לתוקף רק בלחיצה על &quot;שמור טקסט&quot; למטה.
              </p>
            </div>
          )}
        </div>
      )}
      {progress && startedAt && (
        <ReelProgress
          rendered={progress.rendered}
          total={progress.total}
          etaSeconds={estimateRemainingSeconds(progress.rendered, progress.total, startedAt)}
          onCancel={handleCancel}
        />
      )}
      {error && <p className="text-sm text-red-600">{error}</p>}
      <div className="flex items-center gap-2">
        <button
          type="button"
          onClick={handleUpdate}
          disabled={saving || refreshing}
          className="self-start rounded-lg bg-brand-red px-4 py-2 text-white text-sm font-medium hover:bg-brand-red-dark disabled:opacity-50"
        >
          {saving ? "מעדכן ומייצר תמונות..." : "שמור טקסט"}
        </button>
        {(notionTag || notionUrl) && (
          <button
            type="button"
            onClick={handleRefreshFromNotion}
            disabled={saving || refreshing}
            title={
              notionTag
                ? `שולפת את הטקסט העדכני מנושיין (תגית ${notionTag.startsWith("#") ? notionTag : `#${notionTag}`}) ומרנדרת מחדש — לפי קישור העמוד, גם אם התגית שונתה בנושיין`
                : "שולפת את הטקסט העדכני מנושיין ומרנדרת מחדש"
            }
            className="self-start rounded-lg border border-brand-pink/40 bg-white px-4 py-2 text-brand-maroon text-sm font-medium hover:bg-brand-pink/10 disabled:opacity-50"
          >
            {refreshing ? "מעדכנת מהנושיין..." : "🔄 עדכני טקסט מהנושיין"}
          </button>
        )}
      </div>
    </div>
  );
}
