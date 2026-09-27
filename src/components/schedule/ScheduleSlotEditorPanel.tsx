"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PLATFORM_LABELS } from "@/lib/labels";
import type { WeekSlot } from "@/lib/weeklySchedule";
import OpenFolderButton from "@/components/OpenFolderButton";

const HOURS = Array.from({ length: 24 }, (_, h) => h);

// כמו ב-ScheduleSlotChip.tsx — כותרת הפופ-אפ מציגה את אותה תגית שהצ'יפ מציג
// בלוח, לפי בקשה מפורשת ("שיהיה למעלה התגית, לא התאריך"), לא רק תאריך גנרי.
const RECOMMENDED_TYPE_SHORT_LABELS: Record<string, string> = {
  instagram_reel: "צריך ריל",
  instagram_carousel: "צריך פוסט",
};

export type EditorTarget = { mode: "existing"; slot: WeekSlot } | { mode: "new"; date: string; dayLabel: string; hour: number };

/** פאנל עריכה לסלוט קיים או ליצירת סלוט חדש בתא ריק שנלחץ בלוח השנה. */
export default function ScheduleSlotEditorPanel({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const router = useRouter();
  const [hour, setHour] = useState(target.mode === "existing" ? target.slot.hour : target.hour);
  const [dateInput, setDateInput] = useState(target.mode === "existing" ? target.slot.date : target.date);
  const [busy, setBusy] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [notionTags, setNotionTags] = useState<{ tag: string; typeValues: string[]; alreadyScheduled?: boolean }[] | null>(null);
  const [notionTagsLoading, setNotionTagsLoading] = useState(false);
  const [reelPickerOpen, setReelPickerOpen] = useState(false);
  const [reelCandidates, setReelCandidates] = useState<
    { mediaId: string; caption: string | null; permalink: string; viewsCount: number | null; likesCount: number | null; commentsCount: number | null }[] | null
  >(null);
  const [reelCandidatesLoading, setReelCandidatesLoading] = useState(false);
  // סוג ידני (פוסט/ריל) לשיבוץ בלי תוכן אמיתי — קובע את הצביעה של הצ'יפ
  // (ראו postTypeStyle) וגם את התווית ("צריך ריל"/"צריך פוסט") כשאין תגית/מועמד.
  const [manualType, setManualType] = useState<"instagram_carousel" | "instagram_reel">(
    (target.mode === "existing" ? target.slot.recommendedType : null) ?? "instagram_carousel"
  );

  const slotId = target.mode === "existing" ? target.slot.slotId : null;
  const date = target.mode === "existing" ? target.slot.date : target.date;
  const dayLabel = target.mode === "existing" ? null : target.dayLabel;
  const content = target.mode === "existing" ? target.slot.content : null;

  const [notionInput, setNotionInput] = useState(content?.notionUrl ?? "");
  const [notionEditing, setNotionEditing] = useState(!content?.notionUrl);
  const [savingNotion, setSavingNotion] = useState(false);
  const recommendedReelCandidate = target.mode === "existing" ? target.slot.recommendedReelCandidate : null;
  const recommendedNotionSegment = target.mode === "existing" ? target.slot.recommendedNotionSegment : null;
  const isManual = target.mode === "existing" ? target.slot.isManual : true;

  // תגית הכותרת — בדיוק אותה לוגיקה כמו הצ'יפ בלוח (ScheduleSlotChip): שם
  // התוכן, ואם אין — תגית נושיין/ריל מומלץ/סוג מתוכנן, ורק אם באמת אין כלום
  // (שיבוץ ריק חדש) חוזרים לתאריך/יום.
  const notionTagLabel = recommendedNotionSegment
    ? recommendedNotionSegment.tag.startsWith("#")
      ? recommendedNotionSegment.tag
      : `#${recommendedNotionSegment.tag}`
    : null;
  const reelLabel = recommendedReelCandidate ? `🎬 ${recommendedReelCandidate.caption ?? "(ללא כיתוב)"}` : null;
  const recommendedTypeLabel =
    target.mode === "existing" && target.slot.recommendedType ? RECOMMENDED_TYPE_SHORT_LABELS[target.slot.recommendedType] ?? null : null;
  const headerTag = content?.titleTag ?? notionTagLabel ?? reelLabel ?? recommendedTypeLabel;

  /** פותחת/סוגרת את בורר "שיבוץ קטע מנושיין" — משתמש באותה רשימת תגיות "מוכן" כמו הדרופ-דאון של שם/הערה. */
  function ensurePicker() {
    setPickerOpen((v) => !v);
    void ensureNotionTags();
  }

  /** טוענת פעם אחת (בפוקוס ראשון על שם/הערה, או פתיחת הבורר) את כל תגיות "מוכן" מנושיין — לדרופ-דאון ולבדיקת קיום. */
  async function ensureNotionTags() {
    if (notionTags || notionTagsLoading) return;
    setNotionTagsLoading(true);
    const res = await fetch("/api/notion/ready-tags");
    const data = await res.json();
    setNotionTags(data.tags ?? []);
    setNotionTagsLoading(false);
  }

  /** פותחת/סוגרת את בורר "בחר מהרילים הבאים" (אותה רשימה כמו בדשבורד) — רק כשסוג ריל נבחר. */
  function ensureReelPicker() {
    setReelPickerOpen((v) => !v);
    void ensureReelCandidates();
  }

  async function ensureReelCandidates() {
    if (reelCandidates || reelCandidatesLoading) return;
    setReelCandidatesLoading(true);
    const res = await fetch("/api/schedule/reel-candidates");
    const data = await res.json();
    setReelCandidates(data.candidates ?? []);
    setReelCandidatesLoading(false);
  }

  async function refreshAndClose() {
    router.refresh();
    onClose();
  }

  async function patchExisting(data: Record<string, unknown>) {
    if (!slotId) return;
    setBusy(true);
    await fetch(`/api/schedule/slots/${slotId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await refreshAndClose();
  }

  /** מזיזה שיבוץ קיים לתאריך אחר (שבוע אחר לגמרי, כולל) — נועלת אותו (כמו כל עדכון ידני, ראו patchExisting). */
  async function moveToDate(newDate: string) {
    setDateInput(newDate);
    await patchExisting({ date: newDate });
  }

  async function deleteExisting() {
    if (!slotId) return;
    setBusy(true);
    await fetch(`/api/schedule/slots/${slotId}`, { method: "DELETE" });
    await refreshAndClose();
  }

  async function createNew(
    platformContentId: string | null,
    noteOverride?: string,
    extra?: {
      plannedType?: "instagram_carousel" | "instagram_reel" | null;
      plannedNotionTag?: string | null;
      plannedNotionPreview?: string | null;
      plannedNotionPageUrl?: string | null;
      plannedReelCandidateMediaId?: string | null;
    }
  ) {
    setBusy(true);
    await fetch("/api/schedule/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        date,
        hour,
        platformContentId,
        note: noteOverride?.trim() || null,
        plannedType: extra?.plannedType !== undefined ? extra.plannedType : platformContentId ? null : manualType,
        plannedNotionTag: extra?.plannedNotionTag ?? null,
        plannedNotionPreview: extra?.plannedNotionPreview ?? null,
        plannedNotionPageUrl: extra?.plannedNotionPageUrl ?? null,
        plannedReelCandidateMediaId: extra?.plannedReelCandidateMediaId ?? null,
      }),
    });
    await refreshAndClose();
  }

  /** בוחרת סוג (פוסט/ריל) לשיבוץ בלי תוכן — לסלוט קיים שומרת מיד (כמו כל שינוי אחר בפאנל הזה), לסלוט חדש רק מעדכנת את המצב המקומי עד ליצירה בפועל. */
  function selectManualType(next: "instagram_carousel" | "instagram_reel") {
    setManualType(next);
    if (target.mode === "existing") void patchExisting({ plannedType: next });
  }

  /**
   * בחירת תגית מנושיין מהבורר "שיבוץ קטע מנושיין" — שולפת גם קישור/תקציר
   * (כמו הצעה אוטומטית, ראו notionPick ב-weeklySchedule.ts) כדי שהצ'יפ יציג
   * את התגית עצמה (📓 #תגית), לא "צריך פוסט/ריל" גנרי — לא רק note חופשי.
   */
  async function selectNotionTagAsContent(tag: string) {
    setBusy(true);
    const res = await fetch(`/api/notion/lookup?tag=${encodeURIComponent(tag)}`);
    const data = await res.json().catch(() => null);
    const segment = data?.segment as { pageUrl: string; bodyText: string } | null | undefined;
    // מוחקת מועמד ריל שנבחר קודם (ראו selectReelCandidate) — שני המקורות
    // מייצגים תוכן שונה, בחירה חדשה מחליפה את הקודמת, לא מצטרפת אליה.
    const extra = {
      plannedType: manualType,
      plannedNotionTag: tag,
      plannedNotionPreview: segment?.bodyText ? segment.bodyText.slice(0, 120) : null,
      plannedNotionPageUrl: segment?.pageUrl ?? null,
      plannedReelCandidateMediaId: null,
    };

    if (target.mode === "existing") {
      return patchExisting({ note: tag, platformContentId: null, ...extra });
    }
    return createNew(null, tag, extra);
  }

  /** בחירת מועמד מהבורר "בחר מהרילים הבאים" (כמו בדשבורד) — קובעת גם את הסוג לריל, ומוחקת קטע נושיין שנבחר קודם (ראו selectNotionTagAsContent). */
  async function selectReelCandidate(mediaId: string) {
    setManualType("instagram_reel");
    const extra = {
      plannedType: "instagram_reel" as const,
      plannedNotionTag: null,
      plannedNotionPreview: null,
      plannedNotionPageUrl: null,
      plannedReelCandidateMediaId: mediaId,
    };
    if (target.mode === "existing") {
      return patchExisting({ platformContentId: null, ...extra });
    }
    return createNew(null, undefined, extra);
  }

  async function saveNotionUrl() {
    if (!content) return;
    setSavingNotion(true);
    await fetch(`/api/posts/${content.postId}/notion-url`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notionUrl: notionInput.trim() || null }),
    });
    setSavingNotion(false);
    setNotionEditing(false);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-brand-maroon/20 p-4" onClick={onClose}>
      <div
        className="w-full max-w-sm rounded-2xl border border-brand-pink/15 bg-white p-4 shadow-lg flex flex-col gap-3 text-sm"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between pb-1 border-b border-brand-pink/15">
          <h2 className="font-semibold text-brand-maroon truncate">{headerTag ?? dayLabel ?? date}</h2>
          <button type="button" onClick={onClose} className="text-brand-maroon/30 hover:text-brand-red">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-brand-maroon/60">שעה:</span>
          <select
            value={hour}
            disabled={busy}
            onChange={(e) => {
              const next = Number(e.target.value);
              setHour(next);
              if (target.mode === "existing") patchExisting({ hour: next });
            }}
            className="rounded-md border border-brand-pink/20 bg-white px-1 py-0.5 text-xs"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
          {!isManual && <span className="text-[11px] text-brand-maroon/40">🤖 הצעה אוטומטית</span>}
        </div>

        {target.mode === "existing" && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-brand-maroon/50">תאריך:</span>
            <input
              type="date"
              value={dateInput}
              disabled={busy}
              onChange={(e) => e.target.value && moveToDate(e.target.value)}
              className="rounded-md border border-brand-pink/20 bg-white px-1.5 py-0.5 text-xs"
            />
          </div>
        )}

        {target.mode === "existing" && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => patchExisting({ isManual: !isManual })}
              disabled={busy}
              className="text-[11px] text-brand-maroon/50 hover:text-brand-red"
            >
              {isManual ? "🔓 בטלי נעילה — תיכלל בהצעה הבאה" : "🔒 נעלי — לא תשתנה בהצעה הבאה"}
            </button>
          </div>
        )}

        {content ? (
          <div className="rounded-lg bg-brand-pink/10 p-2 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-brand-maroon truncate">{content.titleTag ?? "ללא תיוג"}</span>
              {target.mode === "existing" && (
                <button
                  type="button"
                  onClick={() => patchExisting({ platformContentId: null })}
                  disabled={busy}
                  className="shrink-0 text-brand-maroon/40 hover:text-brand-red text-xs"
                >
                  הסרת התוכן
                </button>
              )}
            </div>
            <span className="text-[11px] text-brand-maroon/60">
              {PLATFORM_LABELS[content.type] ?? content.type} · שעת פרסום {String(hour).padStart(2, "0")}:00
            </span>
            {content.text && <p className="text-xs text-brand-maroon/80 truncate">{content.text}</p>}

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Link href={`/posts/${content.postId}`} className="rounded-md border border-brand-pink/20 bg-white px-2 py-1 hover:bg-brand-pink/10">
                ✏️ עריכת הפוסט
              </Link>
              <OpenFolderButton postId={content.postId} />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-brand-maroon/50">קישור ל-Notion:</span>
              {notionEditing ? (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={notionInput}
                    disabled={savingNotion}
                    onChange={(e) => setNotionInput(e.target.value)}
                    placeholder="https://notion.so/..."
                    dir="ltr"
                    className="flex-1 rounded-md border border-brand-pink/20 bg-white px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={saveNotionUrl}
                    disabled={savingNotion}
                    className="rounded-md border border-brand-pink/20 bg-white px-2 py-1 text-xs hover:bg-brand-pink/10"
                  >
                    שמירה
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <a href={content.notionUrl ?? undefined} target="_blank" rel="noreferrer" className="text-brand-maroon hover:underline text-xs truncate">
                    📓 פתיחה ב-Notion
                  </a>
                  <button type="button" onClick={() => setNotionEditing(true)} className="text-[11px] text-brand-maroon/40 hover:text-brand-red">
                    שינוי
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center gap-1.5">
              <span className="text-[11px] text-brand-maroon/60">סוג:</span>
              <button
                type="button"
                onClick={() => selectManualType("instagram_carousel")}
                className={`rounded-full px-2 py-0.5 text-[11px] border ${
                  manualType === "instagram_carousel" ? "border-brand-maroon bg-brand-maroon text-white" : "border-brand-pink/20 bg-white text-brand-maroon/60 hover:bg-brand-pink/10"
                }`}
              >
                📄 פוסט
              </button>
              <button
                type="button"
                onClick={() => selectManualType("instagram_reel")}
                className={`rounded-full px-2 py-0.5 text-[11px] border ${
                  manualType === "instagram_reel" ? "border-brand-maroon bg-brand-maroon text-white" : "border-brand-pink/20 bg-white text-brand-maroon/60 hover:bg-brand-pink/10"
                }`}
              >
                🎬 ריל
              </button>
            </div>

            {recommendedNotionSegment && (
              <div className="rounded-lg border border-brand-pink/20 bg-brand-pink/5 p-2 flex flex-col gap-1">
                <span className="text-[11px] text-brand-maroon/60">
                  📓 קטע מוכן בנושיין שמתאים לשיבוץ הזה (תגית {recommendedNotionSegment.tag.startsWith("#") ? recommendedNotionSegment.tag : `#${recommendedNotionSegment.tag}`}):
                </span>
                {recommendedNotionSegment.preview && <p className="text-xs text-brand-maroon/80 truncate">{recommendedNotionSegment.preview}</p>}
                <div className="flex items-center gap-2">
                  <a href={recommendedNotionSegment.pageUrl} target="_blank" rel="noreferrer" className="text-brand-maroon hover:underline text-xs">
                    פתיחה ב-Notion
                  </a>
                  <Link
                    href={`/posts/new?notionTag=${encodeURIComponent(recommendedNotionSegment.tag)}`}
                    className="rounded-md bg-brand-red px-2 py-1 text-white text-xs hover:bg-brand-red-dark"
                  >
                    + יצירת פוסט מהקטע הזה
                  </Link>
                </div>
              </div>
            )}


            {recommendedReelCandidate && (
              <div className="rounded-lg border border-brand-pink/20 bg-brand-pink/5 p-2 flex flex-col gap-1">
                <span className="text-[11px] text-brand-maroon/60">🎬 זה הריל שכדאי לייצר (מ&quot;המלצות לרילים הבאים&quot; בדשבורד):</span>
                <a href={recommendedReelCandidate.permalink} target="_blank" rel="noreferrer" className="text-brand-maroon hover:underline text-xs truncate">
                  {recommendedReelCandidate.caption ?? "(ללא כיתוב)"}
                </a>
                <span className="text-[11px] text-brand-maroon/50" dir="ltr">
                  👁 {recommendedReelCandidate.viewsCount ?? "—"} · ❤️ {recommendedReelCandidate.likesCount ?? "—"} · 💬{" "}
                  {recommendedReelCandidate.commentsCount ?? "—"}
                </span>
                {recommendedReelCandidate.postId ? (
                  <Link
                    href={`/posts/${recommendedReelCandidate.postId}`}
                    className="self-start rounded-md bg-brand-red px-2 py-1 text-white text-xs hover:bg-brand-red-dark"
                  >
                    + הוסיפי ריל לתוכן הזה
                  </Link>
                ) : (
                  <span className="text-[11px] text-brand-maroon/40">התוכן לא מקושר לפוסט בכלי — אין אפשרות להוסיף ריל ישירות מכאן</span>
                )}
              </div>
            )}

            <button type="button" onClick={ensurePicker} className="self-start rounded-md border border-brand-pink/20 bg-white px-2 py-1 text-xs hover:bg-brand-pink/10">
              שיבוץ קטע מנושיין...
            </button>
            {pickerOpen && (
              <div className="rounded-md border border-brand-pink/20 bg-white p-1.5 max-h-40 overflow-y-auto">
                {notionTagsLoading && <span className="text-brand-maroon/50 text-xs">טוענת רשימת נושיין...</span>}
                {!notionTagsLoading && notionTags?.length === 0 && <span className="text-brand-maroon/50 text-xs">אין קטעים &quot;מוכן&quot; בנושיין כרגע</span>}
                {!notionTagsLoading &&
                  notionTags?.map((item) => (
                    <button
                      key={item.tag}
                      type="button"
                      onClick={() => selectNotionTagAsContent(item.tag)}
                      title={item.alreadyScheduled ? "כבר משובץ ליום אחר — בחירה כאן תשבץ אותו גם כאן" : undefined}
                      className="block w-full text-right rounded-md px-1 py-1 text-xs hover:bg-brand-pink/10 truncate"
                    >
                      {item.tag.startsWith("#") ? item.tag : `#${item.tag}`}
                      {item.typeValues.length > 0 && <span className="text-brand-maroon/40"> · {item.typeValues.join(", ")}</span>}
                      {item.alreadyScheduled && <span className="text-amber-600"> · ✓ משובץ</span>}
                    </button>
                  ))}
              </div>
            )}

            {manualType === "instagram_reel" && (
              <>
                <button type="button" onClick={ensureReelPicker} className="self-start rounded-md border border-brand-pink/20 bg-white px-2 py-1 text-xs hover:bg-brand-pink/10">
                  בחר מהרילים הבאים...
                </button>
                {reelPickerOpen && (
                  <div className="rounded-md border border-brand-pink/20 bg-white p-1.5 max-h-40 overflow-y-auto">
                    {reelCandidatesLoading && <span className="text-brand-maroon/50 text-xs">טוענת המלצות...</span>}
                    {!reelCandidatesLoading && reelCandidates?.length === 0 && <span className="text-brand-maroon/50 text-xs">אין כרגע מועמדים פנויים</span>}
                    {!reelCandidatesLoading &&
                      reelCandidates?.map((c) => (
                        <button
                          key={c.mediaId}
                          type="button"
                          onClick={() => selectReelCandidate(c.mediaId)}
                          className="block w-full text-right rounded-md px-1 py-1 text-xs hover:bg-brand-pink/10 truncate"
                        >
                          {c.caption ?? "(ללא כיתוב)"}
                          <span className="text-brand-maroon/40" dir="ltr">
                            {" "}
                            · 👁 {c.viewsCount ?? "—"} · ❤️ {c.likesCount ?? "—"} · 💬 {c.commentsCount ?? "—"}
                          </span>
                        </button>
                      ))}
                  </div>
                )}
              </>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-brand-pink/20">
          {target.mode === "existing" ? (
            <button type="button" onClick={deleteExisting} disabled={busy} className="text-xs text-brand-red hover:underline">
              מחיקת השיבוץ
            </button>
          ) : (
            <button
              type="button"
              onClick={() => createNew(null)}
              disabled={busy}
              className="rounded-lg bg-brand-red px-3 py-1.5 text-white text-xs font-medium hover:bg-brand-red-dark disabled:opacity-50"
            >
              יצירת שיבוץ ריק בשעה זו
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
