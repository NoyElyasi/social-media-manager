import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { generateMonthlySchedule, getMonthStart } from "@/lib/monthlySchedule";

const bodySchema = z.object({ month: z.string() }); // "YYYY-MM"

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }
  const monthStart = getMonthStart(new Date(`${parsed.data.month}-01T00:00:00.000Z`));
  const plan = await generateMonthlySchedule(monthStart);
  return NextResponse.json({ plan });
}
