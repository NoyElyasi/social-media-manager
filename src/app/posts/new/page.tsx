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
import NarrationInput, { type CapturedNarration } from "@/components/NarrationInput";

const MANUAL_SLIDE_BREAK = "///";
const GLUE_MARKER = "&&";
const DRAFT_STORAGE_KEY = "newPostDraft";

interface DraftShape {
  rawText: string;
  selectedTargets: SelectedTarget[];
  revealMode: "word" | "letter" | "word-center";
  manualHashtags: string;
  aiTheme: string | null;
  postFormat: "regular" | "letter" | "tip";
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
  // חילוק אוטומטי בלבד — לפי בקשה מפורשת, בלי אפשרות למצב ידני (יש שליטה
  // ידנית עדיין באמצעות סימוני /// ו-&& בתוך הטקסט, ראו insertSplitMarker/insertGlueMarker).
  const splitMode = "auto" as const;
  const [revealMode, setRevealMode] = useState<"word" | "letter" | "word-center">(() => loadDraft().revealMode ?? "word");
  const [manualHashtags, setManualHashtags] = useState(() => loadDraft().manualHashtags ?? "");
  const [aiTheme, setAiTheme] = useState<string | null>(() => loadDraft().aiTheme ?? null);
  const [postFormat, setPostFormat] = useState<"regular" | "letter" | "tip">(() => loadDraft().postFormat ?? "regular");
  const [aiThemeOptions, setAiThemeOptions] = useState<string[]>([]);
  const [carouselBackgroundPath, setCarouselBackgroundPath] = useState<string | null>(
    () => loadDraft().carouselBackgroundPath ?? null
  );
  const [reelBackgroundPath, setReelBackgroundPath] = useState<string | null>(
    () => loadDraft().reelBackgroundPath ?? null
  );
  const [coverBackgroundPath, setCoverBackgroundPath] = useState<string | null>(
    () => loadDraft().coverBackgroundPath ?? null
  );
  // לא נשמר בטיוטה המקומית (base64 של הקלטה יכול להיות כבד) — ומתאפס בכל
  // שינוי טקסט/חילוק דרך ה-key על NarrationInput, כי המילים בטקסט השתנו.
  const [reelNarration, setReelNarration] = useState<CapturedNarration | null>(null);
  const [carouselBackgrounds, setCarouselBackgrounds] = useState<BackgroundItem[]>([]);
  const [reelBackgrounds, setReelBackgrounds] = useState<BackgroundItem[]>([]);
  const [coverBackgrounds, setCoverBackgrounds] = useState<BackgroundItem[]>([]);
  const [facebookProfileUrl, setFacebookProfileUrl] = useState<string | null>(null);
  const [facebookSearchQuery, setFacebookSearchQuery] = useState("");
  // ייבוא מ-Notion — לא נשמר בטיוטה המקומית (notionUrl נשלח בבקשת היצירה עצמה, לא צריך לשרוד רענון עמוד).
  const [notionLoading, setNotionLoading] = useState(false);
  const [notionError, setNotionError] = useState<string | null>(null);
  const [notionSegment, setNotionSegment] = useState<{ pageUrl: string; bodyText: string; typeValues: string[]; tagValues: string[] } | null>(null);
  const [notionUrl, setNotionUrl] = useState<string | null>(null);
  const [notionOldFlag, setNotionOldFlag] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [progress, setProgress] = useState<{ rendered: number; total: number } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(null);
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
      revealMode,
      manualHashtags,
      aiTheme,
      postFormat,
      carouselBackgroundPath,
      reelBackgroundPath,
      coverBackgroundPath,
    };
    window.localStorage.setItem(DRAFT_STORAGE_KEY, JSON.stringify(draft));
  }, [
    rawText,
    selectedTargets,
    revealMode,
    manualHashtags,
    aiTheme,
    postFormat,
    carouselBackgroundPath,
    reelBackgroundPath,
    coverBackgroundPath,
  ]);

  // טוען את רשימת תבניות הרקע שהועלו בהגדרות, לבחירה בזמן יצירת הפוסט.
  useEffect(() => {
    fetch("/api/settings/profile")
      .then((res) => res.json())
      .then((data) => {
        const entries: { path: string; category?: string }[] = data.profile?.carouselBackgroundImagePaths ?? [];
        const reelEntries: { path: string; category?: string }[] = data.profile?.reelBackgroundImagePaths ?? [];
        const coverEntries: { path: string; category?: string }[] = data.profile?.coverBackgroundImagePaths ?? [];
        setCarouselBackgrounds(
          entries.map((e) => ({ path: e.path, url: buildFileUrlFromPath(e.path), category: e.category }))
        );
        setReelBackgrounds(
          reelEntries.map((e) => ({ path: e.path, url: buildFileUrlFromPath(e.path), category: e.category }))
        );
        setCoverBackgrounds(
          coverEntries.map((e) => ({ path: e.path, url: buildFileUrlFromPath(e.path), category: e.category }))
        );
        setFacebookProfileUrl(data.profile?.facebookProfileUrl ?? null);
        setAiThemeOptions(data.profile?.aiThemeOptions ?? []);
      })
      .catch(() => {});
  }, []);

  // תמיכה בקישור עומק מלוח השנה (ScheduleSlotEditorPanel, ?notionTag=...) —
  // מחפש אוטומטית את הקטע המתאים בנושיין בלי להקליד את התגית שוב. לחיצה על
  // "יצירת פוסט מהקטע הזה" היא בקשה מפורשת לקטע *הזה* — לכן זה תמיד דורס
  // תגית ישנה שנשארה בטיוטה מקומית (אחרת קטע ב' תמיד יראה את תוצאת קטע א'
  // הקודם, כי הטיוטה לא מתאפסת בין ביקורים בעמוד בלי שליחה מוצלחת). את
  // הטקסט עצמו (rawText) עדיין לא נוגעים כאן — importNotionSegment שואל
  // אישור בנפרד לפני שמחליף אותו.
  useEffect(() => {
    const tag = new URLSearchParams(window.location.search).get("notionTag");
    if (!tag) return;
    Promise.resolve().then(() => {
      setManualHashtags(tag.startsWith("#") ? tag : `#${tag}`);
      setNotionLoading(true);
    });
    fetch(`/api/notion/lookup?tag=${encodeURIComponent(tag)}`)
      .then((res) => res.json().then((data) => ({ ok: res.ok, data })))
      .then(({ ok, data }) => {
        if (!ok) {
          setNotionError(data.error ?? "החיפוש נכשל");
          return;
        }
        if (!data.segment) {
          setNotionError("לא נמצא קטע מוכן עם התגית הזו ב-Notion");
          return;
        }
        setNotionSegment(data.segment);
      })
      .finally(() => setNotionLoading(false));
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
    setStartedAt(Date.now());
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
          aiTheme,
          aiFormat: postFormat,
          carouselBackgroundPath,
          reelBackgroundPath,
          coverBackgroundPath,
          reelNarration: selectedTargets.includes("instagram_reel") ? reelNarration : null,
          notionUrl,
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
      setStartedAt(null);
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

  function firstManualTag(): string | null {
    return manualHashtags.trim().split(/\s+/)[0] || null;
  }

  async function handleNotionLookup() {
    const tag = firstManualTag();
    if (!tag) return;
    setNotionLoading(true);
    setNotionError(null);
    setNotionSegment(null);
    const res = await fetch(`/api/notion/lookup?tag=${encodeURIComponent(tag)}`);
    const data = await res.json();
    setNotionLoading(false);
    if (!res.ok) {
      setNotionError(data.error ?? "החיפוש נכשל");
      return;
    }
    if (!data.segment) {
      setNotionError("לא נמצא קטע מוכן עם התגית הזו ב-Notion");
      return;
    }
    setNotionSegment(data.segment);
  }

  /**
   * פירוש עמודת "Type" מ-Notion (multi_select — שורה יכולה להכיל כמה מילים
   * בבת אחת, למשל ["פחד","ישן"]): "טיפ"/"מכתב" הם סוג הפוסט (aiFormat), "ישן"
   * מסמן קטע ממוחזר (רק הודעה, בלי פעולה נוספת), וכל מילה אחרת היא בעצם
   * נושא (aiTheme) — ואם היא לא ברשימת הנושאים הקיימת בהגדרות, מוסיפים
   * אותה לשם, כדי שתהיה זמינה לבחירה גם בעתיד.
   */
  async function applyNotionTypeValue(typeValues: string[]) {
    if (typeValues.includes("טיפ")) setPostFormat("tip");
    if (typeValues.includes("מכתב")) setPostFormat("letter");
    if (typeValues.includes("ישן")) setNotionOldFlag(true);

    const theme = typeValues.map((v) => v.trim()).find((v) => v && v !== "טיפ" && v !== "מכתב" && v !== "ישן");
    if (!theme) return;

    setAiTheme(theme);
    if (!aiThemeOptions.includes(theme)) {
      const nextOptions = [...aiThemeOptions, theme];
      setAiThemeOptions(nextOptions);
      await fetch("/api/settings/profile", {
        method: "PUT",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ aiThemeOptions: nextOptions }),
      });
    }
  }

  async function importNotionSegment() {
    if (!notionSegment) return;
    if (rawText.trim() && !window.confirm("יש כבר טקסט בתיבה — להחליף אותו בטקסט מ-Notion?")) return;

    setRawText(notionSegment.bodyText);
    setNotionOldFlag(false);

    const extraTags = notionSegment.tagValues.map((t) => (t.startsWith("#") ? t : `#${t}`));
    if (extraTags.length > 0) {
      const existing = manualHashtags.trim().split(/\s+/).filter(Boolean);
      const merged = [...existing, ...extraTags.filter((t) => !existing.includes(t))];
      setManualHashtags(merged.join(" "));
    }

    await applyNotionTypeValue(notionSegment.typeValues);

    setNotionUrl(notionSegment.pageUrl);
    setNotionSegment(null);
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
        {(showCarouselOptions || showReelOptions) && (
          <div className="flex gap-2 text-xs">
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={insertSplitMarker}
              title="הציבו את הסמן בטקסט במקום לפצל לעמוד/משפט חדש, ואז לחצו כאן"
              className="rounded-md border px-2 py-1 hover:bg-neutral-100"
            >
              + סימון חילוק ({MANUAL_SLIDE_BREAK})
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.preventDefault()}
              onClick={insertGlueMarker}
              title="שני משפטים שחייבים להישאר יחד באותו עמוד/כתובית — הציבו סמן ביניהם ולחצו כאן"
              className="rounded-md border px-2 py-1 hover:bg-neutral-100"
            >
              + סימון הדבקה ({GLUE_MARKER})
            </button>
          </div>
        )}
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

      <div className="flex flex-col gap-2 rounded-lg border border-brand-pink/40 p-3 bg-brand-pink/10">
        <div className="flex items-center justify-between gap-2 flex-wrap">
          <span className="text-sm font-medium">ייבוא קטע מוכן מ-Notion (לפי התגית הראשונה שלמעלה)</span>
          <button
            type="button"
            onClick={handleNotionLookup}
            disabled={notionLoading || !firstManualTag()}
            className="rounded-md border border-brand-pink/40 px-3 py-1.5 text-xs hover:bg-white disabled:opacity-50"
          >
            {notionLoading ? "מחפשת..." : "🔍 חיפוש בנושיין"}
          </button>
        </div>
        {notionError && <p className="text-xs text-red-600">{notionError}</p>}
        {notionSegment && (
          <div className="flex items-center justify-between gap-2 rounded-md bg-white p-2 text-xs">
            <span className="truncate">נמצא קטע: {notionSegment.bodyText.slice(0, 60) || "(ללא טקסט)"}...</span>
            <button
              type="button"
              onClick={importNotionSegment}
              className="shrink-0 rounded-md bg-brand-red px-2 py-1 text-white hover:bg-brand-red-dark"
            >
              ייבוא לטקסט + תגיות
            </button>
          </div>
        )}
        {notionUrl && <p className="text-xs text-green-700">✓ יובא מ-Notion — קישור לעמוד המקור יישמר עם הפוסט</p>}
        {notionOldFlag && <p className="text-xs text-amber-700">⚠️ מסומן כ&quot;ישן&quot; ב-Notion — קטע ממוחזר</p>}
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm">
          נושא הפוסט (אופציונלי — לתיוג ולמעקב בדשבורד. בלי בחירה, מזהים אוטומטית מהטקסט)
        </label>
        <select
          value={aiTheme ?? ""}
          onChange={(e) => setAiTheme(e.target.value || null)}
          className="rounded-lg border border-brand-pink/40 p-2 text-sm bg-white"
        >
          <option value="">לא נבחר (זיהוי אוטומטי)</option>
          {aiThemeOptions.map((theme) => (
            <option key={theme} value={theme}>
              {theme}
            </option>
          ))}
        </select>
      </div>

      <div className="flex flex-col gap-2">
        <label className="font-medium text-sm">סוג הפוסט (אופציונלי)</label>
        <div className="flex gap-2">
          {(
            [
              { value: "regular", label: "רגיל" },
              { value: "letter", label: "✉️ מכתב" },
              { value: "tip", label: "💡 טיפ" },
            ] as const
          ).map((opt) => (
            <button
              key={opt.value}
              type="button"
              onClick={() => setPostFormat(opt.value)}
              className={`rounded-full px-3 py-1.5 text-sm transition-colors ${
                postFormat === opt.value
                  ? "bg-brand-pink/30 text-brand-maroon"
                  : "border border-brand-pink/40 text-brand-maroon/60 hover:bg-brand-pink/10"
              }`}
            >
              {opt.label}
            </button>
          ))}
        </div>
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
                formatFilter={postFormat}
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
                formatFilter={postFormat}
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
              <label className="flex items-center gap-2">
                <input
                  type="radio"
                  name="revealMode"
                  checked={revealMode === "word-center"}
                  onChange={() => setRevealMode("word-center")}
                />
                מילה במרכז (כל מילה מוחקת את הקודמת)
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
                formatFilter={postFormat}
              />
            </div>
          )}
          <NarrationInput key={`${rawText}-${splitMode}`} onCaptured={setReelNarration} />
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
