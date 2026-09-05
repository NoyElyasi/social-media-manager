import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { createAndPreparePost } from "@/server/content/preparePost";
import { ReelCancelledError } from "@/server/content/instagramReel";

const createPostSchema = z.object({
  rawText: z.string().min(1, "יש להזין טקסט לפוסט"),
  selectedTargets: z
    .array(z.enum(["facebook_post", "instagram_carousel", "instagram_reel"]))
    .min(1, "יש לבחור לפחות יעד אחד"),
  splitMode: z.enum(["auto", "manual"]).optional(),
  manualHashtags: z.array(z.string()).optional().nullable(),
});

export async function GET() {
  const posts = await prisma.post.findMany({
    orderBy: { createdAt: "desc" },
    include: { platformContents: true },
  });
  return NextResponse.json({ posts });
}

/**
 * יצירת פוסט מוחזרת כזרם NDJSON (שורת JSON אחת לאירוע) ולא JSON יחיד —
 * כדי שאפשר לשדר התקדמות רינדור מסגרות ריל (סעיף "אינדיקציה לזמן שנותר")
 * לפני שהיצירה כולה מסתיימת. אירועים: progress / done / cancelled / error.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = createPostSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
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
        const post = await createAndPreparePost({
          ...parsed.data,
          signal: req.signal,
          onProgress: (rendered, total) => send({ type: "progress", rendered, total }),
        });
        send({ type: "done", post });
      } catch (err) {
        if (err instanceof ReelCancelledError) {
          send({ type: "cancelled" });
        } else {
          console.error("Failed to create post:", err);
          send({ type: "error", message: "שגיאה בהכנת הפוסט — נסו שוב" });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
