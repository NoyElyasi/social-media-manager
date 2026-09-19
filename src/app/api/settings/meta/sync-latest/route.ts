import { NextRequest } from "next/server";
import { z, flattenError } from "zod";
import { syncLatestInstagramMedia, MetaApiError, SyncCancelledError } from "@/server/settings/meta";

const syncSchema = z.object({
  limit: z.number().int().min(1).max(20).default(5),
});

/**
 * סנכרון "זריז" — רק N הפוסטים האחרונים, לא כל הפוסטים מתאריך נתון (ראו
 * syncLatestInstagramMedia). זרם NDJSON כמו /sync-media, לצורך התקדמות/ביטול.
 */
export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => ({}));
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
        const result = await syncLatestInstagramMedia(parsed.data.limit, {
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
          console.error("Failed to run quick dashboard sync:", err);
          send({ type: "error", message: "שגיאה בסנכרון הזריז — נסו שוב" });
        }
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
