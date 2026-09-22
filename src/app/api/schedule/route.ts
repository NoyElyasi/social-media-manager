import { NextRequest, NextResponse } from "next/server";
import { getWeekPlan, getWeekStart, parseCalendarDate } from "@/lib/weeklySchedule";

export async function GET(req: NextRequest) {
  const weekStartParam = req.nextUrl.searchParams.get("weekStart");
  const base = weekStartParam ? parseCalendarDate(weekStartParam) : new Date();
  const weekStart = getWeekStart(base);
  const plan = await getWeekPlan(weekStart);
  return NextResponse.json({ plan });
}
