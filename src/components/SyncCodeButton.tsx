"use client";

import { useRef, useState } from "react";
import { readNdjsonStream } from "@/lib/ndjsonStream";

type Status = "idle" | "running" | "done" | "error" | "cancelled";

/**
 * כפתור "עדכני קוד" בראש ההגדרות — מריץ בשרת את scripts/sync-code.sh (git
 * pull + npm install + prisma migrate deploy), כדי שלא יהיה צורך לפתוח
 * טרמינל. שימושי במיוחד במחשב שמחזיק את הדאטה בפועל, כשתיקונים ממשיכים
 * להגיע ממחשב אחר (ראו scripts/sync-code.sh).
 */
export default function SyncCodeButton() {
  const [status, setStatus] = useState<Status>("idle");
  const [log, setLog] = useState<string[]>([]);
  const [error, setError] = useState<string | null>(null);
  const abortControllerRef = useRef<AbortController | null>(null);

  async function handleSync() {
    setStatus("running");
    setLog([]);
    setError(null);
    const controller = new AbortController();
    abortControllerRef.current = controller;

    try {
      const res = await fetch("/api/settings/sync-code", { method: "POST", signal: controller.signal });
      if (!res.ok) throw new Error("שגיאה בהרצת העדכון");

      await readNdjsonStream(res, (event) => {
        if (event.type === "log" && event.line) {
          setLog((prev) => [...prev, event.line as string]);
        } else if (event.type === "done") {
          setStatus("done");
        } else if (event.type === "cancelled") {
          setStatus("cancelled");
        } else if (event.type === "error") {
          setStatus("error");
          setError(event.message ?? "שגיאה בעדכון הקוד");
        }
      });
    } catch (err) {
      if (controller.signal.aborted) {
        setStatus("cancelled");
      } else {
        setStatus("error");
        setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
      }
    } finally {
      abortControllerRef.current = null;
    }
  }

  function handleCancel() {
    abortControllerRef.current?.abort();
  }

  return (
    <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5 flex flex-col gap-2">
      <div className="flex items-center justify-between gap-3">
        <div>
          <h2 className="font-bold text-brand-maroon">עדכוני קוד</h2>
          <p className="text-xs text-brand-maroon/60">
            מושך תיקונים עדכניים מ-GitHub ומתקין אותם — בלי לפתוח טרמינל. לא נוגע בפוסטים/בקבצים שלך.
          </p>
        </div>
        {status === "running" ? (
          <button
            type="button"
            onClick={handleCancel}
            className="shrink-0 rounded-md border border-brand-pink/40 px-4 py-2 text-sm hover:bg-white"
          >
            בטלי
          </button>
        ) : (
          <button
            type="button"
            onClick={handleSync}
            className="shrink-0 rounded-md bg-brand-red px-4 py-2 text-sm text-white hover:bg-brand-red-dark"
          >
            עדכני קוד
          </button>
        )}
      </div>

      {log.length > 0 && (
        <pre
          dir="ltr"
          className="max-h-40 overflow-y-auto rounded-md bg-neutral-900 p-2 text-[11px] text-neutral-100 whitespace-pre-wrap"
        >
          {log.join("\n")}
        </pre>
      )}

      {status === "done" && (
        <p className="text-sm text-green-700">
          ✓ העדכון הסתיים. השינויים כבר צריכים להופיע — אם לא, רעננו את הדף. אם היו שינויים עמוקים (חבילות/סכמה), ייתכן
          שיהיה צורך גם להפעיל מחדש את השרת (npm run dev) בטרמינל.
        </p>
      )}
      {status === "cancelled" && <p className="text-sm text-brand-maroon/60">העדכון בוטל.</p>}
      {status === "error" && <p className="text-sm text-red-600">{error}</p>}
    </div>
  );
}
