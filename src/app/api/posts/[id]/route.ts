import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { updatePostRawText } from "@/server/content/preparePost";
import { ReelCancelledError } from "@/server/content/instagramReel";
import { getStorageService } from "@/server/storage";

export async function GET(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await prisma.post.findUnique({
    where: { id },
    include: { platformContents: true },
  });

  if (!post) {
    return NextResponse.json({ error: "פוסט לא נמצא" }, { status: 404 });
  }

  return NextResponse.json({ post });
}

const updatePostSchema = z.object({
  rawText: z.string().min(1, "יש להזין טקסט לפוסט"),
  // undefined = לא לשנות תבנית; null = בלי תבנית; string = תבנית חדשה.
  carouselBackgroundPath: z.string().nullable().optional(),
  reelBackgroundPath: z.string().nullable().optional(),
  coverBackgroundPath: z.string().nullable().optional(),
});

/**
 * מעדכן את הטקסט הגולמי של הפוסט, ומרנדר מחדש את כל התכנים שכבר הוכנו לו.
 * מוחזר כזרם NDJSON (כמו יצירת פוסט) כדי לשדר התקדמות רינדור ריל ולאפשר
 * ביטול באמצע — אותה אינדיקציית זמן וכפתור "עצור" כמו בהכנת פוסט חדש.
 */
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = updatePostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const existing = await prisma.post.findUnique({ where: { id } });
  if (!existing) {
    return NextResponse.json({ error: "פוסט לא נמצא" }, { status: 404 });
  }

  const encoder = new TextEncoder();
  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // הבקשה כבר נסגרה בצד הלקוח — אין למי לשלוח יותר.
        }
      };

      try {
        const post = await updatePostRawText(id, parsed.data.rawText, {
          signal: req.signal,
          onProgress: (rendered, total) => send({ type: "progress", rendered, total }),
          carouselBackgroundPath: parsed.data.carouselBackgroundPath,
          reelBackgroundPath: parsed.data.reelBackgroundPath,
          coverBackgroundPath: parsed.data.coverBackgroundPath,
        });
        send({ type: "done", post });
      } catch (err) {
        if (err instanceof ReelCancelledError) {
          send({ type: "cancelled" });
        } else {
          console.error("Failed to update post:", err);
          send({ type: "error", message: "שגיאה בעדכון הפוסט — נסו שוב" });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}

/** מוחקת פוסט לצמיתות — הרשומה (וכל PlatformContent שלו, במפל) וגם תיקיית הקבצים שלו על הדיסק. */
export async function DELETE(_req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) {
    return NextResponse.json({ error: "פוסט לא נמצא" }, { status: 404 });
  }

  const storage = getStorageService();
  await storage.deleteFolder(post.folderPath);
  await prisma.post.delete({ where: { id } });

  return NextResponse.json({ ok: true });
}
