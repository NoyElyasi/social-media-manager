import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { getMonthStart, addMonths } from "@/lib/monthlySchedule";
import { formatCalendarDate, parseCalendarDate } from "@/lib/weeklySchedule";

const bodySchema = z.object({ month: z.string() });

/**
 * מוחקת את כל התכנון (הצעה + שיבוצים ידניים) לחודש נתון — לפי בקשה מפורשת
 * לאפס חודש ולהתחיל מחדש. משאירה שיבוצים עם actualStatus שסומן בפועל
 * (done/skipped) — אלה עובדה שקרתה, לא הצעה שאפשר "לנקות".
 */
export async function DELETE(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }
  const monthStart = getMonthStart(new Date(`${parsed.data.month}-01T00:00:00.000Z`));
  const monthEnd = addMonths(monthStart, 1);
  // לא נוגעת בימים שכבר עברו — לפי בקשה מפורשת, "לנקות תכנון" הוא קדימה
  // בזמן בלבד, לא מוחק שיבוץ (אפילו pending) של יום שכבר קרה.
  const today = parseCalendarDate(formatCalendarDate(new Date()));
  const deleteFrom = today > monthStart ? today : monthStart;

  const { count } =
    deleteFrom < monthEnd
      ? await prisma.scheduledSlot.deleteMany({
          where: { date: { gte: deleteFrom, lt: monthEnd }, actualStatus: "pending" },
        })
      : { count: 0 };

  return NextResponse.json({ deleted: count });
}
