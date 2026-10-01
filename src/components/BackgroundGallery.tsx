"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { buildFileUrlFromPath } from "@/lib/files";

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export interface BackgroundItem {
  path: string;
  url: string;
  /** "סקין"/קטגוריה חופשית (למשל "אחת ביום", "מכתב ביום", "טיפ ביום") — "" = בלי קטגוריה. */
  category?: string;
  /** מיקום טקסט מותאם לתבנית הזו (קרוסלה בלבד) — ראו setBackgroundTextPosition. null/undefined = ברירת המחדל. */
  textTopOffset?: number | null;
  textRightInset?: number | null;
  /** גודל טקסט באחוזים (100 = כרגיל) — ריל בלבד. */
  textFontPercent?: number | null;
  /** מרחק התגית מהטקסט — קרוסלה: פוסט קצר; ריל: ריל רגיל (ריל קצר: hashtagGapShort). */
  hashtagGap?: number | null;
  hashtagGapShort?: number | null;
  /** בר התקדמות/מספור עמודים בהירים (קרוסלה) וטקסט בהיר (קרוסלה/ריל) — לתבניות עם מסגרת/רקע כהים. */
  lightBar?: boolean;
  lightText?: boolean;
}

// ערכי ברירת המחדל של הרינדור — מוצגים בשדות כשלא הוגדר כלום, כדי שיהיה ברור כמה להוסיף/להחסיר.
const TEXT_DEFAULTS = {
  reel: { top: 700, right: 70, font: 100, gap: 36, gapShort: 150 },
  carousel: { top: 340, right: 100, font: 100, gap: 35, gapShort: 35 },
  cover: { top: 0, right: 0, font: 100, gap: 0, gapShort: 0 },
} as const;

const UNCATEGORIZED_LABEL = "כללי";

/**
 * גלריית תבניות רקע לבחירה (ריל/קרוסלה/שער) — העלאה מוסיפה מיידית, מחיקה
 * מסירה מיידית (בלי קשר לטופס ההגדרות הכללי), כדי שאפשר לבנות אוסף לאורך
 * זמן בלי כפתור "שמור" נפרד. אותו קומפוננט משמש לשלושת הסוגים.
 * קטגוריה ("סקין") היא תג חופשי שנוצר תוך כדי העלאה — לא רשימה סגורה
 * שמנוהלת בנפרד, לפי בקשה מפורשת "ליצור קטגוריות כל פעם שיש קטגוריה חדשה".
 */
type PostFormatKey = "regular" | "tip" | "letter" | "short";
const FORMAT_ORDER: PostFormatKey[] = ["regular", "tip", "letter", "short"];
const FORMAT_LABELS: Record<PostFormatKey, string> = { regular: "רגיל", tip: "טיפ", letter: "מכתב", short: "קצר" };
const FORMAT_ABBR: Record<PostFormatKey, string> = { regular: "ר", tip: "ט", letter: "מ", short: "ק" };

export default function BackgroundGallery({
  kind,
  title,
  hint,
  initial,
  initialDefaultPaths,
}: {
  kind: "reel" | "carousel" | "cover";
  title: string;
  hint: string;
  initial: BackgroundItem[];
  /** מפת ברירת המחדל לכל פורמט (רגיל/טיפ/מכתב) לסוג הזה — ראו setDefaultBackgroundPathForFormat. */
  initialDefaultPaths?: Partial<Record<PostFormatKey, string>>;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [defaultPaths, setDefaultPaths] = useState(initialDefaultPaths ?? {});
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadCategory, setUploadCategory] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [settingsPath, setSettingsPath] = useState<string | null>(null);
  const [posTop, setPosTop] = useState("");
  const [posRight, setPosRight] = useState("");
  const [posFont, setPosFont] = useState("");
  const [posGap, setPosGap] = useState("");
  const [posGapShort, setPosGapShort] = useState("");
  const [error, setError] = useState<string | null>(null);

  const existingCategories = useMemo(
    () => [...new Set(items.map((i) => i.category?.trim()).filter((c): c is string => !!c))].sort(),
    [items]
  );
  const visibleItems = activeFilter === null ? items : items.filter((i) => (i.category?.trim() || "") === activeFilter);

  async function toggleLight(item: BackgroundItem, field: "lightBar" | "lightText") {
    setError(null);
    const value = !item[field];
    const res = await fetch("/api/settings/backgrounds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, path: item.path, [field]: value }),
    });
    if (!res.ok) {
      setError("שגיאה בסימון התבנית — נסו שוב");
      return;
    }
    setItems((prev) => prev.map((i) => (i.path === item.path ? { ...i, [field]: value } : i)));
    router.refresh();
  }

  /** כל הפורמטים שהתבנית הזו מסומנת כברירת מחדל שלהם כרגע — יכולה להיות כמה בבת אחת (למשל גם טיפ וגם מכתב). */
  function currentDefaultFormats(item: BackgroundItem): PostFormatKey[] {
    return FORMAT_ORDER.filter((f) => defaultPaths[f] === item.path);
  }

  /**
   * מסמנת/מבטלת סימון תבנית כברירת מחדל לפורמט ספציפי — בלי לגעת בפורמטים
   * אחרים שהתבנית הזו כן מסומנת בשבילם (אפשר גם טיפ וגם מכתב על אותה תבנית
   * בבת אחת, לפי בקשה מפורשת — לא מחזור בלעדי אחד-לכל-תבנית). עדיין יחיד
   * לכל פורמט בפני עצמו: לסמן תבנית אחרת לפורמט הזה דורס את הקודמת עבורו.
   */
  async function toggleDefaultForFormat(item: BackgroundItem, format: PostFormatKey) {
    setError(null);
    const isDefault = defaultPaths[format] !== item.path;
    const res = await fetch("/api/settings/backgrounds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, path: item.path, defaultFormat: format, isDefault }),
    });
    if (!res.ok) {
      setError("שגיאה בסימון ברירת המחדל — נסו שוב");
      return;
    }
    const data = await res.json();
    setDefaultPaths(data.defaultPaths ?? {});
    router.refresh();
  }

  async function saveCategory(item: BackgroundItem, category: string) {
    setError(null);
    const trimmed = category.trim();
    if (trimmed === (item.category?.trim() || "")) return;
    const res = await fetch("/api/settings/backgrounds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, path: item.path, category: trimmed }),
    });
    if (!res.ok) {
      setError("שגיאה בעדכון הקטגוריה — נסו שוב");
      return;
    }
    setItems((prev) => prev.map((i) => (i.path === item.path ? { ...i, category: trimmed } : i)));
    router.refresh();
  }

  function openSettings(item: BackgroundItem) {
    const d = TEXT_DEFAULTS[kind];
    setError(null);
    setSettingsPath(item.path);
    setPosTop(String(item.textTopOffset ?? d.top));
    setPosRight(String(item.textRightInset ?? d.right));
    setPosFont(String(item.textFontPercent ?? d.font));
    setPosGap(String(item.hashtagGap ?? d.gap));
    setPosGapShort(String(item.hashtagGapShort ?? d.gapShort));
  }

  async function saveTextStyle(item: BackgroundItem) {
    setError(null);
    const d = TEXT_DEFAULTS[kind];
    // ערך זהה לברירת המחדל נשמר כ"לא הוגדר" (null), כך ששינוי עתידי בברירות המחדל ימשיך לחול על התבנית.
    const toStored = (v: string, def: number) => {
      if (v.trim() === "") return null;
      const n = Number(v);
      if (Number.isNaN(n)) return NaN;
      return n === def ? null : n;
    };
    const parsedTop = toStored(posTop, d.top);
    const parsedRight = toStored(posRight, d.right);
    const parsedFont = toStored(posFont, d.font);
    const parsedGap = toStored(posGap, d.gap);
    const parsedGapShort = toStored(posGapShort, d.gapShort);
    if ([parsedTop, parsedRight, parsedFont, parsedGap, parsedGapShort].some((n) => n !== null && Number.isNaN(n))) {
      setError("יש להזין מספרים בלבד");
      return;
    }
    const extra = {
      ...(kind === "reel" ? { textFontPercent: parsedFont, hashtagGapShort: parsedGapShort } : {}),
      hashtagGap: parsedGap,
    };
    const res = await fetch("/api/settings/backgrounds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, path: item.path, textTopOffset: parsedTop, textRightInset: parsedRight, ...extra }),
    });
    if (!res.ok) {
      setError("שגיאה בשמירת מיקום/גודל הטקסט — נסו שוב");
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.path === item.path ? { ...i, textTopOffset: parsedTop, textRightInset: parsedRight, ...extra } : i))
    );
    router.refresh();
  }

  async function uploadOne(file: File): Promise<void> {
    const ext = file.name.split(".").pop()?.toLowerCase();
    if (ext !== "png" && ext !== "jpg" && ext !== "jpeg") {
      setError(`${file.name}: פורמט לא נתמך — רק PNG/JPG`);
      return;
    }
    const buffer = await file.arrayBuffer();
    const imageBase64 = arrayBufferToBase64(buffer);
    const res = await fetch("/api/settings/backgrounds", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, imageBase64, ext, category: uploadCategory.trim() }),
    });
    if (!res.ok) {
      setError(`שגיאה בהעלאת ${file.name} — נסו שוב`);
      return;
    }
    const { entries } = await res.json();
    const latest = entries[entries.length - 1];
    setItems((prev) => [...prev, { path: latest.path, url: buildFileUrlFromPath(latest.path), category: latest.category }]);
  }

  /** מעלה כמה קבצים ברצף — לפי בקשה מפורשת "לא רוצה להוסיף רקע-רקע", כדי לא להצטרך לבחור קובץ בכל פעם מחדש. */
  async function handleUploadMany(files: File[]) {
    setError(null);
    setUploadProgress({ done: 0, total: files.length });
    try {
      for (let i = 0; i < files.length; i++) {
        await uploadOne(files[i]);
        setUploadProgress({ done: i + 1, total: files.length });
      }
      router.refresh();
    } finally {
      setUploadProgress(null);
    }
  }

  async function handleDelete(item: BackgroundItem) {
    setError(null);
    const res = await fetch("/api/settings/backgrounds", {
      method: "DELETE",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, path: item.path }),
    });
    if (!res.ok) {
      setError("שגיאה בהסרת הרקע — נסו שוב");
      return;
    }
    setItems((prev) => prev.filter((i) => i.path !== item.path));
    setDefaultPaths((prev) => Object.fromEntries(Object.entries(prev).filter(([, p]) => p !== item.path)));
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">{title}</label>
      <p className="text-xs text-neutral-500">{hint}</p>

      {items.length > 0 && (
        <div className="flex flex-wrap gap-2 text-xs">
          <button
            type="button"
            onClick={() => setActiveFilter(null)}
            className={`rounded-full px-3 py-1 ${
              activeFilter === null ? "bg-brand-red text-white" : "bg-brand-pink/10 text-brand-maroon hover:bg-brand-pink/20"
            }`}
          >
            הכל
          </button>
          {existingCategories.map((cat) => (
            <button
              key={cat}
              type="button"
              onClick={() => setActiveFilter(cat)}
              className={`rounded-full px-3 py-1 ${
                activeFilter === cat ? "bg-brand-red text-white" : "bg-brand-pink/10 text-brand-maroon hover:bg-brand-pink/20"
              }`}
            >
              {cat}
            </button>
          ))}
        </div>
      )}

      <div className="flex flex-wrap gap-3">
        {visibleItems.map((item) => {
          const defaultFormats = currentDefaultFormats(item);
          const hasTextStyle =
            item.textTopOffset != null ||
            item.textRightInset != null ||
            item.textFontPercent != null ||
            item.hashtagGap != null ||
            item.hashtagGapShort != null;
          return (
            <div key={item.path} className="flex w-24 flex-col items-center gap-1">
              <button
                type="button"
                onClick={() => openSettings(item)}
                title="לחצי להגדרות התבנית"
                className="relative h-32 w-24 overflow-hidden rounded-md border border-brand-pink/40 hover:ring-2 hover:ring-brand-pink"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={item.url} alt="" className="h-full w-full object-cover" />
                <span className="absolute inset-x-0 bottom-0 flex flex-wrap justify-center gap-0.5 bg-white/80 px-0.5 py-0.5 text-[10px]">
                  {(item.lightBar || item.lightText) && <span title="צבעים בהירים (בר/טקסט)">🌙</span>}
                  {defaultFormats.length > 0 && (
                    <span title="ברירת מחדל">⭐{defaultFormats.map((f) => FORMAT_ABBR[f]).join("")}</span>
                  )}
                  {hasTextStyle && <span title="מיקום/גודל טקסט מותאם">↕</span>}
                </span>
              </button>
              <span className="max-w-full truncate text-[11px] text-brand-maroon/60">
                {item.category?.trim() || UNCATEGORIZED_LABEL}
              </span>
            </div>
          );
        })}
      </div>

      {settingsPath !== null &&
        (() => {
          const item = items.find((i) => i.path === settingsPath);
          if (!item) return null;
          const inputClass = "w-20 rounded border border-brand-pink/40 px-1.5 py-1 text-center text-sm";
          return (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4"
              onClick={() => setSettingsPath(null)}
            >
              <div
                className="flex max-h-[90vh] w-full max-w-md flex-col gap-4 overflow-y-auto rounded-xl bg-white p-5 shadow-xl"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-start gap-3">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={item.url} alt="" className="h-28 w-20 rounded-md border border-brand-pink/40 object-cover" />
                  <div className="flex flex-1 flex-col gap-1">
                    <label className="text-xs font-medium">קטגוריה / סקין</label>
                    <input
                      type="text"
                      key={item.path}
                      defaultValue={item.category ?? ""}
                      onBlur={(e) => saveCategory(item, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                      }}
                      placeholder="למשל: מכתב, טיפ, קצר"
                      list={`bg-categories-${kind}`}
                      className="rounded-md border border-brand-pink/40 px-2 py-1 text-sm"
                    />
                    {kind === "carousel" && (
                      <label className="mt-1 flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!item.lightBar} onChange={() => toggleLight(item, "lightBar")} />
                        בר ההתקדמות בהיר
                      </label>
                    )}
                    {kind !== "cover" && (
                      <label className="flex items-center gap-2 text-sm">
                        <input type="checkbox" checked={!!item.lightText} onChange={() => toggleLight(item, "lightText")} />
                        הטקסט בהיר
                      </label>
                    )}
                    <p className="text-[11px] text-neutral-500">
                      סמני כשהרקע כהה: בר ההתקדמות ומספור העמודים (קרוסלה) והטקסט והתגית נצבעים בהיר.
                    </p>
                  </div>
                </div>

                <div className="flex flex-col gap-1.5 rounded-lg bg-brand-pink/10 p-3">
                  <span className="text-xs font-medium">רקע ברירת מחדל עבור (אפשר כמה)</span>
                  <div className="flex flex-wrap gap-x-4 gap-y-1">
                    {FORMAT_ORDER.map((format) => (
                      <label key={format} className="flex items-center gap-1.5 text-sm">
                        <input
                          type="checkbox"
                          checked={defaultPaths[format] === item.path}
                          onChange={() => toggleDefaultForFormat(item, format)}
                        />
                        {FORMAT_LABELS[format]}
                      </label>
                    ))}
                  </div>
                </div>

                {kind !== "cover" && (
                  <div className="flex flex-col gap-2 rounded-lg bg-brand-pink/10 p-3">
                    <span className="text-xs font-medium">מיקום וגודל הטקסט (בשדות מופיעה ברירת המחדל — שני אותה כדי להוסיף/להחסיר)</span>
                    <div className="flex flex-wrap gap-4">
                      <label className="flex flex-col items-center gap-1 text-[11px] text-brand-maroon/70">
                        גובה (מלמעלה)
                        <input type="number" value={posTop} onChange={(e) => setPosTop(e.target.value)} className={inputClass} />
                      </label>
                      <label className="flex flex-col items-center gap-1 text-[11px] text-brand-maroon/70">
                        מרחק מהימין
                        <input type="number" value={posRight} onChange={(e) => setPosRight(e.target.value)} className={inputClass} />
                      </label>
                      {kind === "reel" && (
                        <label className="flex flex-col items-center gap-1 text-[11px] text-brand-maroon/70">
                          גודל טקסט (%)
                          <input type="number" value={posFont} onChange={(e) => setPosFont(e.target.value)} className={inputClass} />
                        </label>
                      )}
                      <label className="flex flex-col items-center gap-1 text-[11px] text-brand-maroon/70">
                        {kind === "reel" ? "תגית מעל הטקסט (רגיל)" : "תגית מהטקסט (קצר)"}
                        <input type="number" value={posGap} onChange={(e) => setPosGap(e.target.value)} className={inputClass} />
                      </label>
                      {kind === "reel" && (
                        <label className="flex flex-col items-center gap-1 text-[11px] text-brand-maroon/70">
                          תגית מעל הטקסט (קצר)
                          <input type="number" value={posGapShort} onChange={(e) => setPosGapShort(e.target.value)} className={inputClass} />
                        </label>
                      )}
                    </div>
                    <button
                      type="button"
                      onClick={() => saveTextStyle(item)}
                      className="self-start rounded-full bg-brand-red px-4 py-1 text-sm text-white"
                    >
                      שמירה
                    </button>
                  </div>
                )}

                {error && <p className="text-xs text-red-600">{error}</p>}

                <div className="flex items-center justify-between border-t border-brand-pink/30 pt-3">
                  <button
                    type="button"
                    onClick={async () => {
                      await handleDelete(item);
                      setSettingsPath(null);
                    }}
                    className="rounded-full border border-red-300 px-3 py-1 text-sm text-red-600 hover:bg-red-50"
                  >
                    🗑️ הסרת התבנית
                  </button>
                  <button
                    type="button"
                    onClick={() => setSettingsPath(null)}
                    className="rounded-full border border-brand-pink/40 px-4 py-1 text-sm hover:bg-brand-pink/10"
                  >
                    סגירה
                  </button>
                </div>
              </div>
            </div>
          );
        })()}

      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          list={`bg-categories-${kind}`}
          value={uploadCategory}
          onChange={(e) => setUploadCategory(e.target.value)}
          placeholder="קטגוריה/סקין להעלאה (אופציונלי — אפשר גם חדשה)"
          className="rounded-lg border border-brand-pink/40 p-1.5 text-xs bg-white"
        />
        <datalist id={`bg-categories-${kind}`}>
          {existingCategories.map((cat) => (
            <option key={cat} value={cat} />
          ))}
        </datalist>
        <label className="flex h-8 items-center rounded-md border border-dashed border-brand-pink px-3 text-xs text-brand-maroon/70 hover:bg-brand-pink/10 cursor-pointer">
          {uploadProgress ? `מעלה ${uploadProgress.done}/${uploadProgress.total}...` : "+ הוספה (אפשר לבחור כמה)"}
          <input
            type="file"
            accept="image/png,image/jpeg"
            multiple
            className="hidden"
            disabled={!!uploadProgress}
            onChange={(e) => {
              const files = Array.from(e.target.files ?? []);
              if (files.length > 0) void handleUploadMany(files);
              e.target.value = "";
            }}
          />
        </label>
      </div>

      {settingsPath === null && error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
