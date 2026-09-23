"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import type { MonthPlan } from "@/lib/monthlySchedule";
import { postTypeStyle } from "@/lib/labels";

const FORMAT_LABELS: Record<string, string> = { letter: "✉️ מכתב", tip: "💡 טיפ" };
const WEEKDAY_SHORT = ["א׳", "ב׳", "ג׳", "ד׳", "ה׳", "ו׳", "ש׳"];
// כמו formatAngleLabel ב-reachInsights.ts, אבל משוכפל בכוונה — לא ניתן לייבא
// מ-reachInsights.ts לרכיב לקוח (הוא מייבא את prisma, שלא בונה בדפדפן).
const CONTENT_ANGLE_FORMAT_LABELS: Record<string, string> = { letter: "מכתב", tip: "טיפ", regular: "רגיל" };
function formatAngleLabel(format: string): string {
  return CONTENT_ANGLE_FORMAT_LABELS[format] ?? format;
}

// UTC calendar-date "today", כמו כל התאריכים בתכנון (ראו weeklySchedule.ts) — לא רגיש לאזור זמן.
function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function slotIcon(type: string | null): string {
  if (type === "instagram_reel") return "🎬";
  if (type === "instagram_carousel") return "📄";
  return "•";
}

// צבע לפי סוג — כדי שהתגית תיראה בבירור על רקע לבן (לא נבלעת), לא רק אייקון עדין. ראו postTypeStyle (משותף עם הנראות השבועית).
function slotStyle(type: string | null): string {
  return postTypeStyle(type).solid;
}

export default function MonthBoard({ plan }: { plan: MonthPlan }) {
  const router = useRouter();
  const [generating, setGenerating] = useState(false);
  const [reconciling, setReconciling] = useState(false);
  const [reconcileSummary, setReconcileSummary] = useState<string | null>(null);
  const monthKey = plan.monthStart.slice(0, 7);
  const today = todayIso();

  async function handleGenerate() {
    setGenerating(true);
    await fetch("/api/schedule/month/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: monthKey }),
    });
    setGenerating(false);
    router.refresh();
  }

  /** "סנכרון בפועל" — מתאימה בין מה שכבר פורסם באינסטגרם (מהמטמון הקיים) לבין הלוח, ראו reconcileMonthWithInstagram. */
  async function handleReconcile() {
    setReconciling(true);
    setReconcileSummary(null);
    const res = await fetch("/api/schedule/month/reconcile", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ month: monthKey }),
    });
    const data = await res.json();
    const r = data.result;
    setReconcileSummary(
      r
        ? r.checkedDays === 0
          ? "כל הימים שעברו החודש כבר נבדקו — אין חדש"
          : `נבדקו ${r.checkedDays} ימים — ${r.matchedSlots} שיבוצים עודכנו, ${r.createdSlots} נוספו, ${r.formatsClassified} סווגו לפי נושיין`
        : "שגיאה בסנכרון"
    );
    setReconciling(false);
    router.refresh();
  }

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
            הצעה לחודש: <b>{plan.summary.totalPosts}</b> פוסטים ({plan.summary.reels} רילים) — <b>{plan.summary.existingReady}</b> עם תוכן מוכן,{" "}
            <b>{plan.summary.newNeeded}</b> צריך להכין.
          </span>
          <span className="flex gap-3">
            {plan.formatAlerts.map((a) => (
              <span key={a.format} className={a.isBehind ? "text-amber-700 font-medium" : "text-brand-maroon/50"}>
                {FORMAT_LABELS[a.format]} החודש: {a.monthCount}/{a.target}
                {a.isBehind ? " — מאחורי הקצב" : ""}
              </span>
            ))}
          </span>
        </div>
        <div className="flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={handleReconcile}
              disabled={reconciling}
              title="בודקת את הימים שעברו החודש מול מה שכבר פורסם באינסטגרם (מהמטמון הקיים בדשבורד) ומסמנת/משלימה בלוח"
              className="rounded-lg border border-brand-pink/40 bg-white px-4 py-2 text-brand-maroon text-sm font-medium hover:bg-brand-pink/10 disabled:opacity-50"
            >
              {reconciling ? "מסנכרנת..." : "🔄 סנכרון בפועל"}
            </button>
            <button
              type="button"
              onClick={handleGenerate}
              disabled={generating}
              className="rounded-lg bg-brand-red px-4 py-2 text-white text-sm font-medium hover:bg-brand-red-dark disabled:opacity-50"
            >
              {generating ? "מייצרת הצעה לחודש..." : "צרי/רענני הצעה לכל החודש"}
            </button>
          </div>
          {reconcileSummary && <span className="text-[11px] text-brand-maroon/60">{reconcileSummary}</span>}
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

      <div className="grid grid-cols-7 gap-1 text-center text-xs text-brand-maroon/50">
        {WEEKDAY_SHORT.map((w) => (
          <div key={w}>{w}</div>
        ))}
      </div>

      <div className="flex flex-col gap-2">
        {plan.weeks.map((week) => {
          const isCurrentWeek = week.days.some((d) => d.date === today);
          return (
            <div
              key={week.weekStart}
              className={`rounded-xl border p-3 flex flex-col gap-2 ${
                isCurrentWeek ? "border-brand-red/50 bg-brand-red/5" : "border-brand-pink/30 bg-white"
              }`}
            >
              <div className="grid grid-cols-7 gap-1.5">
                {week.days.map((day) => {
                  const inMonth = day.date.slice(0, 7) === monthKey;
                  const isPast = day.date < today;
                  const isToday = day.date === today;
                  return (
                    <div
                      key={day.date}
                      className={`rounded-lg border p-2 min-h-[104px] flex flex-col gap-1 text-[11px] ${
                        !inMonth
                          ? "border-transparent bg-brand-pink/5 opacity-50"
                          : day.isStrong
                            ? "border-green-200 bg-green-50"
                            : "border-brand-pink/20 bg-white"
                      } ${isPast ? "opacity-40" : ""} ${isToday ? "ring-2 ring-brand-red" : ""}`}
                    >
                      <div className="flex items-center justify-between">
                        <span className="font-semibold text-brand-maroon">{Number(day.date.slice(8, 10))}</span>
                        <div className="flex items-center gap-1">
                          {day.isStrong && <span title="הרבה חשיפה">⚡</span>}
                          {day.isEngaging && <span title="הרבה אנגייג'מנט">❤️</span>}
                          {/* נקודה כחולה קטנה במקום תג מלא עם הטקסט — שם החג מוצג רק בהעברת עכבר, כדי לא לתפוס מקום. בועית מותאמת ולא ה-title המובנה של הדפדפן, כי הוא לא היה נראה טוב על אלמנט כה קטן. */}
                          {day.specialDays.map((sd) => (
                            <span key={sd.title} className="group relative inline-block">
                              <span className="inline-block h-2 w-2 shrink-0 rounded-full bg-blue-500" />
                              <span className="pointer-events-none absolute bottom-full right-1/2 z-20 mb-1 hidden translate-x-1/2 whitespace-nowrap rounded-md bg-brand-maroon px-2 py-1 text-[10px] text-white group-hover:block">
                                {sd.title}
                              </span>
                            </span>
                          ))}
                        </div>
                      </div>
                      {day.blockedDayId && <span className="truncate rounded bg-neutral-200 px-1 text-neutral-700">🚫 חסום</span>}
                      {day.slots.map((slot, si) => (
                        <span
                          key={si}
                          className={`truncate rounded px-1.5 py-0.5 text-xs font-medium ${slotStyle(slot.type)}`}
                          title={slot.tag ?? undefined}
                        >
                          {slotIcon(slot.type)} {slot.tag ?? (slot.type === "instagram_reel" ? "צריך ריל" : slot.type === "instagram_carousel" ? "צריך פוסט" : "ריק")}
                        </span>
                      ))}
                    </div>
                  );
                })}
              </div>
              <div className="flex items-center justify-between text-xs text-brand-maroon/60 px-1">
                <span>
                  {week.totalPosts} פוסטים ({week.reels} רילים) — {week.existingReady} מוכן, {week.newNeeded} חדש
                </span>
                <Link href={`/schedule/week?week=${week.weekStart}`} className="rounded-lg border border-brand-pink/40 px-2 py-1 hover:bg-brand-pink/10">
                  פתיחת השבוע ›
                </Link>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
