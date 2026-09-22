import Link from "next/link";
import { getWeekPlan, getWeekStart, formatCalendarDate, parseCalendarDate } from "@/lib/weeklySchedule";
import ScheduleBoard from "@/components/schedule/ScheduleBoard";
import WideScheduleLayout from "@/components/schedule/WideScheduleLayout";

export const dynamic = "force-dynamic";

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

export default async function ScheduleWeekPage({ searchParams }: { searchParams: Promise<{ week?: string }> }) {
  const { week } = await searchParams;
  const base = week ? parseCalendarDate(week) : new Date();
  const weekStart = getWeekStart(base);
  const plan = await getWeekPlan(weekStart);

  const prevWeek = formatCalendarDate(addDays(weekStart, -7));
  const nextWeek = formatCalendarDate(addDays(weekStart, 7));
  const thisWeek = formatCalendarDate(getWeekStart(new Date()));
  const weekEndLabel = formatCalendarDate(addDays(weekStart, 6));
  const monthOfWeek = weekStart.toISOString().slice(0, 7);

  return (
    <WideScheduleLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <div>
            <Link href={`/schedule?month=${monthOfWeek}`} className="text-xs text-brand-maroon/50 hover:text-brand-red">
              ‹ חזרה לתצוגת חודש
            </Link>
            <h1 className="text-2xl font-bold text-brand-maroon">תכנון פרסום שבועי</h1>
            <p className="text-sm text-brand-maroon/60">
              {plan.weekStart} – {weekEndLabel}
            </p>
          </div>
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/schedule/week?week=${prevWeek}`} className="rounded-lg border border-brand-pink/40 px-3 py-1.5 hover:bg-brand-pink/10">
              ‹ שבוע קודם
            </Link>
            <Link href={`/schedule/week?week=${thisWeek}`} className="rounded-lg border border-brand-pink/40 px-3 py-1.5 hover:bg-brand-pink/10">
              השבוע
            </Link>
            <Link href={`/schedule/week?week=${nextWeek}`} className="rounded-lg border border-brand-pink/40 px-3 py-1.5 hover:bg-brand-pink/10">
              שבוע הבא ›
            </Link>
          </div>
        </div>

        <ScheduleBoard key={plan.weekStart} plan={plan} />

        <div className="flex justify-between">
          <Link
            href={`/schedule/week?week=${prevWeek}`}
            className="rounded-lg border border-brand-pink/40 bg-white px-4 py-2 text-brand-maroon text-sm font-medium hover:bg-brand-pink/10"
          >
            ‹ שבוע קודם
          </Link>
          <Link
            href={`/schedule/week?week=${nextWeek}`}
            className="rounded-lg bg-brand-red px-4 py-2 text-white text-sm font-medium hover:bg-brand-red-dark"
          >
            שבוע הבא ›
          </Link>
        </div>
      </div>
    </WideScheduleLayout>
  );
}
