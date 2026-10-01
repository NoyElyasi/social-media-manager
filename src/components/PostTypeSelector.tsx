"use client";

export type PostType = "regular" | "letter" | "tip" | "short";

const OPTIONS: { value: PostType; label: string }[] = [
  { value: "regular", label: "רגיל" },
  { value: "letter", label: "✉️ מכתב" },
  { value: "tip", label: "💡 טיפ" },
  { value: "short", label: "✨ קצר" },
];

/** קצר גובר: פוסט קצר הוא סוג בפני עצמו (ללא מכתב/טיפ). */
export function postTypeOf(aiFormat: string | null | undefined, isShort: boolean): PostType {
  if (isShort) return "short";
  return aiFormat === "letter" || aiFormat === "tip" ? aiFormat : "regular";
}

/** המרה בחזרה לשדות השמורים: aiFormat (רגיל/מכתב/טיפ) ו-isShort. */
export function splitPostType(type: PostType): { aiFormat: "regular" | "letter" | "tip"; isShort: boolean } {
  return type === "short" ? { aiFormat: "regular", isShort: true } : { aiFormat: type, isShort: false };
}

/** בורר סוג פוסט אחד (רגיל / מכתב / טיפ / קצר) — משמש ביצירה ובעריכה, כדי שאפשר להחליף בין הסוגים בכל שלב. */
export default function PostTypeSelector({ value, onChange }: { value: PostType; onChange: (type: PostType) => void }) {
  return (
    <div role="radiogroup" aria-label="סוג הפוסט" className="inline-flex overflow-hidden rounded-full border border-brand-pink/40 bg-white">
      {OPTIONS.map((opt) => (
        <button
          key={opt.value}
          type="button"
          role="radio"
          aria-checked={value === opt.value}
          onClick={() => onChange(opt.value)}
          className={`px-4 py-1.5 text-sm transition-colors ${
            value === opt.value ? "bg-brand-pink/40 font-medium text-brand-maroon" : "text-brand-maroon/60 hover:bg-brand-pink/10"
          }`}
        >
          {opt.label}
        </button>
      ))}
    </div>
  );
}
