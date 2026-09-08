"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { PLATFORM_LABELS, STATUS_LABELS, STATUS_COLORS } from "@/lib/labels";
import { buildFileUrl } from "@/lib/files";

function isVideoFile(file: string): boolean {
  return file.toLowerCase().endsWith(".mp4");
}

export interface NormalizedPlatformContent {
  id: string;
  type: string;
  folderPath: string;
  text: string | null;
  files: string[];
  altText: string | null;
  hashtags: string[];
  tags: string[];
  suggestedSongs: { title: string; artist: string }[];
  suggestedHighlight: string | null;
  backgroundColor: string | null;
  durationSeconds: number | null;
  likesCount: number | null;
  commentsCount: number | null;
  viewsCount: number | null;
  avgWatchSeconds: number | null;
  followersReachPercent: number | null;
  metricsUpdatedAt: string | null;
  publishedAt: string | null;
  status: string;
  updatedAt: string;
}

/** קלט מספרי קטן ל"נתוני ביצועים" — מציג "" כשהערך null, שולח undefined כשריק (לא נוגע בערך הקיים). */
function MetricInput({
  label,
  value,
  onChange,
  step,
}: {
  label: string;
  value: string;
  onChange: (next: string) => void;
  step?: string;
}) {
  return (
    <label className="flex flex-col gap-1 text-xs">
      {label}
      <input
        type="number"
        inputMode="decimal"
        step={step ?? "1"}
        min={0}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="rounded-md border border-brand-pink/40 p-1.5 text-sm bg-white"
      />
    </label>
  );
}

/**
 * נתוני ביצועים בפועל — מוזנים ידנית (אין חיבור API ל-Meta), נקראים ישירות
 * מתובנות אינסטגרם/פייסבוק על ידי המשתמשת. משמשים בדשבורד האנליטיקס (/dashboard).
 */
function MetricsForm({ content }: { content: NormalizedPlatformContent }) {
  const router = useRouter();
  const [likesCount, setLikesCount] = useState(content.likesCount?.toString() ?? "");
  const [commentsCount, setCommentsCount] = useState(content.commentsCount?.toString() ?? "");
  const [viewsCount, setViewsCount] = useState(content.viewsCount?.toString() ?? "");
  const [avgWatchSeconds, setAvgWatchSeconds] = useState(content.avgWatchSeconds?.toString() ?? "");
  const [followersReachPercent, setFollowersReachPercent] = useState(
    content.followersReachPercent?.toString() ?? ""
  );
  const [saving, setSaving] = useState(false);

  async function handleSave() {
    setSaving(true);
    try {
      const toNumberOrNull = (v: string) => (v.trim() === "" ? null : Number(v));
      await fetch(`/api/platform-content/${content.id}/metrics`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          likesCount: toNumberOrNull(likesCount),
          commentsCount: toNumberOrNull(commentsCount),
          viewsCount: toNumberOrNull(viewsCount),
          avgWatchSeconds: content.type === "instagram_reel" ? toNumberOrNull(avgWatchSeconds) : undefined,
          followersReachPercent: toNumberOrNull(followersReachPercent),
        }),
      });
      router.refresh();
    } finally {
      setSaving(false);
    }
  }

  return (
    <div className="flex flex-col gap-2 rounded-lg border border-brand-pink/40 bg-brand-pink/10 p-3">
      <label className="text-xs font-medium">
        נתוני ביצועים (מוזנים ידנית מתובנות אינסטגרם/פייסבוק — לשימוש בדשבורד האנליטיקס)
      </label>
      <div className="flex flex-wrap gap-3">
        <MetricInput label="לייקים" value={likesCount} onChange={setLikesCount} />
        <MetricInput label="תגובות" value={commentsCount} onChange={setCommentsCount} />
        <MetricInput label="צפיות/הגעה" value={viewsCount} onChange={setViewsCount} />
        {content.type === "instagram_reel" && (
          <MetricInput
            label="זמן צפייה ממוצע (שניות)"
            value={avgWatchSeconds}
            onChange={setAvgWatchSeconds}
            step="0.1"
          />
        )}
        <MetricInput
          label="אחוז עוקבים מהצופים"
          value={followersReachPercent}
          onChange={setFollowersReachPercent}
          step="0.1"
        />
      </div>
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={handleSave}
          disabled={saving}
          className="self-start rounded-md border border-brand-pink/40 px-3 py-1.5 text-xs hover:bg-white disabled:opacity-50"
        >
          {saving ? "שומר..." : "שמור נתונים"}
        </button>
        {content.metricsUpdatedAt && (
          <span className="text-xs text-brand-maroon/50">
            עודכן {new Date(content.metricsUpdatedAt).toLocaleDateString("he-IL")}
          </span>
        )}
      </div>
    </div>
  );
}

function CopyButton({ text }: { text: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <button
      type="button"
      onClick={async () => {
        await navigator.clipboard.writeText(text);
        setCopied(true);
        setTimeout(() => setCopied(false), 1500);
      }}
      className="text-xs rounded-md border border-brand-pink/40 px-2 py-1 hover:bg-brand-pink/10"
    >
      {copied ? "הועתק ✓" : "העתק טקסט"}
    </button>
  );
}

export default function PlatformContentCard({ content }: { content: NormalizedPlatformContent }) {
  const router = useRouter();
  const [previewIndex, setPreviewIndex] = useState<number | null>(null);

  function fileUrl(file: string) {
    return `${buildFileUrl(content.folderPath, file)}?v=${encodeURIComponent(content.updatedAt)}`;
  }

  // ניווט בין העמודים בתצוגה המוגדלת עם חצי המקלדת — בלי לסגור ולפתוח מחדש.
  // חץ שמאלה = עמוד הבא, חץ ימינה = עמוד קודם (כמו בקרוסלה באינסטגרם עצמה,
  // שמוחלקת ימין-לשמאל).
  useEffect(() => {
    if (previewIndex === null) return;

    function handleKeyDown(e: KeyboardEvent) {
      if (e.key === "ArrowLeft") {
        setPreviewIndex((i) => (i === null ? i : Math.min(i + 1, content.files.length - 1)));
      } else if (e.key === "ArrowRight") {
        setPreviewIndex((i) => (i === null ? i : Math.max(i - 1, 0)));
      } else if (e.key === "Escape") {
        setPreviewIndex(null);
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [previewIndex, content.files.length]);

  async function markPublished() {
    await fetch(`/api/platform-content/${content.id}/status`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ status: "published" }),
    });
    router.refresh();
  }

  return (
    <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5 flex flex-col gap-4">
      <div className="flex items-center justify-between">
        <h3 className="font-bold">{PLATFORM_LABELS[content.type] ?? content.type}</h3>
        <span className={`text-xs rounded-full px-2 py-1 ${STATUS_COLORS[content.status]}`}>
          {STATUS_LABELS[content.status]}
        </span>
      </div>

      {content.files.length > 0 && content.files.every(isVideoFile) && (
        <div className="flex flex-col gap-2">
          {content.files.map((file) => {
            const url = fileUrl(file);
            return (
              <div key={file} className="flex flex-col gap-1">
                {/* eslint-disable-next-line jsx-a11y/media-has-caption */}
                <video src={url} controls loop className="max-w-[280px] rounded-md border border-brand-pink/40" />
                <a href={url} download={file} className="text-xs text-brand-red hover:underline self-start">
                  הורד סרטון
                </a>
              </div>
            );
          })}
          <p className="text-xs text-neutral-400">
            הסרטון נשמר גם בדיסק: ~/Desktop/social-content-manager/storage/{content.folderPath}
          </p>
        </div>
      )}

      {content.files.length > 0 && !content.files.every(isVideoFile) && (
        <div className="flex flex-col gap-2">
          <div className="flex gap-3 overflow-x-auto pb-2">
            {content.files.map((file, index) => {
              const url = fileUrl(file);
              return (
                <div key={file} className="flex flex-col items-center gap-1">
                  <button
                    type="button"
                    onClick={() => setPreviewIndex(index)}
                    className="cursor-zoom-in"
                    title="לחצו להגדלה"
                  >
                    <img
                      src={url}
                      alt=""
                      className="w-28 h-28 rounded-md object-cover"
                    />
                  </button>
                  <a
                    href={url}
                    download={file}
                    className="text-xs text-brand-red hover:underline"
                  >
                    הורד תמונה
                  </a>
                </div>
              );
            })}
          </div>
          {content.files.length > 1 && (
            <a
              href={`/api/platform-content/${content.id}/download-zip`}
              className="self-start rounded-md border border-brand-pink/40 px-3 py-1.5 text-sm hover:bg-brand-pink/10"
            >
              הורד את כל התמונות (ZIP)
            </a>
          )}
          <p className="text-xs text-neutral-400">
            התמונות נשמרות גם בדיסק: ~/Desktop/social-content-manager/storage/{content.folderPath}
          </p>
        </div>
      )}

      {(content.type === "instagram_carousel" || content.type === "facebook_post") &&
        (content.hashtags.length > 0 || content.tags.length > 0) && (
          <div className="flex flex-col gap-1">
            <label className="text-xs font-medium">
              תגיות (משותפות לכל התוכן של הפוסט — לעריכה, למעלה בעמוד הפוסט)
            </label>
            <div className="flex flex-wrap gap-2 text-xs">
              {content.hashtags.map((h) => (
                <span key={h} className="rounded-full bg-brand-pink/20 text-brand-maroon px-2 py-1">
                  {h}
                </span>
              ))}
              {content.tags.map((t) => (
                <span key={t} className="rounded-full bg-purple-50 text-purple-700 px-2 py-1">
                  @{t}
                </span>
              ))}
            </div>
          </div>
        )}

      {content.type !== "instagram_carousel" &&
        content.type !== "facebook_post" &&
        (content.hashtags.length > 0 || content.tags.length > 0) && (
          <div className="flex flex-wrap gap-2 text-xs">
            {content.hashtags.map((h) => (
              <span key={h} className="rounded-full bg-brand-pink/20 text-brand-maroon px-2 py-1">
                {h}
              </span>
            ))}
            {content.tags.map((t) => (
              <span key={t} className="rounded-full bg-purple-50 text-purple-700 px-2 py-1">
                @{t}
              </span>
            ))}
          </div>
        )}

      {content.text && content.type !== "instagram_carousel" && (
        <div className="flex flex-col gap-2">
          <p className="whitespace-pre-wrap text-sm text-brand-maroon rounded-lg bg-brand-pink/10 p-3">
            {content.hashtags.length > 0 && content.type === "facebook_post"
              ? `${content.hashtags.join(" ")}\n\n${content.text}`
              : content.text}
          </p>
          <div>
            <CopyButton
              text={
                content.hashtags.length > 0 && content.type === "facebook_post"
                  ? `${content.hashtags.join(" ")}\n\n${content.text}`
                  : content.text
              }
            />
          </div>
        </div>
      )}

      {content.altText && (
        <details className="text-xs text-neutral-500">
          <summary className="cursor-pointer">Alt Text (נגישות — סעיף 7)</summary>
          <pre className="whitespace-pre-wrap mt-2">{content.altText}</pre>
        </details>
      )}

      {content.suggestedSongs.length > 0 && (
        <div className="text-xs text-neutral-600">
          🎵 הצעות שיר:{" "}
          {content.suggestedSongs.map((s) => `${s.title} — ${s.artist}`).join(" / ")}
        </div>
      )}

      {content.suggestedHighlight && (
        <div className="text-xs text-neutral-600">💾 היילייט מומלץ: {content.suggestedHighlight}</div>
      )}

      {(content.type === "instagram_carousel" || content.type === "instagram_reel") && (
        <MetricsForm content={content} />
      )}

      <div className="border-t pt-4 flex flex-wrap items-end gap-3">
        <button
          type="button"
          onClick={markPublished}
          className="rounded-md bg-green-600 text-white text-sm px-3 py-1.5 hover:bg-green-700"
        >
          סמן כפורסם
        </button>
        {content.publishedAt && (
          <p className="text-xs text-neutral-500">
            פורסם ב-{new Date(content.publishedAt).toLocaleString("he-IL")}
          </p>
        )}
      </div>

      {previewIndex !== null && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-6 cursor-zoom-out"
          onClick={() => setPreviewIndex(null)}
        >
          <button
            type="button"
            onClick={() => setPreviewIndex(null)}
            className="absolute top-4 left-4 rounded-full bg-white/90 px-3 py-1.5 text-sm hover:bg-white"
          >
            סגור ✕
          </button>

          {previewIndex > 0 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewIndex((i) => (i === null ? i : i - 1));
              }}
              className="absolute right-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 w-10 h-10 text-lg hover:bg-white"
              title="הקודם (חץ ימינה)"
            >
              ›
            </button>
          )}
          {previewIndex < content.files.length - 1 && (
            <button
              type="button"
              onClick={(e) => {
                e.stopPropagation();
                setPreviewIndex((i) => (i === null ? i : i + 1));
              }}
              className="absolute left-4 top-1/2 -translate-y-1/2 rounded-full bg-white/90 w-10 h-10 text-lg hover:bg-white"
              title="הבא (חץ שמאלה)"
            >
              ‹
            </button>
          )}

          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={fileUrl(content.files[previewIndex])}
            alt=""
            className="max-h-[90vh] max-w-[90vw] rounded-lg object-contain"
            onClick={(e) => e.stopPropagation()}
          />

          {content.files.length > 1 && (
            <span className="absolute bottom-4 rounded-full bg-white/90 px-3 py-1 text-sm">
              {previewIndex + 1} / {content.files.length}
            </span>
          )}
        </div>
      )}
    </div>
  );
}
