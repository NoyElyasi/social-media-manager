import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { getStorageService } from "@/server/storage";
import { getProfileSettings, loadProfileImageDataUri } from "@/server/settings/profile";
import { prepareInstagramCarousel, MANUAL_SLIDE_BREAK } from "@/server/content/instagramCarousel";

/**
 * מרנדר מחדש את תמונות הקרוסלה של תוכן קיים — למשל לאחר שהמשתמשת שינתה
 * את התגיות שהיא בוחרת (סעיף 4.2) או את אופן החילוק לעמודים.
 */
const regenerateSchema = z.object({
  hashtags: z.array(z.string()).optional(),
  splitMode: z.enum(["auto", "manual"]).optional(),
});

export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = regenerateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const content = await prisma.platformContent.findUnique({ where: { id }, include: { post: true } });
  if (!content) {
    return NextResponse.json({ error: "תוכן לא נמצא" }, { status: 404 });
  }
  if (content.type !== "instagram_carousel") {
    return NextResponse.json({ error: "רינדור מחדש נתמך רק לקרוסלת אינסטגרם" }, { status: 400 });
  }

  const storage = getStorageService();
  const profile = await getProfileSettings();

  const profileImageDataUri = await loadProfileImageDataUri(storage, profile.profileImagePath);

  // אם לא צוין אופן חילוק מפורש, משתמשים באותו מצב שהיה בשימוש בפועל בפעם
  // הקודמת (לפי קיום סימוני /// בטקסט המקור) — כדי שרינדור מחדש לא "ישכח" חילוק ידני.
  const inferredSplitMode = content.post.rawText.includes(MANUAL_SLIDE_BREAK) ? "manual" : "auto";

  try {
    const result = await prepareInstagramCarousel({
      rawText: content.post.rawText,
      splitMode: parsed.data.splitMode ?? inferredSplitMode,
      hashtags: parsed.data.hashtags,
      folderPath: content.folderPath,
      displayName: profile.displayName,
      profileImageDataUri,
      storage,
    });

    const updated = await prisma.platformContent.update({
      where: { id },
      data: {
        text: result.text,
        files: JSON.stringify(result.files),
        altText: result.altTexts.join("\n\n"),
        hashtags: JSON.stringify(result.hashtags),
        tags: JSON.stringify(result.tags),
        suggestedSongs: JSON.stringify(result.suggestedSongs),
      },
    });

    return NextResponse.json({ platformContent: updated });
  } catch (err) {
    console.error("Failed to regenerate carousel:", err);
    return NextResponse.json({ error: "שגיאה ברינדור התמונות — נסו שוב" }, { status: 500 });
  }
}
