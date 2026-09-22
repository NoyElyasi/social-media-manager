import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { generateWeeklySchedule, getWeekStart, parseCalendarDate } from "@/lib/weeklySchedule";

const bodySchema = z.object({ weekStart: z.string() });

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }
  const weekStart = getWeekStart(parseCalendarDate(parsed.data.weekStart));
  const plan = await generateWeeklySchedule(weekStart);
  return NextResponse.json({ plan });
}
