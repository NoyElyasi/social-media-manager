import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { getWeekStart, parseCalendarDate, formatCalendarDate } from "@/lib/weeklySchedule";

const bodySchema = z.object({ weekStart: z.string() });

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/**
 * מוחקת את כל התכנון (הצעה + שיבוצים ידניים) לשבוע נתון — לפי בקשה מפורשת
 * לאפס שבוע ולהתחיל מחדש. משאירה שיבוצים עם actualStatus שסומן בפועל
 * (done/skipped) — אלה עובדה שקרתה, לא הצעה שאפשר "לנקות".
 */
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }
  const weekStart = getWeekStart(parseCalendarDate(parsed.data.weekStart));
  const weekEnd = addDays(weekStart, 7);
  // לא נוגעת בימים שכבר עברו — לפי בקשה מפורשת, "לנקות תכנון" הוא קדימה
  // בזמן בלבד, לא מוחק שיבוץ (אפילו pending) של יום שכבר קרה.
  const today = parseCalendarDate(formatCalendarDate(new Date()));
  const deleteFrom = today > weekStart ? today : weekStart;

  const { count } =
    deleteFrom < weekEnd
      ? await prisma.scheduledSlot.deleteMany({
          where: { date: { gte: deleteFrom, lt: weekEnd }, actualStatus: "pending" },
        })
      : { count: 0 };

  return NextResponse.json({ deleted: count, weekStart: formatCalendarDate(weekStart) });
}
