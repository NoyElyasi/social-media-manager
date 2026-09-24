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
}

const UNCATEGORIZED_LABEL = "כללי";

/**
 * גלריית תבניות רקע לבחירה (ריל/קרוסלה/שער) — העלאה מוסיפה מיידית, מחיקה
 * מסירה מיידית (בלי קשר לטופס ההגדרות הכללי), כדי שאפשר לבנות אוסף לאורך
 * זמן בלי כפתור "שמור" נפרד. אותו קומפוננט משמש לשלושת הסוגים.
 * קטגוריה ("סקין") היא תג חופשי שנוצר תוך כדי העלאה — לא רשימה סגורה
 * שמנוהלת בנפרד, לפי בקשה מפורשת "ליצור קטגוריות כל פעם שיש קטגוריה חדשה".
 */
type PostFormatKey = "regular" | "tip" | "letter";
const FORMAT_ORDER: PostFormatKey[] = ["regular", "tip", "letter"];
const FORMAT_LABELS: Record<PostFormatKey, string> = { regular: "רגיל", tip: "טיפ", letter: "מכתב" };
const FORMAT_ABBR: Record<PostFormatKey, string> = { regular: "ר", tip: "ט", letter: "מ" };

export default function BackgroundGallery({
  kind,
  title,
  hint,
  initial,
  initialDarkPaths,
  initialDefaultPaths,
}: {
  kind: "reel" | "carousel" | "cover";
  title: string;
  hint: string;
  initial: BackgroundItem[];
  /** רלוונטי רק ל-kind="carousel" — אילו נתיבים מסומנים כתבנית כהה (ראו setCarouselBackgroundDark). */
  initialDarkPaths?: string[];
  /** מפת ברירת המחדל לכל פורמט (רגיל/טיפ/מכתב) לסוג הזה — ראו setDefaultBackgroundPathForFormat. */
  initialDefaultPaths?: Partial<Record<PostFormatKey, string>>;
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [darkPaths, setDarkPaths] = useState(new Set(initialDarkPaths ?? []));
  const [defaultPaths, setDefaultPaths] = useState(initialDefaultPaths ?? {});
  const [defaultPickerPath, setDefaultPickerPath] = useState<string | null>(null);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [uploadCategory, setUploadCategory] = useState("");
  const [activeFilter, setActiveFilter] = useState<string | null>(null);
  const [editingPath, setEditingPath] = useState<string | null>(null);
  const [editingPositionPath, setEditingPositionPath] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const existingCategories = useMemo(
    () => [...new Set(items.map((i) => i.category?.trim()).filter((c): c is string => !!c))].sort(),
    [items]
  );
  const visibleItems = activeFilter === null ? items : items.filter((i) => (i.category?.trim() || "") === activeFilter);

  async function toggleDark(item: BackgroundItem) {
    setError(null);
    const isDark = !darkPaths.has(item.path);
    const res = await fetch("/api/settings/backgrounds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, path: item.path, isDark }),
    });
    if (!res.ok) {
      setError("שגיאה בסימון התבנית — נסו שוב");
      return;
    }
    setDarkPaths((prev) => {
      const next = new Set(prev);
      if (isDark) next.add(item.path);
      else next.delete(item.path);
      return next;
    });
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
    setEditingPath(null);
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

  async function saveTextPosition(item: BackgroundItem, topOffset: string, rightInset: string) {
    setError(null);
    setEditingPositionPath(null);
    const parsedTop = topOffset.trim() === "" ? null : Number(topOffset);
    const parsedRight = rightInset.trim() === "" ? null : Number(rightInset);
    if (
      (parsedTop !== null && Number.isNaN(parsedTop)) ||
      (parsedRight !== null && Number.isNaN(parsedRight))
    ) {
      setError("מיקום טקסט לא תקין — יש להזין מספרים");
      return;
    }
    const res = await fetch("/api/settings/backgrounds", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ kind, path: item.path, textTopOffset: parsedTop, textRightInset: parsedRight }),
    });
    if (!res.ok) {
      setError("שגיאה בעדכון מיקום הטקסט — נסו שוב");
      return;
    }
    setItems((prev) =>
      prev.map((i) => (i.path === item.path ? { ...i, textTopOffset: parsedTop, textRightInset: parsedRight } : i))
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
        {visibleItems.map((item) => (
          <div key={item.path} className="relative flex flex-col items-center gap-1">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt="" className="h-32 w-24 rounded-md object-cover border border-brand-pink/40" />
            <button
              type="button"
              onClick={() => handleDelete(item)}
              title="הסירי מהרשימה"
              className="absolute -top-2 -left-2 h-6 w-6 rounded-full bg-white border border-brand-pink/40 text-xs text-red-600 hover:bg-red-50"
            >
              ✕
            </button>
            <button
              type="button"
              onClick={() => setDefaultPickerPath((p) => (p === item.path ? null : item.path))}
              title="ברירת מחדל — אפשר לבחור כמה פורמטים בבת אחת"
              className={`absolute -top-2 -right-2 h-6 w-6 rounded-full border text-[10px] font-bold flex items-center justify-center ${
                currentDefaultFormats(item).length > 0
                  ? "border-amber-500 bg-amber-100 text-amber-800"
                  : "bg-white border-brand-pink/40 text-brand-maroon/50 hover:bg-brand-pink/10"
              }`}
            >
              {currentDefaultFormats(item).length > 0 ? `⭐${currentDefaultFormats(item).map((f) => FORMAT_ABBR[f]).join("")}` : "☆"}
            </button>
            {defaultPickerPath === item.path && (
              <div className="absolute top-5 -right-2 z-10 flex flex-col gap-1 rounded-md border border-amber-400 bg-white p-1.5 shadow-md">
                {FORMAT_ORDER.map((format) => (
                  <label key={format} className="flex items-center gap-1.5 text-[11px] text-brand-maroon whitespace-nowrap">
                    <input
                      type="checkbox"
                      checked={defaultPaths[format] === item.path}
                      onChange={() => toggleDefaultForFormat(item, format)}
                    />
                    {FORMAT_LABELS[format]}
                  </label>
                ))}
              </div>
            )}
            {editingPath === item.path ? (
              <input
                type="text"
                autoFocus
                defaultValue={item.category ?? ""}
                onBlur={(e) => saveCategory(item, e.target.value)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                  if (e.key === "Escape") setEditingPath(null);
                }}
                placeholder="קטגוריה/סקין..."
                className="w-24 rounded-full border border-brand-pink/40 px-2 py-0.5 text-[11px] text-center"
              />
            ) : (
              <button
                type="button"
                onClick={() => setEditingPath(item.path)}
                title="לחצי לשנות קטגוריה/סקין"
                className="rounded-full border border-brand-pink/40 bg-white px-2 py-0.5 text-[11px] text-brand-maroon/60 hover:bg-brand-pink/10"
              >
                {item.category?.trim() || UNCATEGORIZED_LABEL}
              </button>
            )}
            {kind === "carousel" && (
              <button
                type="button"
                onClick={() => toggleDark(item)}
                title="תבנית כהה — פס ההתקדמות/מספור העמודים יוצג בגוונים בהירים כדי שלא יבלע ברקע"
                className={`rounded-full px-2 py-0.5 text-[11px] border ${
                  darkPaths.has(item.path)
                    ? "border-brand-maroon bg-brand-maroon text-white"
                    : "border-brand-pink/40 bg-white text-brand-maroon/60 hover:bg-brand-pink/10"
                }`}
              >
                🌙 תבנית כהה
              </button>
            )}
            {kind === "carousel" &&
              (editingPositionPath === item.path ? (
                <div className="flex flex-col items-center gap-1 rounded-md border border-brand-pink/40 bg-white p-1.5">
                  <label className="flex items-center gap-1 text-[10px] text-brand-maroon/70">
                    גובה
                    <input
                      type="number"
                      autoFocus
                      defaultValue={item.textTopOffset ?? ""}
                      placeholder="ברירת מחדל"
                      className="w-16 rounded border border-brand-pink/40 px-1 py-0.5 text-[11px] text-center"
                      id={`top-${item.path}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setEditingPositionPath(null);
                      }}
                    />
                  </label>
                  <label className="flex items-center gap-1 text-[10px] text-brand-maroon/70">
                    מהימין
                    <input
                      type="number"
                      defaultValue={item.textRightInset ?? ""}
                      placeholder="ברירת מחדל"
                      className="w-16 rounded border border-brand-pink/40 px-1 py-0.5 text-[11px] text-center"
                      id={`right-${item.path}`}
                      onKeyDown={(e) => {
                        if (e.key === "Enter") (e.target as HTMLInputElement).blur();
                        if (e.key === "Escape") setEditingPositionPath(null);
                      }}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => {
                      const top = (document.getElementById(`top-${item.path}`) as HTMLInputElement).value;
                      const right = (document.getElementById(`right-${item.path}`) as HTMLInputElement).value;
                      void saveTextPosition(item, top, right);
                    }}
                    className="rounded-full bg-brand-red px-2 py-0.5 text-[10px] text-white"
                  >
                    שמירה
                  </button>
                </div>
              ) : (
                <button
                  type="button"
                  onClick={() => setEditingPositionPath(item.path)}
                  title="לחצי לכוונן היכן הטקסט מתחיל בתבנית הזו — שימושי כשהטקסט מתנגש בעיטור של הרקע"
                  className="rounded-full border border-brand-pink/40 bg-white px-2 py-0.5 text-[11px] text-brand-maroon/60 hover:bg-brand-pink/10"
                >
                  ↕ מיקום טקסט
                  {(item.textTopOffset != null || item.textRightInset != null) && " ✓"}
                </button>
              ))}
          </div>
        ))}
      </div>

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

      {error && <p className="text-xs text-red-600">{error}</p>}
    </div>
  );
}
