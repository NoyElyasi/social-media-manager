"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export default function AiThemeOptionsForm({ initial }: { initial: string[] }) {
  const router = useRouter();
  const [themes, setThemes] = useState(initial);
  const [newTheme, setNewTheme] = useState("");
  const [saving, setSaving] = useState(false);

  async function save(next: string[]) {
    setSaving(true);
    setThemes(next);
    await fetch("/api/settings/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ aiThemeOptions: next }),
    });
    setSaving(false);
    router.refresh();
  }

  function handleAdd() {
    const trimmed = newTheme.trim();
    if (!trimmed || themes.includes(trimmed)) return;
    save([...themes, trimmed]);
    setNewTheme("");
  }

  function handleRemove(theme: string) {
    save(themes.filter((t) => t !== theme));
  }

  return (
    <div className="flex flex-col gap-3 max-w-md">
      <div className="flex flex-wrap gap-2">
        {themes.map((theme) => (
          <span
            key={theme}
            className="inline-flex items-center gap-1 rounded-full bg-brand-pink/20 text-brand-maroon px-3 py-1 text-sm"
          >
            {theme}
            <button
              type="button"
              onClick={() => handleRemove(theme)}
              disabled={saving}
              className="text-brand-red hover:text-brand-red-dark"
              aria-label={`הסירי ${theme}`}
            >
              ✕
            </button>
          </span>
        ))}
        {themes.length === 0 && <p className="text-sm text-brand-maroon/50">אין נושאים עדיין.</p>}
      </div>
      <div className="flex gap-2">
        <input
          type="text"
          value={newTheme}
          onChange={(e) => setNewTheme(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="נושא חדש..."
          className="flex-1 rounded-lg border border-brand-pink/40 p-2 bg-white text-sm"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !newTheme.trim()}
          className="rounded-lg bg-brand-red px-4 py-2 text-white text-sm font-medium hover:bg-brand-red-dark disabled:opacity-50"
        >
          + הוסיפי
        </button>
      </div>
    </div>
  );
}
