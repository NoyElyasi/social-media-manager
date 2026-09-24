import { NextRequest, NextResponse } from "next/server";
import { prisma } from "@/server/db";
import { findReadySegmentByTag } from "@/server/notion";
import { updatePostRawText } from "@/server/content/preparePost";
import { ReelCancelledError } from "@/server/content/instagramReel";

/**
 * מושכת מחדש את הטקסט העדכני מנושיין (לפי post.notionTag, ראו CreatePostInput
 * ב-preparePost.ts) ומרנדרת מחדש את כל התוכן שכבר קיים לפוסט — כמו לחיצה על
 * "שמור טקסט" אחרי הדבקה ידנית, רק שהטקסט נשלף אוטומטית. בלי סינון סטטוס
 * (requireReadyStatus: false) — בזמן שהפוסט כבר קיים בכלי, הסטטוס בנושיין
 * כבר לא בהכרח "מוכן". זרם NDJSON כמו PATCH /api/posts/[id] (אותו רינדור איטי).
 */
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const post = await prisma.post.findUnique({ where: { id } });
  if (!post) {
    return NextResponse.json({ error: "פוסט לא נמצא" }, { status: 404 });
  }
  if (!post.notionTag) {
    return NextResponse.json({ error: "לפוסט הזה אין תגית נושיין משויכת" }, { status: 400 });
  }

  const result = await findReadySegmentByTag(post.notionTag, { requireReadyStatus: false });
  if (!result.ok) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }
  if (!result.segment) {
    return NextResponse.json({ error: "הקטע הזה לא נמצא יותר בנושיין" }, { status: 404 });
  }
  const bodyText = result.segment.bodyText;

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
        const updated = await updatePostRawText(id, bodyText, {
          signal: req.signal,
          onProgress: (rendered, total) => send({ type: "progress", rendered, total }),
        });
        send({ type: "done", post: updated });
      } catch (err) {
        if (err instanceof ReelCancelledError) {
          send({ type: "cancelled" });
        } else {
          console.error("Failed to refresh post from Notion:", err);
          send({ type: "error", message: "שגיאה בעדכון מהנושיין — נסו שוב" });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
