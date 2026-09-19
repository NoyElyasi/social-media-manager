"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

type Format = "regular" | "letter" | "tip";

const FORMAT_OPTIONS: { value: Format; label: string }[] = [
  { value: "regular", label: "רגיל" },
  { value: "letter", label: "✉️ מכתב" },
  { value: "tip", label: "💡 טיפ" },
];

export default function InstagramMediaLabelEditor({
  mediaId,
  initialTheme,
  initialFormat,
  availableThemes,
}: {
  mediaId: string;
  initialTheme: string | null;
  initialFormat: string | null;
  availableThemes: string[];
}) {
  const router = useRouter();
  const [theme, setTheme] = useState(initialTheme ?? "");
  const [format, setFormat] = useState<Format>(
    initialFormat === "letter" || initialFormat === "tip" ? initialFormat : "regular"
  );
  const [saving, setSaving] = useState(false);

  // אם הערך הנוכחי הוסר מרשימת הנושאים בהגדרות, משאירים אותו זמין כאן
  // כדי לא "לאבד" תיוג קיים בלי התראה — היא תבחר משהו אחר אם תרצה.
  const themeOptions = theme && !availableThemes.includes(theme) ? [theme, ...availableThemes] : availableThemes;

  async function save(next: { theme?: string; format?: Format }) {
    setSaving(true);
    const nextTheme = next.theme ?? theme;
    const nextFormat = next.format ?? format;
    await fetch(`/api/settings/meta/media/${mediaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiTheme: nextTheme.trim() === "" ? null : nextTheme.trim(),
        aiFormat: nextFormat,
      }),
    });
    setSaving(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-1.5" onClick={(e) => e.stopPropagation()}>
      {theme && (
        <span className="self-start inline-flex items-center gap-1 rounded-full bg-purple-50 text-purple-700 px-2 py-0.5 text-xs">
          🏷️ {theme}
          {format === "letter" && " · ✉️ מכתב"}
          {format === "tip" && " · 💡 טיפ"}
        </span>
      )}
      <select
        value={theme}
        onChange={(e) => {
          setTheme(e.target.value);
          save({ theme: e.target.value });
        }}
        disabled={saving}
        className="rounded-md border border-brand-pink/40 bg-white p-1 text-xs"
      >
        <option value="">בחרי נושא...</option>
        {themeOptions.map((t) => (
          <option key={t} value={t}>
            {t}
          </option>
        ))}
      </select>
      <div className="flex gap-1">
        {FORMAT_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            disabled={saving}
            onClick={() => {
              setFormat(opt.value);
              save({ format: opt.value });
            }}
            className={`rounded-full px-2 py-0.5 text-[11px] disabled:opacity-50 ${
              format === opt.value
                ? "bg-brand-pink/30 text-brand-maroon"
                : "border border-brand-pink/40 text-brand-maroon/60 hover:bg-brand-pink/10"
            }`}
          >
            {opt.label}
          </button>
        ))}
      </div>
    </div>
  );
}
