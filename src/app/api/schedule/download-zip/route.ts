import { NextRequest, NextResponse } from "next/server";
import JSZip from "jszip";
import { prisma } from "@/server/db";
import { getStorageService } from "@/server/storage";
import { getWeekStart, parseCalendarDate, formatCalendarDate } from "@/lib/weeklySchedule";
import { ALWAYS_FIRST_HASHTAG, PLATFORM_LABELS } from "@/lib/labels";

function addDays(d: Date, days: number): Date {
  const next = new Date(d);
  next.setUTCDate(next.getUTCDate() + days);
  return next;
}

/** התגית הראשונה שאינה #אחתביום — משמשת כ"שם" מזהה לתוכן בתוך שם התיקייה בזיפ (כמו postTitle בעמוד הבית). */
function contentLabel(content: { hashtags: string; text: string | null }): string {
  try {
    const tags: string[] = JSON.parse(content.hashtags || "[]");
    const tag = tags.find((t) => t !== ALWAYS_FIRST_HASHTAG);
    if (tag) return tag;
  } catch {
    // ignore — ניפול לברירת המחדל למטה
  }
  return content.text ? content.text.slice(0, 20) : "תוכן";
}

function sanitizeFolderName(name: string): string {
  return (
    name
      .replace(/[\\/:*?"<>|]/g, "")
      .trim()
      .slice(0, 60) || "תוכן"
  );
}

/** מוריד ZIP אחד עם כל התכנים המשובצים לשבוע (יום/שעה מתוכנן) — כל תוכן בתיקייה נפרדת בתוך הזיפ, לפי שם+יום+שעה. */
export async function GET(req: NextRequest) {
  const weekStartParam = req.nextUrl.searchParams.get("weekStart");
  const base = weekStartParam ? parseCalendarDate(weekStartParam) : new Date();
  const weekStart = getWeekStart(base);
  const weekEnd = addDays(weekStart, 7);

  const slots = await prisma.scheduledSlot.findMany({
    where: { date: { gte: weekStart, lt: weekEnd }, platformContentId: { not: null } },
    include: { platformContent: { include: { post: true } } },
    orderBy: [{ date: "asc" }, { hour: "asc" }],
  });

  const withContent = slots.filter((s) => s.platformContent !== null);
  if (withContent.length === 0) {
    return NextResponse.json({ error: "אין תוכן משובץ לשבוע הזה" }, { status: 400 });
  }

  const storage = getStorageService();
  const zip = new JSZip();
  const usedFolderNames = new Set<string>();

  for (const slot of withContent) {
    const content = slot.platformContent!;
    const files: string[] = JSON.parse(content.files || "[]");
    const dateStr = formatCalendarDate(slot.date);
    const hourStr = `${String(slot.hour).padStart(2, "0")}-00`;
    const platformLabel = PLATFORM_LABELS[content.type] ?? content.type;

    let folderName = sanitizeFolderName(`${dateStr} ${hourStr} - ${contentLabel(content)} (${platformLabel})`);
    while (usedFolderNames.has(folderName)) folderName += "_";
    usedFolderNames.add(folderName);

    const folder = zip.folder(folderName);
    for (const fileName of files) {
      const buffer = await storage.readFile(content.folderPath, fileName);
      folder!.file(fileName, buffer);
    }
  }

  const zipBuffer = await zip.generateAsync({ type: "nodebuffer" });
  const zipName = `תכנון-שבועי-${formatCalendarDate(weekStart)}.zip`;

  return new NextResponse(new Uint8Array(zipBuffer), {
    headers: {
      "Content-Type": "application/zip",
      "Content-Disposition": `attachment; filename="${encodeURIComponent(zipName)}"`,
    },
  });
}
