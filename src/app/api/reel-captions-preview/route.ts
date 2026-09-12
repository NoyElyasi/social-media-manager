import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { splitIntoSlides } from "@/server/content/instagramCarousel";
import { MAX_CHARS_PER_CAPTION } from "@/server/content/instagramReel";

const previewSchema = z.object({
  rawText: z.string().min(1),
  splitMode: z.enum(["auto", "manual"]).optional(),
});

/**
 * מחזירה את פיצול הכתוביות המדויק שהריל ישתמש בו (בדיוק אותו MAX_CHARS_PER_CAPTION) —
 * כדי שרשימת המילים שעליה מתבססת הקלטת הקראה מסונכרנת (ראו NarrationRecorder)
 * תואמת בדיוק לכתוביות שבאמת ייכתבו על המסך, בלי לשכפל את לוגיקת הפיצול בצד הלקוח.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = previewSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const captions = splitIntoSlides(parsed.data.rawText, parsed.data.splitMode ?? "auto", MAX_CHARS_PER_CAPTION);
  return NextResponse.json({ captions });
}
