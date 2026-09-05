import { NextRequest, NextResponse } from "next/server";
import { z, flattenError } from "zod";
import { prisma } from "@/server/db";
import { addTargetToPost } from "@/server/content/preparePost";
import { ReelCancelledError } from "@/server/content/instagramReel";

/** מוסיף יעד (קרוסלה/ריל) לפוסט קיים, גם אם לא נבחר ביצירה הראשונית. */
const addTargetSchema = z.object({
  target: z.enum(["instagram_carousel", "instagram_reel"]),
});

/** זרם NDJSON, כמו ב-POST /api/posts — כדי לשדר התקדמות ריל ולאפשר ביטול. */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const body = await req.json();
  const parsed = addTargetSchema.safeParse(body);

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
          // הבקשה כבר נסגרה בצד הלקוח.
        }
      };

      try {
        const post = await addTargetToPost(id, parsed.data.target, {
          signal: req.signal,
          onProgress: (rendered, total) => send({ type: "progress", rendered, total }),
        });
        send({ type: "done", post });
      } catch (err) {
        if (err instanceof ReelCancelledError) {
          send({ type: "cancelled" });
        } else {
          console.error("Failed to add target to post:", err);
          const message = err instanceof Error ? err.message : "שגיאה בהוספת היעד — נסו שוב";
          send({ type: "error", message });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
