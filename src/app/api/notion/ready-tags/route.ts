import { NextResponse } from "next/server";
import { listReadySegments } from "@/server/notion";
import { prisma } from "@/server/db";
import { normalizeTagText } from "@/lib/weeklySchedule";

/**
 * כל התגיות "מוכן" (Ready) בנושיין — לדרופ-דאון של שם/הערה ולבורר "שיבוץ
 * קטע מנושיין" בפאנל השיבוץ (ראו ScheduleSlotEditorPanel). מסמנת גם אילו
 * מהן כבר משובצות לסלוט קיים (plannedNotionTag), כדי שלא תשובץ בטעות פעמיים.
 */
export async function GET() {
  const [rows, usedRows] = await Promise.all([
    listReadySegments(),
    prisma.scheduledSlot.findMany({ where: { plannedNotionTag: { not: null } }, select: { plannedNotionTag: true } }),
  ]);
  const usedTags = new Set(usedRows.map((r) => normalizeTagText(r.plannedNotionTag as string)));
  return NextResponse.json({
    tags: rows.map((r) => ({ tag: r.tag, typeValues: r.typeValues, createdTime: r.createdTime, alreadyScheduled: usedTags.has(normalizeTagText(r.tag)) })),
  });
}
