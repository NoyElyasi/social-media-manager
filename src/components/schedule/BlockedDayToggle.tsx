"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";

/** מסמנת/מבטלת יום כ"לא ניתן לפרסם בו" — נלקח בחשבון בהצעה האוטומטית הבאה (לא רטרואקטיבי על סלוטים שכבר נוצרו). */
export default function BlockedDayToggle({
  date,
  blockedDayId,
  note,
}: {
  date: string;
  blockedDayId: string | null;
  note: string | null;
}) {
  const router = useRouter();
  const [adding, setAdding] = useState(false);
  const [noteInput, setNoteInput] = useState("");
  const [busy, setBusy] = useState(false);

  async function block() {
    setBusy(true);
    await fetch("/api/schedule/blocked-days", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, note: noteInput.trim() || null }),
    });
    setAdding(false);
    setBusy(false);
    router.refresh();
  }

  async function unblock() {
    if (!blockedDayId) return;
    setBusy(true);
    await fetch(`/api/schedule/blocked-days/${blockedDayId}`, { method: "DELETE" });
    router.refresh();
  }

  if (blockedDayId) {
    return (
      <button
        type="button"
        onClick={unblock}
        disabled={busy}
        title="הסרת חסימת היום"
        className="self-start rounded-full bg-neutral-200 text-neutral-700 px-2 py-0.5 text-[11px] hover:bg-neutral-300"
      >
        🚫 {note ? note : "יום חסום"} — הסרה
      </button>
    );
  }

  if (adding) {
    return (
      <div className="flex flex-col gap-1">
        <input
          type="text"
          value={noteInput}
          onChange={(e) => setNoteInput(e.target.value)}
          placeholder="הערה (לא חובה)..."
          className="rounded border border-brand-pink/40 p-1 text-[11px]"
        />
        <div className="flex gap-1">
          <button type="button" onClick={block} disabled={busy} className="rounded border border-brand-pink/40 px-1.5 py-0.5 text-[11px] hover:bg-brand-pink/10">
            חסימה
          </button>
          <button type="button" onClick={() => setAdding(false)} className="text-[11px] text-brand-maroon/50">
            ביטול
          </button>
        </div>
      </div>
    );
  }

  return (
    <button
      type="button"
      onClick={() => setAdding(true)}
      className="self-start text-[11px] text-brand-maroon/40 hover:text-brand-red"
    >
      חסימת היום הזה
    </button>
  );
}
