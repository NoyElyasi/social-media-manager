"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { readNdjsonStream, estimateRemainingSeconds } from "@/lib/ndjsonStream";
import ReelProgress from "@/components/ReelProgress";

type SyncType = "full" | "quick" | "auto";

const TYPE_LABELS: Record<SyncType, string> = { full: "כללי", quick: "מהיר", auto: "אוטומטי" };
const POLL_MS = 3000;

function formatEnd(iso: string): string {
  return new Date(iso).toLocaleString("he-IL", { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

function typeLabel(t: string | null): string {
  return t && t in TYPE_LABELS ? TYPE_LABELS[t as SyncType] : "";
}

export default function DashboardSyncPanel({
  connected,
  lastSyncAt,
  lastType,
  runningType,
  runningSince,
}: {
  connected: boolean;
  lastSyncAt: string | null;
  lastType: string | null;
  runningType: string | null;
  runningSince: string | null;
}) {
  const router = useRouter();
  const startedElsewhere = !!runningType && !!runningSince;

  const [sinceDate, setSinceDate] = useState("2026-08-01");
  const [quickLimit, setQuickLimit] = useState(5);
  const [running, setRunning] = useState<SyncType | null>(startedElsewhere ? (runningType as SyncType) : null);
  const [ownRun, setOwnRun] = useState(false);
  const [progress, setProgress] = useState<{ rendered: number; total: number } | null>(null);
  const [startedAt, setStartedAt] = useState<number | null>(startedElsewhere ? new Date(runningSince!).getTime() : null);
  const [last, setLast] = useState({ at: lastSyncAt, type: lastType });
  const [finished, setFinished] = useState<{ at: string; type: string | null } | null>(null);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);
  const originalTitleRef = useRef<string | null>(null);

  function announceFinished(at: string, type: string | null) {
    setLast({ at, type });
    setFinished({ at, type });
    if (document.hidden) {
      originalTitleRef.current ??= document.title;
      document.title = "✓ הסנכרון הסתיים";
    }
  }

  useEffect(() => {
    function restoreTitle() {
      if (!document.hidden && originalTitleRef.current !== null) {
        document.title = originalTitleRef.current;
        originalTitleRef.current = null;
      }
    }
    document.addEventListener("visibilitychange", restoreTitle);
    return () => document.removeEventListener("visibilitychange", restoreTitle);
  }, []);

  // סנכרון שהתחיל לפני שעברנו לעמוד הזה — עוקבת אחריו מהשרת עד שמסתיים.
  useEffect(() => {
    if (!startedElsewhere) return;
    const timer = setInterval(async () => {
      const data = await fetch("/api/settings/profile").then((r) => r.json()).catch(() => null);
      const p = data?.profile;
      if (!p || p.dashboardSyncRunningType) return;
      clearInterval(timer);
      setRunning(null);
      setStartedAt(null);
      if (p.lastDashboardSyncAt) announceFinished(p.lastDashboardSyncAt, p.lastDashboardSyncType ?? null);
      router.refresh();
    }, POLL_MS);
    return () => clearInterval(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps -- רץ פעם אחת בטעינה
  }, []);

  async function run(type: "full" | "quick") {
    const controller = new AbortController();
    abortRef.current = controller;
    setRunning(type);
    setOwnRun(true);
    setError(null);
    setMessage(null);
    setFinished(null);
    setProgress(null);
    setStartedAt(Date.now());

    const url = type === "full" ? "/api/settings/meta/sync-media" : "/api/settings/meta/sync-latest";
    const body = type === "full" ? { sinceDate } : { limit: quickLimit };

    try {
      const res = await fetch(url, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
        signal: controller.signal,
      });
      if (!res.ok) throw new Error((await res.json())?.error || "הסנכרון נכשל");

      let done = false;
      await readNdjsonStream(res, (event) => {
        if (event.type === "progress" && event.total) {
          setProgress({ rendered: event.rendered ?? 0, total: event.total });
        } else if (event.type === "done") {
          const count = (event.result as { syncedCount?: number } | undefined)?.syncedCount ?? 0;
          setMessage(`${count} פוסטים`);
          done = true;
        } else if (event.type === "cancelled") {
          setMessage("הסנכרון בוטל");
        } else if (event.type === "error") {
          setError(event.message ?? "הסנכרון נכשל");
        }
      });
      if (done) {
        announceFinished(new Date().toISOString(), type);
        router.refresh();
      }
    } catch (err) {
      if (controller.signal.aborted) setMessage("הסנכרון בוטל");
      else setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
    } finally {
      setRunning(null);
      setOwnRun(false);
      setProgress(null);
      setStartedAt(null);
      abortRef.current = null;
    }
  }

  if (!connected) {
    return <p className="text-sm text-brand-maroon/60">לא מחוברת לאינסטגרם — החיבור בהגדרות.</p>;
  }

  const busy = running !== null;
  const inputClass = "rounded-lg border border-brand-pink/30 bg-white px-2.5 py-1.5 text-sm text-brand-maroon disabled:opacity-50";

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-brand-pink/30 bg-white p-4">
      <div className="flex flex-wrap items-center gap-2">
        <input type="date" value={sinceDate} onChange={(e) => setSinceDate(e.target.value)} disabled={busy} className={inputClass} />
        <button
          type="button"
          onClick={() => run("full")}
          disabled={busy || !sinceDate}
          className="rounded-lg bg-brand-red px-3.5 py-1.5 text-sm font-medium text-white shadow-sm hover:bg-brand-red-dark disabled:opacity-50"
        >
          {running === "full" ? "מסנכרנת..." : "סנכרון כללי"}
        </button>
        <div className="ms-2 flex items-center gap-2 border-s border-brand-pink/20 ps-4">
          <input
            type="number"
            min={1}
            max={20}
            value={quickLimit}
            onChange={(e) => setQuickLimit(Math.min(20, Math.max(1, Math.round(Number(e.target.value) || 1))))}
            disabled={busy}
            className={`${inputClass} w-16 text-center`}
          />
          <button
            type="button"
            onClick={() => run("quick")}
            disabled={busy}
            className="rounded-lg border border-brand-pink/25 bg-white px-3.5 py-1.5 text-sm font-medium text-brand-maroon/80 hover:bg-brand-pink/10 disabled:opacity-50"
          >
            {running === "quick" ? "מסנכרנת..." : "סנכרון מהיר"}
          </button>
        </div>
      </div>

      {busy && progress && startedAt && ownRun && (
        <ReelProgress
          rendered={progress.rendered}
          total={progress.total}
          etaSeconds={estimateRemainingSeconds(progress.rendered, progress.total, startedAt)}
          onCancel={() => abortRef.current?.abort()}
          label="מסנכרנת..."
          unitLabel="פוסטים"
        />
      )}
      {busy && !ownRun && (
        <p className="text-sm font-medium text-amber-700">⏳ סנכרון {typeLabel(running)} רץ כרגע…</p>
      )}
      {finished && !busy && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-green-50 px-3 py-2 text-sm font-medium text-green-800">
          <span>
            ✓ הסנכרון ה{typeLabel(finished.type)} הסתיים ב-{formatEnd(finished.at)}
            {message ? ` · ${message}` : ""}
          </span>
          <button type="button" onClick={() => setFinished(null)} className="text-green-800/60 hover:text-green-800" aria-label="סגירה">
            ✕
          </button>
        </div>
      )}
      {error && <p className="text-sm text-brand-red">{error}</p>}
      {message && !finished && <p className="text-sm text-brand-maroon/70">{message}</p>}

      <p className="text-xs text-brand-maroon/55">
        {last.at ? `סנכרון אחרון${typeLabel(last.type) ? ` (${typeLabel(last.type)})` : ""} · הסתיים ב-${formatEnd(last.at)}` : "עוד לא בוצע סנכרון"}
      </p>
    </div>
  );
}
