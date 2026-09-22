"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import type { MetaConnectionStatus, BackfillReport } from "@/server/settings/meta";
import { readNdjsonStream, estimateRemainingSeconds } from "@/lib/ndjsonStream";
import ReelProgress from "@/components/ReelProgress";

export default function MetaConnectionForm({
  initial,
  lastDashboardSyncAt,
  latestSyncedPostAt,
}: {
  initial: MetaConnectionStatus;
  lastDashboardSyncAt: string | null;
  latestSyncedPostAt: string | null;
}) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinceDate, setSinceDate] = useState("2026-08-01");
  const [backfilling, setBackfilling] = useState(false);
  const [report, setReport] = useState<BackfillReport | null>(null);

  const [dashboardSinceDate, setDashboardSinceDate] = useState("2026-08-01");
  const [syncingDashboard, setSyncingDashboard] = useState(false);
  const [syncingLatest, setSyncingLatest] = useState(false);
  const [quickSyncLimit, setQuickSyncLimit] = useState(5);
  const [dashboardSyncNote, setDashboardSyncNote] = useState<string | null>(null);
  const [syncProgress, setSyncProgress] = useState<{ rendered: number; total: number } | null>(null);
  const [syncStartedAt, setSyncStartedAt] = useState<number | null>(null);
  const syncAbortRef = useRef<AbortController | null>(null);

  // התצוגה של "סונכרן לאחרונה" — מתחילה מה-prop (שנקבע ברינדור השרת),
  // ומתעדכנת בכל טעינה מחדש של הקומפוננטה (ראו useEffect) לנתון האמיתי-
  // עדכני. חשוב כשעוברים טאב/עמוד וחוזרים באמצע/אחרי סנכרון: הסנכרון עצמו
  // ממשיך לרוץ בשרת גם אם יצאנו מהעמוד (זו קריאת fetch רגילה, לא תלויה
  // ברינדור של React), אז ה-prop הישן היה מטעה ("עדיין לא סונכרן") אחרי
  // שהסנכרון בפועל כבר הסתיים בזמן שלא היינו כאן.
  const [displaySyncAt, setDisplaySyncAt] = useState(lastDashboardSyncAt);
  useEffect(() => {
    fetch("/api/settings/profile")
      .then((res) => res.json())
      .then((data) => {
        const fresh = data.profile?.lastDashboardSyncAt as string | null | undefined;
        if (fresh) setDisplaySyncAt(fresh);
      })
      .catch(() => {});
  }, []);

  async function handleConnect(e: React.FormEvent) {
    e.preventDefault();
    setBusy(true);
    setError(null);

    const res = await fetch("/api/settings/meta", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ shortLivedToken: token.trim() }),
    });
    const data = await res.json();

    if (!res.ok) {
      setError(data.error || "החיבור נכשל");
    } else {
      setStatus(data.status);
      setToken("");
      router.refresh();
    }
    setBusy(false);
  }

  async function handleBackfill() {
    setBackfilling(true);
    setError(null);
    setReport(null);

    const res = await fetch("/api/settings/meta/backfill", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ sinceDate }),
    });
    const data = await res.json();
    setBackfilling(false);

    if (!res.ok) {
      setError(data.error || "כשל בעדכון ההמוני");
      return;
    }
    setReport(data.report);
    router.refresh();
  }

  function handleCancelSync() {
    syncAbortRef.current?.abort();
  }

  async function handleSyncDashboard() {
    setSyncingDashboard(true);
    setError(null);
    setDashboardSyncNote(null);
    setSyncProgress(null);
    setSyncStartedAt(Date.now());
    const controller = new AbortController();
    syncAbortRef.current = controller;

    try {
      const res = await fetch("/api/settings/meta/sync-media", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ sinceDate: dashboardSinceDate }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "כשל בסנכרון הדשבורד");
      }

      let finished = false;
      await readNdjsonStream(res, (event) => {
        if (event.type === "progress" && event.total) {
          setSyncProgress({ rendered: event.rendered ?? 0, total: event.total });
        } else if (event.type === "done") {
          const result = event.result as { syncedCount: number } | undefined;
          setDashboardSyncNote(`סונכרנו ${result?.syncedCount ?? 0} פוסטים מהאינסטגרם ✓`);
          finished = true;
        } else if (event.type === "cancelled") {
          setDashboardSyncNote("הסנכרון בוטל");
        } else if (event.type === "error") {
          setError(event.message ?? "כשל בסנכרון הדשבורד");
        }
      });

      if (finished) router.refresh();
    } catch (err) {
      if (controller.signal.aborted) {
        setDashboardSyncNote("הסנכרון בוטל");
      } else {
        setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
      }
    } finally {
      setSyncingDashboard(false);
      setSyncProgress(null);
      syncAbortRef.current = null;
    }
  }

  /** סנכרון זריז — רק N הפוסטים העדכניים ביותר (quickSyncLimit), בלי לצאת מהיום שנבחר בשדה התאריך. */
  async function handleSyncLatest() {
    setSyncingLatest(true);
    setError(null);
    setDashboardSyncNote(null);
    setSyncProgress(null);
    setSyncStartedAt(Date.now());

    const controller = new AbortController();
    syncAbortRef.current = controller;

    try {
      const res = await fetch("/api/settings/meta/sync-latest", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ limit: quickSyncLimit }),
        signal: controller.signal,
      });

      if (!res.ok) {
        const data = await res.json();
        throw new Error(data?.error || "כשל בסנכרון הזריז");
      }

      let finished = false;
      await readNdjsonStream(res, (event) => {
        if (event.type === "progress" && event.total) {
          setSyncProgress({ rendered: event.rendered ?? 0, total: event.total });
        } else if (event.type === "done") {
          const result = event.result as { syncedCount: number } | undefined;
          setDashboardSyncNote(`עודכנו ${result?.syncedCount ?? 0} פוסטים אחרונים ✓`);
          setDisplaySyncAt(new Date().toISOString());
          finished = true;
        } else if (event.type === "cancelled") {
          setDashboardSyncNote("העדכון בוטל");
        } else if (event.type === "error") {
          setError(event.message ?? "כשל בסנכרון הזריז");
        }
      });

      if (finished) router.refresh();
    } catch (err) {
      if (controller.signal.aborted) {
        setDashboardSyncNote("העדכון בוטל");
      } else {
        setError(err instanceof Error ? err.message : "שגיאה לא צפויה");
      }
    } finally {
      setSyncingLatest(false);
      setSyncProgress(null);
      syncAbortRef.current = null;
    }
  }

  async function handleDisconnect() {
    setBusy(true);
    const res = await fetch("/api/settings/meta", { method: "DELETE" });
    const data = await res.json();
    setStatus(data.status);
    setBusy(false);
    router.refresh();
  }

  return (
    <div className="flex flex-col gap-4 max-w-md">
      {status.connected ? (
        <div className="flex flex-col gap-2">
          <p className="text-sm text-brand-maroon">
            מחוברת ✓ — עמוד <span className="font-medium">{status.pageName}</span>
          </p>
          <p className="text-xs text-brand-maroon/60">
            טוקן {status.tokenPreview} · בתוקף עד{" "}
            {status.tokenExpiresAt ? new Date(status.tokenExpiresAt).toLocaleDateString("he-IL") : "-"}
          </p>
          <button
            type="button"
            onClick={handleDisconnect}
            disabled={busy}
            className="self-start rounded-lg border border-brand-red px-3 py-1.5 text-sm text-brand-red hover:bg-brand-red/10 disabled:opacity-50"
          >
            התנתקות
          </button>
        </div>
      ) : (
        <p className="text-sm text-brand-maroon/60">לא מחוברת עדיין.</p>
      )}

      <form onSubmit={handleConnect} className="flex flex-col gap-2">
        <label className="text-sm font-medium">
          {status.connected ? "עדכון טוקן" : "חיבור"} — הדביקי כאן טוקן קצר-טווח מ-{" "}
          <a
            href="https://developers.facebook.com/tools/explorer/"
            target="_blank"
            rel="noreferrer"
            className="text-brand-red hover:underline"
          >
            Graph API Explorer
          </a>
        </label>
        <input
          type="text"
          value={token}
          onChange={(e) => setToken(e.target.value)}
          placeholder="EAAG..."
          className="rounded-lg border border-brand-pink/40 p-2 bg-white text-xs"
          dir="ltr"
        />
        {error && <p className="text-xs text-brand-red">{error}</p>}
        <button
          type="submit"
          disabled={busy || !token.trim()}
          className="self-start rounded-lg bg-brand-red px-4 py-2 text-white font-medium hover:bg-brand-red-dark disabled:opacity-50"
        >
          {busy ? "מתחברת..." : "התחברי"}
        </button>
      </form>

      {status.connected && (
        <div className="flex flex-col gap-2 border-t border-brand-pink/30 pt-4">
          <label className="text-sm font-medium">סנכרון הדשבורד (/dashboard)</label>
          <p className="text-xs text-brand-maroon/60">
            שולפת את כל הפוסטים שפורסמו באינסטגרם מהתאריך שתבחרי — כולל כאלה שלא נוצרו בכלי הזה — עם
            הנתונים האמיתיים שלהם (לייקים/תגובות/צפיות/זמן צפייה, אורך הכיתוב וכמות התגיות בו). הדשבורד
            מבוסס אך ורק על הנתונים האלה, בלי תלות בתוכן מהכלי.
          </p>
          <p className="text-xs text-brand-maroon/50">
            {displaySyncAt
              ? `סונכרן לאחרונה ב-${new Date(displaySyncAt).toLocaleString("he-IL")}`
              : "עוד לא סונכרן"}
            {latestSyncedPostAt && ` · מסונכרן עד ${new Date(latestSyncedPostAt).toLocaleString("he-IL")}`}
          </p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={dashboardSinceDate}
              onChange={(e) => setDashboardSinceDate(e.target.value)}
              className="rounded-lg border border-brand-pink/40 p-2 bg-white text-sm"
            />
            <button
              type="button"
              onClick={handleSyncDashboard}
              disabled={syncingDashboard || syncingLatest}
              className="rounded-lg bg-brand-red px-3 py-2 text-sm text-white hover:bg-brand-red-dark disabled:opacity-50"
            >
              {syncingDashboard ? "מסנכרנת..." : "סנכרן את הדשבורד"}
            </button>
            <select
              value={quickSyncLimit}
              onChange={(e) => setQuickSyncLimit(Number(e.target.value))}
              disabled={syncingDashboard || syncingLatest}
              title="כמה פוסטים עדכניים לעדכן"
              className="rounded-lg border border-brand-pink/40 p-2 bg-white text-sm disabled:opacity-50"
            >
              {[1, 3, 5, 10, 20].map((n) => (
                <option key={n} value={n}>
                  {n}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleSyncLatest}
              disabled={syncingDashboard || syncingLatest}
              title={`מעדכנת רק את ${quickSyncLimit} הפוסטים העדכניים ביותר — מהיר יותר מסנכרון מלא`}
              className="rounded-lg border border-brand-red px-3 py-2 text-sm text-brand-red hover:bg-brand-red/10 disabled:opacity-50"
            >
              {syncingLatest ? "מעדכנת..." : `עדכון זריז (${quickSyncLimit} אחרונים)`}
            </button>
          </div>
          {syncProgress && syncStartedAt && (
            <ReelProgress
              rendered={syncProgress.rendered}
              total={syncProgress.total}
              etaSeconds={estimateRemainingSeconds(syncProgress.rendered, syncProgress.total, syncStartedAt)}
              onCancel={handleCancelSync}
              label="מסנכרנת..."
              unitLabel="פוסטים"
            />
          )}
          {dashboardSyncNote && <p className="text-xs text-brand-maroon/70">{dashboardSyncNote}</p>}
        </div>
      )}

      {status.connected && (
        <div className="flex flex-col gap-2 border-t border-brand-pink/30 pt-4">
          <label className="text-sm font-medium">
            קישור פוסטים בכלי (אופציונלי — לתצוגה בעמוד הפוסט, לא נדרש לדשבורד)
          </label>
          <p className="text-xs text-brand-maroon/60">
            עוברת על כל הפוסטים שפורסמו באינסטגרם מהתאריך שתבחרי, מתאימה אוטומטית לפי התגית הייחודית
            של כל פוסט לתוכן המקביל בכלי, ומכניסה לתוכו נתוני ביצועים אמיתיים. שימושי רק אם בא לך לראות
            את הנתונים גם בתוך עמוד הפוסט הספציפי בכלי — הדשבורד עצמו לא תלוי בזה.
          </p>
          <div className="flex items-center gap-2">
            <input
              type="date"
              value={sinceDate}
              onChange={(e) => setSinceDate(e.target.value)}
              className="rounded-lg border border-brand-pink/40 p-2 bg-white text-sm"
            />
            <button
              type="button"
              onClick={handleBackfill}
              disabled={backfilling}
              className="rounded-lg border border-brand-red px-3 py-2 text-sm text-brand-red hover:bg-brand-red/10 disabled:opacity-50"
            >
              {backfilling ? "מעדכנת... (יכול לקחת זמן)" : "עדכני את כל הפוסטים"}
            </button>
          </div>

          {report && (
            <div className="mt-2 flex flex-col gap-3 text-xs">
              <p className="text-brand-maroon">
                קושרו וסונכרנו בהצלחה: <span className="font-medium">{report.linked.length}</span>
              </p>
              {report.linked.length > 0 && (
                <ul className="flex flex-col gap-1">
                  {report.linked.map((l) => (
                    <li key={l.permalink} className="text-brand-maroon/70">
                      ✓ {l.hashtag} —{" "}
                      <a href={l.permalink} target="_blank" rel="noreferrer" className="text-brand-red hover:underline">
                        קישור
                      </a>
                    </li>
                  ))}
                </ul>
              )}

              {report.unmatched.length > 0 && (
                <>
                  <p className="text-brand-maroon">
                    לא הותאמו אוטומטית: <span className="font-medium">{report.unmatched.length}</span> — יש לקשר ידנית
                  </p>
                  <ul className="flex flex-col gap-1">
                    {report.unmatched.map((u) => (
                      <li key={u.permalink} className="text-brand-maroon/70">
                        {new Date(u.timestamp).toLocaleDateString("he-IL")} — {u.reason} —{" "}
                        <a href={u.permalink} target="_blank" rel="noreferrer" className="text-brand-red hover:underline">
                          קישור
                        </a>
                      </li>
                    ))}
                  </ul>
                </>
              )}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
