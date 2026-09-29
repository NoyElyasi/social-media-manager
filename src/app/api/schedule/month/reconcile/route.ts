import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { reconcileMonth, getMonthStart } from "@/lib/monthlySchedule";

const bodySchema = z.object({ month: z.string(), force: z.boolean().optional() }); // "YYYY-MM"

/** כפתור "סנכרון בפועל" בלוח החודשי — ראו reconcileMonthWithInstagram. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }
  const monthStart = getMonthStart(new Date(`${parsed.data.month}-01T00:00:00.000Z`));
  const result = await reconcileMonth(monthStart, { force: parsed.data.force });
  return NextResponse.json({ result });
}
