import { NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { getNextReelCandidates } from "@/lib/reachInsights";
import { formatCalendarDate, parseCalendarDate } from "@/lib/weeklySchedule";

/**
 * "הרילים הבאים" (כמו בדשבורד) — לבורר הריל הנוסף בפאנל השיבוץ, ראו
 * ScheduleSlotEditorPanel: כשבוחרים סוג "ריל" ידנית, אפשר גם לבחור מועמד
 * קונקרטי מכאן, לא רק קטע מנושיין. מוציאה מועמדים שכבר "נתפסו" בסלוט אחר
 * (כמו בהצעה האוטומטית, ראו claimedMediaIds ב-weeklySchedule.ts).
 */
export async function GET() {
  const today = formatCalendarDate(new Date());
  const claimedMediaIds = new Set(
    (
      await prisma.scheduledSlot.findMany({
        where: { plannedReelCandidateMediaId: { not: null }, date: { gte: parseCalendarDate(today) } },
        select: { plannedReelCandidateMediaId: true },
      })
    ).map((s) => s.plannedReelCandidateMediaId as string)
  );
  const candidates = await getNextReelCandidates(10, claimedMediaIds);
  return NextResponse.json({ candidates });
}
