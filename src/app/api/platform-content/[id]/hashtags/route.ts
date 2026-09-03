import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { getStorageService } from "@/server/storage";
import { prepareFacebookDraft } from "@/server/content/facebook";
import { MANUAL_SLIDE_BREAK } from "@/server/content/instagramCarousel";

/**
 * מעדכן את התגיות של תוכן שאין לו תמונה (כמו פייסבוק) — בלי צורך ברינדור מחדש.
 * לקרוסלת אינסטגרם יש endpoint נפרד (regenerate) כי שם התגיות מוטבעות בתמונה.
 */
const hashtagsSchema = z.object({
  hashtags: z.array(z.string()).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = hashtagsSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const content = await prisma.platformContent.findUnique({ where: { id }, include: { post: true } });
  if (!content) {
    return NextResponse.json({ error: "תוכן לא נמצא" }, { status: 404 });
  }
  if (content.type !== "facebook_post") {
    return NextResponse.json({ error: "עדכון תגיות ישיר נתמך רק לפייסבוק" }, { status: 400 });
  }

  const cleanText = content.post.rawText
    .replaceAll(MANUAL_SLIDE_BREAK, " ")
    .replace(/\s+/g, " ")
    .trim();
  const draft = prepareFacebookDraft(cleanText, parsed.data.hashtags);

  const storage = getStorageService();
  await storage.saveTextFile(
    content.folderPath,
    "טקסט-מוכן.txt",
    [`תגיות: ${draft.hashtags.join(" ")}`, draft.text, `תיוגים: ${draft.tags.join(", ")}`].join("\n\n")
  );

  const updated = await prisma.platformContent.update({
    where: { id },
    data: { hashtags: JSON.stringify(draft.hashtags) },
  });

  return NextResponse.json({ platformContent: updated });
}
