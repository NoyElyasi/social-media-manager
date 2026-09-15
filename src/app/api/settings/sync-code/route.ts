import { NextRequest } from "next/server";
import { spawn } from "node:child_process";
import path from "node:path";

/**
 * מריצה את scripts/sync-code.sh (git pull + npm install + prisma migrate
 * deploy) מהדפדפן, כדי שלא יהיה צורך לפתוח טרמינל בשביל לעדכן קוד. משדרת את
 * הפלט של הסקריפט בזרם NDJSON (כמו סנכרון הדשבורד/יצירת ריל), כדי שהכפתור
 * בהגדרות יוכל להציג התקדמות חיה. לא נוגעת בדאטה (dev.db/storage/.env) —
 * הסקריפט עצמו לא עושה את זה.
 */
export async function POST(req: NextRequest) {
  const encoder = new TextEncoder();
  const scriptPath = path.join(process.cwd(), "scripts", "sync-code.sh");

  const stream = new ReadableStream({
    start(controller) {
      const send = (event: Record<string, unknown>) => {
        try {
          controller.enqueue(encoder.encode(JSON.stringify(event) + "\n"));
        } catch {
          // הבקשה כבר נסגרה בצד הלקוח — אין למי לשלוח יותר.
        }
      };

      const child = spawn("bash", [scriptPath], { cwd: process.cwd() });

      const onAbort = () => child.kill();
      req.signal.addEventListener("abort", onAbort);

      const emitLines = (chunk: Buffer) => {
        for (const line of chunk.toString("utf8").split("\n")) {
          if (line.trim()) send({ type: "log", line });
        }
      };
      child.stdout.on("data", emitLines);
      child.stderr.on("data", emitLines);

      child.on("error", (err) => {
        send({ type: "error", message: `לא הצלחתי להריץ את הסקריפט: ${err.message}` });
        controller.close();
      });

      child.on("close", (code) => {
        req.signal.removeEventListener("abort", onAbort);
        if (req.signal.aborted) {
          send({ type: "cancelled" });
        } else if (code === 0) {
          send({ type: "done" });
        } else {
          send({ type: "error", message: `הסקריפט נכשל (קוד יציאה ${code}) — פרטים למעלה בלוג` });
        }
        controller.close();
      });
    },
  });

  return new Response(stream, { headers: { "Content-Type": "application/x-ndjson" } });
}
