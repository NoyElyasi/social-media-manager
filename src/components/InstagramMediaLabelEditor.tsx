"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

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
  const [isLetter, setIsLetter] = useState(initialFormat === "letter");
  const [saving, setSaving] = useState(false);

  // אם הערך הנוכחי הוסר מרשימת הנושאים בהגדרות, משאירים אותו זמין כאן
  // כדי לא "לאבד" תיוג קיים בלי התראה — היא תבחר משהו אחר אם תרצה.
  const themeOptions = theme && !availableThemes.includes(theme) ? [theme, ...availableThemes] : availableThemes;

  async function save(next: { theme?: string; isLetter?: boolean }) {
    setSaving(true);
    const nextTheme = next.theme ?? theme;
    const nextIsLetter = next.isLetter ?? isLetter;
    await fetch(`/api/settings/meta/media/${mediaId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        aiTheme: nextTheme.trim() === "" ? null : nextTheme.trim(),
        aiFormat: nextIsLetter ? "letter" : "regular",
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
          {isLetter && " · מכתב"}
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
      <label className="flex items-center gap-1 text-xs text-brand-maroon/70">
        <input
          type="checkbox"
          checked={isLetter}
          onChange={(e) => {
            setIsLetter(e.target.checked);
            save({ isLetter: e.target.checked });
          }}
          disabled={saving}
        />
        פוסט מסוג מכתב
      </label>
    </div>
  );
}
