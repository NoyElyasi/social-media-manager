"use client";

import { Fragment, useState } from "react";
import { useRouter } from "next/navigation";
import type { WeekPlan } from "@/lib/weeklySchedule";
import ScheduleSlotChip from "./ScheduleSlotChip";
import ScheduleSlotEditorPanel, { type EditorTarget } from "./ScheduleSlotEditorPanel";
import BlockedDayToggle from "./BlockedDayToggle";

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const ROW_H = 42;
const HOUR_BUCKET_STARTS = [0, 4, 8, 12, 16, 20];
const FORMAT_LABELS: Record<string, string> = { letter: "✉️ מכתב", tip: "💡 טיפ" };
// כמו formatAngleLabel ב-reachInsights.ts, אבל משוכפל בכוונה — לא ניתן לייבא
// מ-reachInsights.ts לרכיב לקוח (הוא מייבא את prisma, שלא בונה בדפדפן).
const CONTENT_ANGLE_FORMAT_LABELS: Record<string, string> = { letter: "מכתב", tip: "טיפ", regular: "רגיל" };
function formatAngleLabel(format: string): string {
  return CONTENT_ANGLE_FORMAT_LABELS[format] ?? format;
}

export default function ScheduleBoard({ plan }: { plan: WeekPlan }) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [target, setTarget] = useState<EditorTarget | null>(null);

  async function handleGenerate() {
    setGenerating(true);
    await fetch("/api/schedule/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ weekStart: plan.weekStart }),
    });
    setGenerating(false);
    router.refresh();
  }

  const strongHourLabels = plan.strength.hourBuckets.filter((b) => b.isStrong).map((b) => b.name);

  return (
    <div className="flex flex-col gap-4">
      <div className="flex items-center justify-between rounded-xl border border-brand-pink/30 bg-white p-4 flex-wrap gap-3">
        <div className="text-sm text-brand-maroon/80 flex flex-col gap-1">
          {plan.topAngles.length > 0 && (
            <span className="text-brand-maroon font-medium">
              🎯 מוביל כרגע:{" "}
              {plan.topAngles.map((a) => `${a.theme} (${formatAngleLabel(a.format)}, הגעה ממוצעת ${Math.round(a.avgReach ?? 0)})`).join(" · ")}
            </span>
          )}
          <span>
            הצעה לשבוע: <b>{plan.summary.totalPosts}</b> פוסטים ({plan.summary.reels} רילים) — <b>{plan.summary.existingReady}</b> עם תוכן מוכן,{" "}
            <b>{plan.summary.newNeeded}</b> צריך להכין (לפי הכלל: שני פוסטים חדשים ואחד ישן בשבוע, ריל גג שניים).
          </span>
          {strongHourLabels.length > 0 && <span className="text-brand-maroon/60">שעות חזקות השבוע: {strongHourLabels.join(", ")}</span>}
          <span className="flex gap-2">
            {plan.formatAlerts.map((a) => (
              <span key={a.format} className={a.isBehind ? "text-amber-700 font-medium" : "text-brand-maroon/50"}>
                {FORMAT_LABELS[a.format]} החודש: {a.monthCount}/{a.target}
                {a.isBehind ? " — מאחורי הקצב" : ""}
              </span>
            ))}
          </span>
        </div>
        <div className="flex items-center gap-2">
          {plan.summary.existingReady > 0 ? (
            <a
              href={`/api/schedule/download-zip?weekStart=${plan.weekStart}`}
              className="rounded-lg border border-brand-pink/40 bg-white px-4 py-2 text-brand-maroon text-sm font-medium hover:bg-brand-pink/10"
            >
              📦 הורדת תכני השבוע
            </a>
          ) : (
            <button
              type="button"
              disabled
              title="עוד אין תוכן משובץ להוריד — שבצי תוכן קיים באחד הסלוטים"
              className="rounded-lg border border-brand-pink/40 bg-white px-4 py-2 text-brand-maroon/40 text-sm font-medium cursor-not-allowed"
            >
              📦 הורדת תכני השבוע
            </button>
          )}
          <button
            type="button"
            onClick={handleGenerate}
            disabled={generating}
            className="rounded-lg bg-brand-red px-4 py-2 text-white text-sm font-medium hover:bg-brand-red-dark disabled:opacity-50"
          >
            {generating ? "מייצרת הצעה..." : "צרי/רענני הצעה לשבוע"}
          </button>
        </div>
      </div>

      <details className="rounded-lg border border-brand-pink/30 bg-white">
        <summary className="cursor-pointer text-sm font-medium text-brand-maroon p-3">🧮 על סמך מה נבחרו הימים/השעות/הפורמט?</summary>
        <ul className="flex flex-col gap-1.5 p-3 pt-0 text-xs text-brand-maroon/70 list-disc pr-4">
          {plan.methodology.map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
      </details>

      <div className="rounded-xl border border-brand-pink/30 bg-white overflow-auto max-h-[75vh]">
        <div className="grid" style={{ gridTemplateColumns: `60px repeat(7, minmax(150px, 1fr))` }}>
          <div className="sticky top-0 right-0 z-30 bg-white border-b border-s border-brand-pink/20" />

          {plan.days.map((day, i) => (
            <div
              key={day.date}
              className={`sticky top-0 z-20 border-b border-brand-pink/20 p-2 flex flex-col gap-1 ${
                plan.strength.days[i]?.isStrong ? "bg-green-50" : "bg-white"
              }`}
            >
              <div className="flex items-center justify-between">
                <span className="text-sm font-semibold text-brand-maroon">{day.label}</span>
                <span className="text-xs text-brand-maroon/50">{day.date.slice(5)}</span>
              </div>
              {plan.strength.days[i]?.isStrong && <span className="text-[10px] text-green-700">⚡ יום חזק</span>}
              {day.specialDays.map((sd) => (
                <span
                  key={sd.title}
                  className={`truncate rounded px-1 py-0.5 text-[10px] ${sd.isMajor ? "bg-amber-100 text-amber-800" : "bg-blue-50 text-blue-700"}`}
                >
                  {sd.isMajor ? "🕎" : "📌"} {sd.title}
                </span>
              ))}
              <BlockedDayToggle date={day.date} blockedDayId={day.blockedDayId} note={day.blockedNote} />
            </div>
          ))}

          {HOURS.map((hour) => {
            const bucketStart = HOUR_BUCKET_STARTS.filter((s) => hour >= s).pop() ?? 0;
            const isHourStrong = plan.strength.hourBuckets.find((b) => b.startHour === bucketStart)?.isStrong ?? false;
            return (
              <Fragment key={hour}>
                <div
                  className={`sticky right-0 z-10 bg-white border-s border-t border-brand-pink/10 text-[11px] px-1.5 flex items-center justify-end ${
                    isHourStrong ? "text-amber-600 font-medium" : "text-brand-maroon/40"
                  }`}
                  style={{ height: ROW_H }}
                >
                  {String(hour).padStart(2, "0")}:00
                </div>
                {plan.days.map((day) => {
                  const cellSlots = plan.slots.filter((s) => s.date === day.date && s.hour === hour);
                  return (
                    <div key={`${day.date}-${hour}`} className="border-t border-brand-pink/10 p-0.5 flex gap-0.5" style={{ height: ROW_H }}>
                      {cellSlots.length > 0 ? (
                        cellSlots.map((slot) => (
                          <div key={slot.slotId ?? `${slot.date}-${slot.hour}`} className="flex-1 min-w-0">
                            <ScheduleSlotChip slot={slot} onClick={() => setTarget({ mode: "existing", slot })} />
                          </div>
                        ))
                      ) : (
                        <button
                          type="button"
                          onClick={() => setTarget({ mode: "new", date: day.date, dayLabel: day.label, hour })}
                          className="w-full h-full rounded hover:bg-brand-pink/10 text-transparent hover:text-brand-pink/50 text-[11px] flex items-center justify-center"
                        >
                          +
                        </button>
                      )}
                    </div>
                  );
                })}
              </Fragment>
            );
          })}
        </div>
      </div>

      {target && <ScheduleSlotEditorPanel target={target} onClose={() => setTarget(null)} />}
    </div>
  );
}
