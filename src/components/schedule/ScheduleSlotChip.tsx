"use client";

import { PLATFORM_LABELS } from "@/lib/labels";
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
  const emptyLabel = notionTagLabel ?? (slot.recommendedType ? RECOMMENDED_TYPE_SHORT_LABELS[slot.recommendedType] ?? "ריק" : "ריק");
  const candidate = slot.recommendedReelCandidate;

  return (
    <button
      type="button"
      onClick={onClick}
      title={content?.text ?? notionSegment?.preview ?? slot.note ?? candidate?.caption ?? "אין תוכן מוכן לשעה הזו — לחצי לשיבוץ או ליצירה"}
      className={`w-full h-full rounded-md px-1.5 py-1 text-right text-[11px] leading-tight overflow-hidden transition-colors ${
        content
          ? "bg-brand-pink/70 text-brand-maroon hover:bg-brand-pink"
          : "bg-brand-pink/15 text-brand-maroon/60 border border-dashed border-brand-pink/40 hover:bg-brand-pink/25"
      } ${slot.actualStatus === "done" ? "ring-2 ring-green-400" : slot.actualStatus === "skipped" ? "ring-2 ring-red-300 opacity-70" : ""}`}
    >
      <div className="flex items-center justify-between gap-0.5">
        <span className="truncate">{content ? PLATFORM_LABELS[content.type] ?? content.type : emptyLabel}</span>
        <span className="shrink-0 flex items-center gap-0.5">
          {slot.actualStatus === "done" && <span title="עלה בפועל">✅</span>}
          {slot.actualStatus === "skipped" && <span title="לא עלה בפועל">❌</span>}
          {slot.hourIsStrong && <span>⚡</span>}
          {!content && slot.recommendedFormat === "letter" && <span title="הרבה זמן בלי מכתב">✉️</span>}
          {!content && slot.recommendedFormat === "tip" && <span title="הרבה זמן בלי טיפ">💡</span>}
          {!slot.isManual && <span className="opacity-60">🤖</span>}
        </span>
      </div>
      {content?.text && <div className="truncate opacity-80">{content.text}</div>}
      {!content && notionSegment && <div className="truncate opacity-80">📓 {notionSegment.preview || notionTagLabel}</div>}
      {!content && !notionSegment && slot.note && <div className="truncate opacity-80">📝 {slot.note}</div>}
      {!content && !notionSegment && !slot.note && candidate && <div className="truncate opacity-80">🎬 {candidate.caption ?? "(ללא כיתוב)"}</div>}
      {!content && !notionSegment && !slot.note && !candidate && <div className="truncate opacity-70">אין מוכן ברשימה</div>}
    </button>
  );
}
