import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { getWeekStart, parseCalendarDate, reconcileScheduleWithInstagram } from "@/lib/weeklySchedule";

const bodySchema = z.object({ weekStart: z.string(), force: z.boolean().optional() });

/** כפתור "בדיקה חוזרת לשבוע" — מסנכרנת בפועל את השבוע הזה בלבד, גם ימים שכבר נבדקו. */
export async function POST(req: NextRequest) {
  const parsed = bodySchema.safeParse(await req.json().catch(() => ({})));
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }
  const weekStart = getWeekStart(parseCalendarDate(parsed.data.weekStart));
  const weekEnd = new Date(weekStart);
  weekEnd.setUTCDate(weekEnd.getUTCDate() + 7);
  const result = await reconcileScheduleWithInstagram(weekStart, weekEnd, { force: parsed.data.force });
  return NextResponse.json({ result });
}
