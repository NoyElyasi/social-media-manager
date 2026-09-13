"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface Song {
  title: string;
  artist: string;
}

type ThemeSongs = Record<string, Song[]>;

/** מיפוי נושא → רשימת שירים מתאימים, לשימוש בהצעת שיר בזמן יצירת פוסט (ראו suggestSongs). */
export default function SongsByThemeForm({ themes, initial }: { themes: string[]; initial: ThemeSongs }) {
  const router = useRouter();
  const [themeSongs, setThemeSongs] = useState<ThemeSongs>(initial);
  const [selectedTheme, setSelectedTheme] = useState(themes[0] ?? "");
  const [newTitle, setNewTitle] = useState("");
  const [newArtist, setNewArtist] = useState("");
  const [saving, setSaving] = useState(false);

  const songs = themeSongs[selectedTheme] ?? [];

  async function save(next: ThemeSongs) {
    setSaving(true);
    setThemeSongs(next);
    await fetch("/api/settings/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ themeSongs: next }),
    });
    setSaving(false);
    router.refresh();
  }

  function handleAdd() {
    const title = newTitle.trim();
    const artist = newArtist.trim();
    if (!title || !artist || !selectedTheme) return;
    const existing = themeSongs[selectedTheme] ?? [];
    if (existing.some((s) => s.title === title && s.artist === artist)) return;
    save({ ...themeSongs, [selectedTheme]: [...existing, { title, artist }] });
    setNewTitle("");
    setNewArtist("");
  }

  function handleRemove(song: Song) {
    const existing = themeSongs[selectedTheme] ?? [];
    save({ ...themeSongs, [selectedTheme]: existing.filter((s) => s !== song) });
  }

  return (
    <div className="flex flex-col gap-3 max-w-md">
      <p className="text-xs text-brand-maroon/60">
        לכל נושא, רשימת השירים שלך שהכי מתאימים לו — כשיוצרים פוסט ובוחרים נושא, ההצעה תמיד תבוא מהרשימה הזו (ולא ניחוש
        לפי מילות מפתח בטקסט).
      </p>
      <select
        value={selectedTheme}
        onChange={(e) => setSelectedTheme(e.target.value)}
        className="rounded-lg border border-brand-pink/40 p-2 bg-white text-sm"
      >
        {themes.map((theme) => (
          <option key={theme} value={theme}>
            {theme}
          </option>
        ))}
      </select>

      <div className="flex flex-col gap-2">
        {songs.map((song) => (
          <div
            key={`${song.title}-${song.artist}`}
            className="flex items-center justify-between rounded-lg bg-brand-pink/10 px-3 py-1.5 text-sm"
          >
            <span>
              {song.title} — {song.artist}
            </span>
            <button
              type="button"
              onClick={() => handleRemove(song)}
              disabled={saving}
              className="text-brand-red hover:text-brand-red-dark"
              aria-label={`הסירי ${song.title}`}
            >
              ✕
            </button>
          </div>
        ))}
        {songs.length === 0 && <p className="text-sm text-brand-maroon/50">אין עדיין שירים לנושא הזה.</p>}
      </div>

      <div className="flex gap-2">
        <input
          type="text"
          value={newTitle}
          onChange={(e) => setNewTitle(e.target.value)}
          placeholder="שם השיר"
          className="flex-1 rounded-lg border border-brand-pink/40 p-2 bg-white text-sm"
        />
        <input
          type="text"
          value={newArtist}
          onChange={(e) => setNewArtist(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") {
              e.preventDefault();
              handleAdd();
            }
          }}
          placeholder="אמן/ית"
          className="flex-1 rounded-lg border border-brand-pink/40 p-2 bg-white text-sm"
        />
        <button
          type="button"
          onClick={handleAdd}
          disabled={saving || !newTitle.trim() || !newArtist.trim()}
          className="shrink-0 rounded-lg bg-brand-red px-4 py-2 text-white text-sm font-medium hover:bg-brand-red-dark disabled:opacity-50"
        >
          + הוסיפי
        </button>
      </div>
    </div>
  );
}
