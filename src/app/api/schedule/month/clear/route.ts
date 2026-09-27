import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { getMonthStart, addMonths } from "@/lib/monthlySchedule";
import { formatCalendarDate, parseCalendarDate } from "@/lib/weeklySchedule";
import { israelDayAndHour } from "@/lib/reachInsights";

const bodySchema = z.object({ month: z.string() });

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * מוחקת את כל התכנון (הצעה + שיבוצים ידניים) לחודש נתון — לפי בקשה מפורשת
 * לאפס חודש ולהתחיל מחדש. משאירה שיבוצים עם actualStatus שסומן בפועל
 * (done/skipped) — אלה עובדה שקרתה, לא הצעה שאפשר "לנקות". גם לא נוגעת
 * בשיבוצים נעולים (isManual) — נעילה אמורה להגן מכל שינוי אוטומטי, כולל
 * ניקוי גורף, לא רק מרענון הצעה. לא נוגעת בימים שכבר עברו, ובתוך היום
 * הנוכחי לא נוגעת בשעות שכבר עברו (למשל שיבוץ ל-9:00 כשכבר 15:00 — אפילו
 * אם הוא עדיין pending) — לפי בקשה מפורשת.
 */
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }
  const monthStart = getMonthStart(new Date(`${parsed.data.month}-01T00:00:00.000Z`));
  const monthEnd = addMonths(monthStart, 1);
  const today = parseCalendarDate(formatCalendarDate(new Date()));
  const currentHour = israelDayAndHour(new Date()).hour;
  const dayAfterToday = addDays(today, 1);
  const futureFrom = dayAfterToday > monthStart ? dayAfterToday : monthStart;

  const conditions: Array<Record<string, unknown>> = [];
  if (futureFrom < monthEnd) {
    conditions.push({ date: { gte: futureFrom, lt: monthEnd } });
  }
  if (today >= monthStart && today < monthEnd) {
    conditions.push({ date: today, hour: { gte: currentHour } });
  }

  const { count } =
    conditions.length > 0
      ? await prisma.scheduledSlot.deleteMany({
          where: { actualStatus: "pending", isManual: false, OR: conditions },
        })
      : { count: 0 };

  return NextResponse.json({ deleted: count });
}
