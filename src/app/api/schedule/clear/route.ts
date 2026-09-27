import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { getWeekStart, parseCalendarDate, formatCalendarDate } from "@/lib/weeklySchedule";
import { israelDayAndHour } from "@/lib/reachInsights";

const bodySchema = z.object({ weekStart: z.string() });

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * מוחקת את כל התכנון (הצעה + שיבוצים ידניים) לשבוע נתון — לפי בקשה מפורשת
 * לאפס שבוע ולהתחיל מחדש. משאירה שיבוצים עם actualStatus שסומן בפועל
 * (done/skipped) — אלה עובדה שקרתה, לא הצעה שאפשר "לנקות". לא נוגעת בימים
 * שכבר עברו, ובתוך היום הנוכחי לא נוגעת בשעות שכבר עברו (למשל שיבוץ ל-9:00
 * כשכבר 15:00 — אפילו אם הוא עדיין pending) — לפי בקשה מפורשת.
 */
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }
  const weekStart = getWeekStart(parseCalendarDate(parsed.data.weekStart));
  const weekEnd = addDays(weekStart, 7);
  const today = parseCalendarDate(formatCalendarDate(new Date()));
  const currentHour = israelDayAndHour(new Date()).hour;
  const dayAfterToday = addDays(today, 1);
  const futureFrom = dayAfterToday > weekStart ? dayAfterToday : weekStart;

  const conditions: Array<Record<string, unknown>> = [];
  if (futureFrom < weekEnd) {
    conditions.push({ date: { gte: futureFrom, lt: weekEnd } });
  }
  if (today >= weekStart && today < weekEnd) {
    conditions.push({ date: today, hour: { gte: currentHour } });
  }

  const { count } =
    conditions.length > 0
      ? await prisma.scheduledSlot.deleteMany({
          where: { actualStatus: "pending", OR: conditions },
        })
      : { count: 0 };

  return NextResponse.json({ deleted: count, weekStart: formatCalendarDate(weekStart) });
}
