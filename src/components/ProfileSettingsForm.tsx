"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

export interface InitialProfile {
  displayName: string;
  highlights: string[];
  profileImageUrl: string | null;
  reelBackgroundImageUrl: string | null;
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
  const [highlightsText, setHighlightsText] = useState(initial.highlights.join(", "));
  const [imageFile, setImageFile] = useState<File | null>(null);
  const [reelBackgroundFile, setReelBackgroundFile] = useState<File | null>(null);
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

    let reelBackgroundImageBase64: string | undefined;
    let reelBackgroundImageExt: string | undefined;

    if (reelBackgroundFile) {
      const buffer = await reelBackgroundFile.arrayBuffer();
      reelBackgroundImageBase64 = arrayBufferToBase64(buffer);
      reelBackgroundImageExt = reelBackgroundFile.name.split(".").pop()?.toLowerCase();
    }

    await fetch("/api/settings/profile", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        displayName,
        highlights,
        profileImageBase64,
        profileImageExt,
        reelBackgroundImageBase64,
        reelBackgroundImageExt,
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
          className="rounded-lg border p-2"
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
        <label className="text-sm font-medium">תבנית רקע לריל (אופציונלי — אחרת נבחר צבע רקע אוטומטי)</label>
        {initial.reelBackgroundImageUrl && (
          // eslint-disable-next-line @next/next/no-img-element
          <img
            src={initial.reelBackgroundImageUrl}
            alt=""
            className="h-40 w-[90px] rounded-md object-cover border"
          />
        )}
        <input
          type="file"
          accept="image/png,image/jpeg"
          onChange={(e) => setReelBackgroundFile(e.target.files?.[0] ?? null)}
        />
      </div>

      <div className="flex flex-col gap-2">
        <label className="text-sm font-medium">
          היילייטס קיימים באינסטגרם (מופרדים בפסיקים — סעיף 4.5)
        </label>
        <input
          type="text"
          value={highlightsText}
          onChange={(e) => setHighlightsText(e.target.value)}
          className="rounded-lg border p-2"
          placeholder="למשל: טיולים, משפחה, מתכונים"
        />
      </div>

      <button
        type="submit"
        disabled={saving}
        className="self-start rounded-lg bg-blue-600 px-4 py-2 text-white font-medium hover:bg-blue-700 disabled:opacity-50"
      >
        {saving ? "שומר..." : saved ? "נשמר ✓" : "שמור הגדרות"}
      </button>
    </form>
  );
}
