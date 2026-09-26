import Link from "next/link";
import { getWeekPlan, getWeekStart, formatCalendarDate, parseCalendarDate } from "@/lib/weeklySchedule";
import ScheduleBoard from "@/components/schedule/ScheduleBoard";
import WideScheduleLayout from "@/components/schedule/WideScheduleLayout";
import ScheduleNavArrows from "@/components/schedule/ScheduleNavArrows";

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
      <ScheduleNavArrows
        prevHref={`/schedule/week?week=${prevWeek}`}
        nextHref={`/schedule/week?week=${nextWeek}`}
        prevLabel="שבוע קודם"
        nextLabel="שבוע הבא"
      />
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
          <Link href={`/schedule/week?week=${thisWeek}`} className="rounded-lg border border-brand-pink/40 px-3 py-1.5 text-sm hover:bg-brand-pink/10">
            השבוע
          </Link>
        </div>

        <ScheduleBoard key={plan.weekStart} plan={plan} />
      </div>
    </WideScheduleLayout>
  );
}
