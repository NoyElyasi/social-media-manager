"use client";

import { PLATFORM_LABELS, postTypeStyle } from "@/lib/labels";
import type { WeekSlot } from "@/lib/weeklySchedule";

const RECOMMENDED_TYPE_SHORT_LABELS: Record<string, string> = {
  instagram_reel: "צריך ריל",
  instagram_carousel: "צריך פוסט",
};

/** "אירוע" קומפקטי בתא לוח השנה — לחיצה פותחת את הפאנל המלא לעריכה (ScheduleSlotEditorPanel). */
export default function ScheduleSlotChip({ slot, onClick }: { slot: WeekSlot; onClick: () => void }) {
  const content = slot.content;
  const notionSegment = slot.recommendedNotionSegment;
  const notionTagLabel = notionSegment ? (notionSegment.tag.startsWith("#") ? notionSegment.tag : `#${notionSegment.tag}`) : null;
  const candidate = slot.recommendedReelCandidate;
  // המלצת ריל מוצגת בכותרת עם שם/כיתוב הריל עצמו (כמו תגית נושיין) — לא "צריך
  // ריל" גנרי עם השם למטה, לפי בקשה מפורשת: לראות איזה ריל בלי לפתוח את הפופ-אפ.
  const reelLabel = candidate ? `🎬 ${candidate.caption ?? "(ללא כיתוב)"}` : null;
  const emptyLabel = notionTagLabel ?? reelLabel ?? (slot.recommendedType ? RECOMMENDED_TYPE_SHORT_LABELS[slot.recommendedType] ?? "ריק" : "ריק");
  // צבע לפי סוג (ריל מול קרוסלה) — כמו בנראות החודשית, ראו postTypeStyle. ⚡/❤️
  // כבר מוצגים למעלה על היום כולו (ScheduleBoard) — לא חוזרים על זה בכל פוסט.
  const effectiveType = content?.type ?? slot.recommendedType ?? null;
  const { solid, border } = postTypeStyle(effectiveType);

  return (
    <button
      type="button"
      onClick={onClick}
      title={content?.text ?? notionSegment?.preview ?? slot.note ?? candidate?.caption ?? "אין תוכן מוכן לשעה הזו — לחצי לשיבוץ או ליצירה"}
      className={`w-full h-full rounded-md px-1.5 py-1 text-right text-[11px] leading-tight overflow-hidden transition-colors ${solid} ${
        content ? "border border-transparent hover:brightness-95" : `border border-dashed ${border} opacity-90 hover:opacity-100`
      } ${slot.actualStatus === "done" ? "ring-2 ring-green-400" : slot.actualStatus === "skipped" ? "ring-2 ring-red-300 opacity-70" : ""}`}
    >
      <div className="flex items-center justify-between gap-0.5">
        <span className="truncate">{content ? PLATFORM_LABELS[content.type] ?? content.type : emptyLabel}</span>
        <span className="shrink-0 flex items-center gap-0.5">
          {slot.actualStatus === "done" && <span title="עלה בפועל">✅</span>}
          {slot.actualStatus === "skipped" && <span title="לא עלה בפועל">❌</span>}
          {!content && slot.recommendedFormat === "letter" && <span title="הרבה זמן בלי מכתב">✉️</span>}
          {!content && slot.recommendedFormat === "tip" && <span title="הרבה זמן בלי טיפ">💡</span>}
          {!slot.isManual && <span className="opacity-60">🤖</span>}
        </span>
      </div>
      {content?.text && <div className="truncate opacity-80">{content.text}</div>}
      {!content && notionSegment && <div className="truncate opacity-80">📓 {notionSegment.preview || notionTagLabel}</div>}
      {!content && !notionSegment && !candidate && slot.note && <div className="truncate opacity-80">📝 {slot.note}</div>}
      {!content && !notionSegment && !candidate && !slot.note && <div className="truncate opacity-70">אין מוכן ברשימה</div>}
    </button>
  );
}
