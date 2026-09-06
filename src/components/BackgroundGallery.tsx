"use client";

import { useState } from "react";
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
}

/**
 * גלריית תבניות רקע לבחירה (ריל או קרוסלה) — העלאה מוסיפה מיידית, מחיקה
 * מסירה מיידית (בלי קשר לטופס ההגדרות הכללי), כדי שאפשר לבנות אוסף לאורך
 * זמן בלי כפתור "שמור" נפרד. אותו קומפוננט משמש לשני הסוגים.
 */
export default function BackgroundGallery({
  kind,
  title,
  hint,
  initial,
}: {
  kind: "reel" | "carousel" | "cover";
  title: string;
  hint: string;
  initial: BackgroundItem[];
}) {
  const router = useRouter();
  const [items, setItems] = useState(initial);
  const [uploadProgress, setUploadProgress] = useState<{ done: number; total: number } | null>(null);
  const [error, setError] = useState<string | null>(null);

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
      body: JSON.stringify({ kind, imageBase64, ext }),
    });
    if (!res.ok) {
      setError(`שגיאה בהעלאת ${file.name} — נסו שוב`);
      return;
    }
    const { paths } = await res.json();
    const latestPath: string = paths[paths.length - 1];
    setItems((prev) => [...prev, { path: latestPath, url: buildFileUrlFromPath(latestPath) }]);
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
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2">
      <label className="text-sm font-medium">{title}</label>
      <p className="text-xs text-neutral-500">{hint}</p>

      <div className="flex flex-wrap gap-3">
        {items.map((item) => (
          <div key={item.path} className="relative">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img src={item.url} alt="" className="h-32 w-24 rounded-md object-cover border" />
            <button
              type="button"
              onClick={() => handleDelete(item)}
              title="הסירי מהרשימה"
              className="absolute -top-2 -left-2 h-6 w-6 rounded-full bg-white border text-xs text-red-600 hover:bg-red-50"
            >
              ✕
            </button>
          </div>
        ))}

        <label className="flex h-32 w-24 items-center justify-center rounded-md border border-dashed text-xs text-neutral-500 hover:bg-neutral-50 cursor-pointer text-center">
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
