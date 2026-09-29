import { NextResponse } from "next/server";
import { listReadySegments } from "@/server/notion";
import { prisma } from "@/server/db";
import { normalizeTagText, formatCalendarDate, parseCalendarDate } from "@/lib/weeklySchedule";

/**
 * כל התגיות "מוכן" (Ready) בנושיין — לדרופ-דאון של שם/הערה ולבורר "שיבוץ
 * קטע מנושיין" בפאנל השיבוץ (ראו ScheduleSlotEditorPanel). מסמנת גם אילו
 * מהן כבר משובצות לסלוט עתידי שעוד ממתין (plannedNotionTag) — לא לסלוטים שעברו/בוצעו/דולגו —
 * כדי שלא תשובץ בטעות פעמיים.
 */
export async function GET() {
  const [rows, usedRows] = await Promise.all([
    listReadySegments(),
    prisma.scheduledSlot.findMany({
      where: { plannedNotionTag: { not: null }, actualStatus: "pending", date: { gte: parseCalendarDate(formatCalendarDate(new Date())) } },
      select: { plannedNotionTag: true, date: true },
      orderBy: { date: "asc" },
    }),
  ]);
  const scheduledDateByTag = new Map<string, string>();
  for (const r of usedRows) {
    const key = normalizeTagText(r.plannedNotionTag as string);
    if (!scheduledDateByTag.has(key)) scheduledDateByTag.set(key, formatCalendarDate(r.date));
  }
  return NextResponse.json({
    tags: rows.map((r) => ({ tag: r.tag, typeValues: r.typeValues, createdTime: r.createdTime, scheduledDate: scheduledDateByTag.get(normalizeTagText(r.tag)) ?? null })),
  });
}
