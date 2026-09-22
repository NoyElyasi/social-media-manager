import Link from "next/link";
import { getMonthPlan, getMonthStart, addMonths } from "@/lib/monthlySchedule";
import MonthBoard from "@/components/schedule/MonthBoard";
import WideScheduleLayout from "@/components/schedule/WideScheduleLayout";

export const dynamic = "force-dynamic";

export default async function SchedulePage({ searchParams }: { searchParams: Promise<{ month?: string }> }) {
  const { month } = await searchParams;
  const base = month ? new Date(`${month}-01T00:00:00.000Z`) : new Date();
  const monthStart = getMonthStart(base);
  const plan = await getMonthPlan(monthStart);

  const prevMonth = addMonths(monthStart, -1).toISOString().slice(0, 7);
  const nextMonth = addMonths(monthStart, 1).toISOString().slice(0, 7);
  const thisMonth = getMonthStart(new Date()).toISOString().slice(0, 7);

  return (
    <WideScheduleLayout>
      <div className="flex flex-col gap-6">
        <div className="flex items-center justify-between flex-wrap gap-3">
          <h1 className="text-2xl font-bold text-brand-maroon">{plan.monthLabel}</h1>
          <div className="flex items-center gap-2 text-sm">
            <Link href={`/schedule?month=${prevMonth}`} className="rounded-lg border border-brand-pink/40 px-3 py-1.5 hover:bg-brand-pink/10">
              ‹ חודש קודם
            </Link>
            <Link href={`/schedule?month=${thisMonth}`} className="rounded-lg border border-brand-pink/40 px-3 py-1.5 hover:bg-brand-pink/10">
              החודש
            </Link>
            <Link href={`/schedule?month=${nextMonth}`} className="rounded-lg border border-brand-pink/40 px-3 py-1.5 hover:bg-brand-pink/10">
              חודש הבא ›
            </Link>
          </div>
        </div>

        <MonthBoard key={plan.monthStart} plan={plan} />
      </div>
    </WideScheduleLayout>
  );
}
