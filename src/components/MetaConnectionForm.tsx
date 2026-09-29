"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import type { MetaConnectionStatus, BackfillReport } from "@/server/settings/meta";

export default function MetaConnectionForm({ initial }: { initial: MetaConnectionStatus }) {
  const router = useRouter();
  const [status, setStatus] = useState(initial);
  const [token, setToken] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sinceDate, setSinceDate] = useState("2026-08-01");
  const [backfilling, setBackfilling] = useState(false);
  const [report, setReport] = useState<BackfillReport | null>(null);

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
