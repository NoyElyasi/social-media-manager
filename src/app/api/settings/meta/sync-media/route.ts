import { NextRequest } from "next/server";
import { z, flattenError } from "zod";
import { syncInstagramMediaSince, MetaApiError, SyncCancelledError } from "@/server/settings/meta";

const syncSchema = z.object({
  sinceDate: z.string().min(1),
});

/**
 * מסנכרנת את הדשבורד מהאינסטגרם, בזרם NDJSON (כמו יצירת ריל) — כדי לשדר
 * התקדמות אמיתית (כמה פוסטים סונכרנו מתוך כמה) ולאפשר ביטול באמצע, כי כל
 * פוסט דורש כמה קריאות API בפועל ויכול לקחת בסך הכול לא מעט זמן.
 */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = syncSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: flattenError(parsed.error) }), { status: 400 });
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
        const result = await syncInstagramMediaSince(new Date(parsed.data.sinceDate), {
          signal: req.signal,
          onProgress: (synced, total) => send({ type: "progress", rendered: synced, total }),
        });
        send({ type: "done", result });
      } catch (err) {
        if (err instanceof SyncCancelledError) {
          send({ type: "cancelled" });
        } else if (err instanceof MetaApiError) {
          send({ type: "error", message: err.message });
        } else {
          console.error("Failed to sync dashboard:", err);
          send({ type: "error", message: "שגיאה בסנכרון הדשבורד — נסו שוב" });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
