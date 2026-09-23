import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { parseCalendarDate } from "@/lib/weeklySchedule";

const patchSchema = z.object({
  hour: z.number().int().min(0).max(23).optional(),
  // תאריך חדש (YYYY-MM-DD) — להעברת השיבוץ לשבוע אחר, ראו parseCalendarDate.
  date: z.string().optional(),
  platformContentId: z.string().nullable().optional(),
  note: z.string().nullable().optional(),
  actualStatus: z.enum(["pending", "done", "skipped"]).optional(),
  // נעילה/שחרור מפורש (ראו כפתור "נעלי"/"בטלי נעילה") — אם לא סופק, כל
  // עדכון אחר עדיין "נועל" אותו כברירת מחדל (התנהגות קיימת, ראו למטה).
  isManual: z.boolean().optional(),
});

/**
 * כל עדכון ידני לסלוט קיים "נועל" אותו (isManual=true) כברירת מחדל — לא
 * יימחק/יידרס ברענון הצעה. isManual בבקשה עוקף את זה במפורש (למשל "בטלי
 * נעילה" שולח isManual:false בלי לשנות שום שדה אחר, כדי שהשיבוץ יחזור
 * להיות חלק מהרענון האוטומטי הבא).
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const { actualStatus, isManual, date, ...rest } = parsed.data;

  const updated = await prisma.scheduledSlot.update({
    where: { id },
    data: {
      ...rest,
      ...(date !== undefined ? { date: parseCalendarDate(date) } : {}),
      isManual: isManual !== undefined ? isManual : true,
      // actualAt נקבע כאן לפי "עכשיו", לא מתקבל מהלקוח — זה זמן הסימון, לא ניסיון לתעד שעת פרסום מדויקת בפועל.
      ...(actualStatus !== undefined ? { actualStatus, actualAt: actualStatus === "done" ? new Date() : null } : {}),
    },
  });

  return NextResponse.json({ slot: updated });
}

export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  await prisma.scheduledSlot.delete({ where: { id } });
  return NextResponse.json({ ok: true });
}
