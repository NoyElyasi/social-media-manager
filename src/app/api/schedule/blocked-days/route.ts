import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { parseCalendarDate } from "@/lib/weeklySchedule";

const createSchema = z.object({
  date: z.string(),
  note: z.string().nullable().optional(),
});

export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const created = await prisma.blockedDay.create({
    data: { date: parseCalendarDate(parsed.data.date), note: parsed.data.note ?? null },
  });

  return NextResponse.json({ blockedDay: created });
}
