import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { parseCalendarDate } from "@/lib/weeklySchedule";

const createSchema = z.object({
  date: z.string(),
  hour: z.number().int().min(0).max(23),
  platformContentId: z.string().nullable().optional(),
  // שם/הערה חופשיים לסלוט בלי תוכן בכלי — למשל קטע שעדיין בעבודה במקום חוץ
  // (Notion וכו') ולא הוכן/יובא לכלי עדיין, אבל היא רוצה לשמור לו את המקום.
  note: z.string().nullable().optional(),
});

/** יוצרת סלוט חדש בתכנון — תמיד ידני (מה שהמשתמשת משבצת בעצמה, בניגוד להצעה האוטומטית). */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const created = await prisma.scheduledSlot.create({
    data: {
      date: parseCalendarDate(parsed.data.date),
      hour: parsed.data.hour,
      platformContentId: parsed.data.platformContentId ?? null,
      note: parsed.data.note ?? null,
      isManual: true,
    },
  });

  return NextResponse.json({ slot: created });
}
