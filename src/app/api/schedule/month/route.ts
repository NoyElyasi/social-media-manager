import { NextRequest, NextResponse } from "next/server";
import { getMonthPlan, getMonthStart } from "@/lib/monthlySchedule";

export async function GET(req: NextRequest) {
  const monthParam = req.nextUrl.searchParams.get("month"); // "YYYY-MM"
  const base = monthParam ? new Date(`${monthParam}-01T00:00:00.000Z`) : new Date();
  const monthStart = getMonthStart(base);
  const plan = await getMonthPlan(monthStart);
  return NextResponse.json({ plan });
}
