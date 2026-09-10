"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

interface InstagramMediaSummary {
  id: string;
  caption: string | null;
  timestamp: string;
  permalink: string;
  mediaType: string;
  mediaProductType: string | null;
  thumbnailUrl: string | null;
}

/**
 * מקשרת תוכן מקומי לפוסט אמיתי באינסטגרם — משמש לדשבורד (/dashboard) כדי
 * להעשיר את הפוסט המסונכרן שם באורך הריל ובתיוג ה-AI, ששניהם מגיעים מהכלי
 * ולא מה-API. לא מציג/מסנכרן נתוני ביצועים כאן — אלה נמצאים בדשבורד עצמו.
 */
export default function InstagramLinkPanel({
  contentId,
  hashtags,
  instagramMediaId,
  instagramPermalink,
}: {
  contentId: string;
  hashtags: string[];
  instagramMediaId: string | null;
  instagramPermalink: string | null;
}) {
  const router = useRouter();
  const [picking, setPicking] = useState(false);
  const [media, setMedia] = useState<InstagramMediaSummary[] | null>(null);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function openPicker() {
    setPicking(true);
    setError(null);
    if (media) return;
    setLoading(true);
    const res = await fetch("/api/settings/meta/media");
    const data = await res.json();
    setLoading(false);
    if (!res.ok) {
      setError(data.error || "כשל בשליפת הפוסטים מאינסטגרם");
      return;
    }
    setMedia(data.media);
  }

  async function selectMedia(item: InstagramMediaSummary) {
    setError(null);
    const res = await fetch(`/api/platform-content/${contentId}/instagram-link`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ instagramMediaId: item.id, instagramPermalink: item.permalink }),
    });
    if (!res.ok) {
      const data = await res.json();
      setError(data.error || "כשל בקישור");
      return;
    }
    setPicking(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-brand-pink/40 bg-white p-3">
      <label className="text-xs font-medium">
        חיבור אמיתי לאינסטגרם
        {hashtags.length > 0 && <span className="text-brand-red"> — {hashtags.join(" ")}</span>}
      </label>

      {instagramMediaId ? (
        <div className="flex flex-wrap items-center gap-3 text-xs">
          <a href={instagramPermalink ?? "#"} target="_blank" rel="noreferrer" className="text-brand-red hover:underline">
            הפוסט המקושר באינסטגרם ↗
          </a>
          <button type="button" onClick={openPicker} className="text-brand-maroon/60 hover:underline">
            שנה קישור
          </button>
        </div>
      ) : (
        <button
          type="button"
          onClick={openPicker}
          className="self-start rounded-md border border-brand-pink/40 px-3 py-1.5 text-xs hover:bg-brand-pink/10"
        >
          קשר לפוסט מאינסטגרם
        </button>
      )}

      {error && <p className="text-xs text-brand-red">{error}</p>}

      {picking && (
        <div className="mt-2 flex flex-col gap-2 rounded-lg border border-brand-pink/30 p-2 max-h-72 overflow-y-auto">
          {loading && <p className="text-xs text-brand-maroon/60">טוענת פוסטים...</p>}
          {media?.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => selectMedia(item)}
              className="flex items-center gap-2 rounded-md p-1.5 text-right hover:bg-brand-pink/10"
            >
              {item.thumbnailUrl && (
                // eslint-disable-next-line @next/next/no-img-element
                <img src={item.thumbnailUrl} alt="" className="w-12 h-12 rounded-md object-cover shrink-0" />
              )}
              <span className="flex flex-col gap-0.5 text-xs">
                <span className="text-brand-maroon/60">
                  {new Date(item.timestamp).toLocaleDateString("he-IL")}
                </span>
                <span className="line-clamp-2">{item.caption ?? "(בלי כיתוב)"}</span>
              </span>
            </button>
          ))}
          <button
            type="button"
            onClick={() => setPicking(false)}
            className="self-start text-xs text-brand-maroon/60 hover:underline"
          >
            סגור
          </button>
        </div>
      )}
    </div>
  );
}
