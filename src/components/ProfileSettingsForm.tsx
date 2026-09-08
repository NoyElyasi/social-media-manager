"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface InitialProfile {
  displayName: string;
  highlights: string[];
  profileImageUrl: string | null;
  facebookProfileId: string | null;
}

function arrayBufferToBase64(buffer: ArrayBuffer): string {
  let binary = "";
  const bytes = new Uint8Array(buffer);
  for (let i = 0; i < bytes.byteLength; i++) binary += String.fromCharCode(bytes[i]);
  return btoa(binary);
}

export default function ProfileSettingsForm({ initial }: { initial: InitialProfile }) {
  const router = useRouter();
  const [displayName, setDisplayName] = useState(initial.displayName);
  const [facebookProfileId, setFacebookProfileId] = useState(initial.facebookProfileId ?? "");
  const [highlightsText, setHighlightsText] = useState(initial.highlights.join(", "));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [saved, setSaved] = useState(false);

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setSaving(true);
    setSaved(false);

    const highlights = highlightsText
      .split(",")
      .map((h) => h.trim())
      .filter(Boolean);

    let profileImageBase64: string | undefined;
    let profileImageExt: string | undefined;

    if (imageFile) {
      const buffer = await imageFile.arrayBuffer();
      profileImageBase64 = arrayBufferToBase64(buffer);
      profileImageExt = imageFile.name.split(".").pop()?.toLowerCase();
    }

    await fetch("/api/settings/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        highlights,
        profileImageBase64,
        profileImageExt,
        facebookProfileId: facebookProfileId.trim(),
      }),
    });

    setSaving(false);
    setSaved(true);
    router.refresh();
  }

  return (
    <form onSubmit={handleSubmit} className="flex flex-col gap-6 max-w-md">
      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">שם תצוגה (מוצג בעמודי הקרוסלה/ריל — סעיף 6)</label>
        <input
          type="text"
          value={displayName}
          onChange={(e) => setDisplayName(e.target.value)}
          className="rounded-lg border border-brand-pink/40 p-2 bg-white"
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">תמונת פרופיל</label>
        {initial.profileImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={initial.profileImageUrl} alt="" className="h-20 w-20 rounded-full object-cover" />
        )}
        <input type="file" accept="image/png,image/jpeg" onChange={(e) => setImageFile(e.target.files?.[0] ?? null)} />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">
          שם משתמש/מזהה פרופיל בפייסבוק — כמו שמופיע ב-facebook.com/&lt;זה&gt;
        </label>
        <input
          type="text"
          value={facebookProfileId}
          onChange={(e) => setFacebookProfileId(e.target.value)}
          className="rounded-lg border border-brand-pink/40 p-2 bg-white"
          placeholder="למשל noy.elyasi"
        />
        <p className="text-xs text-brand-maroon/60">
          משמש לכפתור &quot;חיפוש בפייסבוק&quot; בעמוד &quot;פוסט חדש&quot;, כדי שהחיפוש יהיה בפרופיל שלך ולא בכל פייסבוק.
        </p>
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">
          היילייטס קיימים באינסטגרם (מופרדים בפסיקים — סעיף 4.5)
        </label>
        <input
          type="text"
          value={highlightsText}
          onChange={(e) => setHighlightsText(e.target.value)}
          className="rounded-lg border border-brand-pink/40 p-2 bg-white"
          placeholder="למשל: טיולים, משפחה, מתכונים"
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="self-start rounded-lg bg-brand-red px-4 py-2 text-white font-medium hover:bg-brand-red-dark disabled:opacity-50"
      >
        {saving ? "שומר..." : saved ? "נשמר ✓" : "שמור הגדרות"}
      </button>
    </form>
  );
}
