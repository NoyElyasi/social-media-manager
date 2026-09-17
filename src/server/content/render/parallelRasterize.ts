import { fork, type ChildProcess } from "child_process";
import path from "path";
import os from "os";

export interface RasterizeJob {
  svg: string;
  filePath: string;
}

// process.cwd(), לא __dirname — Turbopack ממפה __dirname בקוד שרת ל-נתיב
// וירטואלי ("/ROOT/...") שלא קיים בפועל בדיסק (ראו גם fonts.ts, שנתקל
// באותה בעיה). process.cwd() הוא תיקיית הפרויקט האמיתית כשה-Node process רץ.
const WORKER_PATH = path.join(process.cwd(), "src", "server", "content", "render", "resvgWorker.cjs");
const MAX_WORKERS = 8;

/**
 * מרנדרת SVG-ים ל-PNG במקביל, בכמה תהליכי Node נפרדים (לא Promise.all
 * רגיל!) — כי resvg.render() היא קריאה סינכרונית שחוסמת את ה-JS thread
 * שקורא לה, אז שתי קריאות "מקבילות" מתוך אותו תהליך Node עדיין רצות
 * ברצף בפועל. לפי מדידה בפועל, resvg.render() הוא כ-96% מהזמן לרינדור
 * מסגרת ריל (satori — הפריסה עצמה — רק כ-4%), אז זה החלק ששווה לפצל בין
 * ליבות המעבד. הפיצול הוא לפי תהליכים (child_process.fork), לא
 * worker_threads, כדי לא להסתבך עם טעינת TypeScript/ESM בתוך thread —
 * resvgWorker.cjs הוא קובץ JS פשוט בלי שום תלות בקוד הפרויקט מעבר ל-resvg.
 */
export async function rasterizeInParallel(
  jobs: RasterizeJob[],
  width: number,
  onProgress?: (renderedCount: number) => void,
  signal?: AbortSignal
): Promise<void> {
  if (jobs.length === 0) return;
  if (signal?.aborted) throw new Error("aborted");

  const workerCount = Math.max(1, Math.min(MAX_WORKERS, os.cpus().length, jobs.length));
  const chunks: RasterizeJob[][] = Array.from({ length: workerCount }, () => []);
  jobs.forEach((job, i) => chunks[i % workerCount].push(job));

  let doneCount = 0;
  let aborted = false;
  const children: ChildProcess[] = [];

  const onAbort = () => {
    aborted = true;
    for (const child of children) if (!child.killed) child.kill();
  };
  signal?.addEventListener("abort", onAbort, { once: true });

  try {
    await Promise.all(
      chunks
        .filter((chunk) => chunk.length > 0)
        .map(
          (chunk) =>
            new Promise<void>((resolve, reject) => {
              const child = fork(WORKER_PATH, [], { stdio: ["ignore", "ignore", "pipe", "ipc"] });
              children.push(child);
              let settled = false;
              let stderr = "";
              child.stderr?.on("data", (d) => (stderr += d.toString()));

              child.on("message", (msg: { type: string; message?: string }) => {
                if (settled) return;
                if (msg.type === "progress") {
                  doneCount++;
                  onProgress?.(doneCount);
                } else if (msg.type === "done") {
                  settled = true;
                  child.kill();
                  resolve();
                } else if (msg.type === "error") {
                  settled = true;
                  child.kill();
                  reject(new Error(msg.message ?? "resvg worker failed"));
                }
              });

              child.on("error", (err) => {
                if (!settled) {
                  settled = true;
                  reject(err);
                }
              });

              child.on("exit", (code) => {
                if (settled) return;
                settled = true;
                reject(
                  aborted
                    ? new Error("aborted")
                    : new Error(`resvg worker exited unexpectedly (code ${code}): ${stderr}`)
                );
              });

              child.send({ type: "render", jobs: chunk, width });
            })
        )
    );
  } finally {
    signal?.removeEventListener("abort", onAbort);
    for (const child of children) if (!child.killed) child.kill();
  }
}
