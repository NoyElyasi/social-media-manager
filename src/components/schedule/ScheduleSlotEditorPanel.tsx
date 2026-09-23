"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import Link from "next/link";
import { PLATFORM_LABELS, STATUS_LABELS } from "@/lib/labels";
import type { WeekSlot } from "@/lib/weeklySchedule";
import OpenFolderButton from "@/components/OpenFolderButton";

interface ReadyContentItem {
  id: string;
  postId: string;
  type: string;
  text: string | null;
  status: string;
}

const HOURS = Array.from({ length: 24 }, (_, h) => h);
const FORMAT_LABELS: Record<string, string> = { letter: "✉️ מכתב", tip: "💡 טיפ" };

export type EditorTarget = { mode: "existing"; slot: WeekSlot } | { mode: "new"; date: string; dayLabel: string; hour: number };

/** פאנל עריכה לסלוט קיים או ליצירת סלוט חדש בתא ריק שנלחץ בלוח השנה. */
export default function ScheduleSlotEditorPanel({ target, onClose }: { target: EditorTarget; onClose: () => void }) {
  const router = useRouter();
  const [hour, setHour] = useState(target.mode === "existing" ? target.slot.hour : target.hour);
  const [dateInput, setDateInput] = useState(target.mode === "existing" ? target.slot.date : target.date);
  const [busy, setBusy] = useState(false);
  const [readyItems, setReadyItems] = useState<ReadyContentItem[] | null>(null);
  const [loadingPicker, setLoadingPicker] = useState(false);
  const [pickerOpen, setPickerOpen] = useState(false);
  const [noteInput, setNoteInput] = useState(target.mode === "existing" ? target.slot.note ?? "" : "");

  const slotId = target.mode === "existing" ? target.slot.slotId : null;
  const date = target.mode === "existing" ? target.slot.date : target.date;
  const dayLabel = target.mode === "existing" ? null : target.dayLabel;
  const content = target.mode === "existing" ? target.slot.content : null;

  const [notionInput, setNotionInput] = useState(content?.notionUrl ?? "");
  const [notionEditing, setNotionEditing] = useState(!content?.notionUrl);
  const [savingNotion, setSavingNotion] = useState(false);
  const recommendedType = target.mode === "existing" ? target.slot.recommendedType : "instagram_reel";
  const recommendedFormat = target.mode === "existing" ? target.slot.recommendedFormat : null;
  const recommendedReelCandidate = target.mode === "existing" ? target.slot.recommendedReelCandidate : null;
  const recommendedNotionSegment = target.mode === "existing" ? target.slot.recommendedNotionSegment : null;
  const isManual = target.mode === "existing" ? target.slot.isManual : true;

  async function ensurePicker() {
    setPickerOpen((v) => !v);
    if (!readyItems) {
      setLoadingPicker(true);
      const res = await fetch("/api/schedule/ready-content");
      const data = await res.json();
      setReadyItems(data.items ?? []);
      setLoadingPicker(false);
    }
  }

  async function refreshAndClose() {
    router.refresh();
    onClose();
  }

  async function patchExisting(data: Record<string, unknown>) {
    if (!slotId) return;
    setBusy(true);
    await fetch(`/api/schedule/slots/${slotId}`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(data),
    });
    await refreshAndClose();
  }

  /** מזיזה שיבוץ קיים לתאריך אחר (שבוע אחר לגמרי, כולל) — נועלת אותו (כמו כל עדכון ידני, ראו patchExisting). */
  async function moveToDate(newDate: string) {
    setDateInput(newDate);
    await patchExisting({ date: newDate });
  }

  function shiftWeek(days: number) {
    const d = new Date(`${dateInput}T00:00:00.000Z`);
    d.setUTCDate(d.getUTCDate() + days);
    void moveToDate(d.toISOString().slice(0, 10));
  }

  async function deleteExisting() {
    if (!slotId) return;
    setBusy(true);
    await fetch(`/api/schedule/slots/${slotId}`, { method: "DELETE" });
    await refreshAndClose();
  }

  async function createNew(platformContentId: string | null) {
    setBusy(true);
    await fetch("/api/schedule/slots", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ date, hour, platformContentId, note: noteInput.trim() || null }),
    });
    await refreshAndClose();
  }

  async function saveNote() {
    if (target.mode === "existing") {
      await patchExisting({ note: noteInput.trim() || null });
    }
  }

  async function saveNotionUrl() {
    if (!content) return;
    setSavingNotion(true);
    await fetch(`/api/posts/${content.postId}/notion-url`, {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ notionUrl: notionInput.trim() || null }),
    });
    setSavingNotion(false);
    setNotionEditing(false);
    router.refresh();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/30 p-4" onClick={onClose}>
      <div className="w-full max-w-sm rounded-xl bg-white p-4 shadow-xl flex flex-col gap-3 text-sm" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center justify-between">
          <h2 className="font-semibold text-brand-maroon">
            {dayLabel ?? ""} · {date}
          </h2>
          <button type="button" onClick={onClose} className="text-brand-maroon/40 hover:text-brand-red">
            ✕
          </button>
        </div>

        <div className="flex items-center gap-2">
          <span className="text-brand-maroon/60">שעה:</span>
          <select
            value={hour}
            disabled={busy}
            onChange={(e) => {
              const next = Number(e.target.value);
              setHour(next);
              if (target.mode === "existing") patchExisting({ hour: next });
            }}
            className="rounded border border-brand-pink/40 bg-white px-1 py-0.5 text-xs"
          >
            {HOURS.map((h) => (
              <option key={h} value={h}>
                {String(h).padStart(2, "0")}:00
              </option>
            ))}
          </select>
          {!isManual && <span className="text-[11px] text-brand-maroon/40">🤖 הצעה אוטומטית</span>}
        </div>

        {target.mode === "existing" && (
          <div className="flex items-center gap-2 text-xs">
            <span className="text-brand-maroon/60">תאריך:</span>
            <input
              type="date"
              value={dateInput}
              disabled={busy}
              onChange={(e) => e.target.value && moveToDate(e.target.value)}
              className="rounded border border-brand-pink/40 bg-white px-1 py-0.5 text-xs"
            />
            <button type="button" onClick={() => shiftWeek(-7)} disabled={busy} className="rounded border border-brand-pink/40 px-1.5 py-0.5 hover:bg-brand-pink/10">
              שבוע קודם
            </button>
            <button type="button" onClick={() => shiftWeek(7)} disabled={busy} className="rounded border border-brand-pink/40 px-1.5 py-0.5 hover:bg-brand-pink/10">
              שבוע הבא
            </button>
          </div>
        )}

        {target.mode === "existing" && (
          <div className="flex items-center gap-1.5">
            <button
              type="button"
              onClick={() => patchExisting({ isManual: !isManual })}
              disabled={busy}
              className="text-[11px] text-brand-maroon/60 hover:text-brand-red underline"
            >
              {isManual ? "🔓 בטלי נעילה — תיכלל בהצעה הבאה" : "🔒 נעלי — לא תשתנה בהצעה הבאה"}
            </button>
          </div>
        )}

        {target.mode === "existing" && (
          <div className="flex items-center gap-1.5 text-xs">
            <span className="text-brand-maroon/60">מה קרה בפועל:</span>
            <button
              type="button"
              onClick={() => patchExisting({ actualStatus: "done" })}
              disabled={busy}
              className={`rounded-full px-2 py-0.5 ${
                target.slot.actualStatus === "done" ? "bg-green-100 text-green-700" : "border border-brand-pink/40 hover:bg-brand-pink/10"
              }`}
            >
              ✓ עלה
            </button>
            <button
              type="button"
              onClick={() => patchExisting({ actualStatus: "skipped" })}
              disabled={busy}
              className={`rounded-full px-2 py-0.5 ${
                target.slot.actualStatus === "skipped" ? "bg-red-100 text-red-700" : "border border-brand-pink/40 hover:bg-brand-pink/10"
              }`}
            >
              ✗ לא עלה
            </button>
            {target.slot.actualStatus !== "pending" && (
              <button type="button" onClick={() => patchExisting({ actualStatus: "pending" })} disabled={busy} className="text-brand-maroon/40 hover:text-brand-red">
                איפוס
              </button>
            )}
            {target.slot.actualAt && (
              <span className="text-[11px] text-brand-maroon/40">
                (סומן ב-{new Date(target.slot.actualAt).toLocaleDateString("he-IL", { day: "2-digit", month: "2-digit" })})
              </span>
            )}
          </div>
        )}

        {content ? (
          <div className="rounded-lg bg-brand-pink/10 p-2 flex flex-col gap-2">
            <div className="flex items-center justify-between gap-2">
              <span className="font-semibold text-brand-maroon truncate">{content.titleTag ?? "ללא תיוג"}</span>
              {target.mode === "existing" && (
                <button
                  type="button"
                  onClick={() => patchExisting({ platformContentId: null })}
                  disabled={busy}
                  className="shrink-0 text-brand-maroon/40 hover:text-brand-red text-xs"
                >
                  הסרת התוכן
                </button>
              )}
            </div>
            <span className="text-[11px] text-brand-maroon/60">
              {PLATFORM_LABELS[content.type] ?? content.type} · שעת פרסום {String(hour).padStart(2, "0")}:00
            </span>
            {content.text && <p className="text-xs text-brand-maroon/80 truncate">{content.text}</p>}

            <div className="flex flex-wrap items-center gap-2 text-xs">
              <Link href={`/posts/${content.postId}`} className="rounded border border-brand-pink/40 bg-white px-2 py-1 hover:bg-brand-pink/10">
                ✏️ עריכת הפוסט
              </Link>
              <OpenFolderButton postId={content.postId} />
            </div>

            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-brand-maroon/50">קישור ל-Notion:</span>
              {notionEditing ? (
                <div className="flex gap-1">
                  <input
                    type="text"
                    value={notionInput}
                    disabled={savingNotion}
                    onChange={(e) => setNotionInput(e.target.value)}
                    placeholder="https://notion.so/..."
                    dir="ltr"
                    className="flex-1 rounded border border-brand-pink/40 bg-white px-2 py-1 text-xs"
                  />
                  <button
                    type="button"
                    onClick={saveNotionUrl}
                    disabled={savingNotion}
                    className="rounded border border-brand-pink/40 bg-white px-2 py-1 text-xs hover:bg-brand-pink/10"
                  >
                    שמירה
                  </button>
                </div>
              ) : (
                <div className="flex items-center gap-2">
                  <a href={content.notionUrl ?? undefined} target="_blank" rel="noreferrer" className="text-brand-maroon hover:underline text-xs truncate">
                    📓 פתיחה ב-Notion
                  </a>
                  <button type="button" onClick={() => setNotionEditing(true)} className="text-[11px] text-brand-maroon/40 hover:text-brand-red">
                    שינוי
                  </button>
                </div>
              )}
            </div>
          </div>
        ) : (
          <div className="flex flex-col gap-1.5">
            <span className="text-amber-700 text-xs font-medium">
              אין תוכן מוכן ברשימה — צריך להכין {recommendedType ? PLATFORM_LABELS[recommendedType] : "תוכן"} ליום הזה, בשעה {String(hour).padStart(2, "0")}:00
              {recommendedFormat ? ` (מומלץ בפורמט ${FORMAT_LABELS[recommendedFormat]} — הרבה זמן בלי אחד)` : ""}
            </span>

            {recommendedNotionSegment && (
              <div className="rounded-lg border border-brand-pink/40 bg-brand-pink/5 p-2 flex flex-col gap-1">
                <span className="text-[11px] text-brand-maroon/60">
                  📓 קטע מוכן בנושיין שמתאים לשיבוץ הזה (תגית {recommendedNotionSegment.tag.startsWith("#") ? recommendedNotionSegment.tag : `#${recommendedNotionSegment.tag}`}):
                </span>
                {recommendedNotionSegment.preview && <p className="text-xs text-brand-maroon/80 truncate">{recommendedNotionSegment.preview}</p>}
                <div className="flex items-center gap-2">
                  <a href={recommendedNotionSegment.pageUrl} target="_blank" rel="noreferrer" className="text-brand-maroon hover:underline text-xs">
                    פתיחה ב-Notion
                  </a>
                  <Link
                    href={`/posts/new?notionTag=${encodeURIComponent(recommendedNotionSegment.tag)}`}
                    className="rounded-md bg-brand-red px-2 py-1 text-white text-xs hover:bg-brand-red-dark"
                  >
                    + יצירת פוסט מהקטע הזה
                  </Link>
                </div>
              </div>
            )}

            <div className="flex flex-col gap-1">
              <span className="text-[11px] text-brand-maroon/50">שם/הערה (למשל קטע שעדיין בעבודה במקום אחר, כמו Notion, ולא הוכן עדיין בכלי):</span>
              <div className="flex gap-1">
                <input
                  type="text"
                  value={noteInput}
                  disabled={busy}
                  onChange={(e) => setNoteInput(e.target.value)}
                  placeholder="לדוגמה: קטע געגוע לאמא"
                  className="flex-1 rounded border border-brand-pink/40 bg-white px-2 py-1 text-xs"
                />
                {target.mode === "existing" && (
                  <button
                    type="button"
                    onClick={saveNote}
                    disabled={busy}
                    className="rounded border border-brand-pink/40 bg-white px-2 py-1 text-xs hover:bg-brand-pink/10"
                  >
                    שמירה
                  </button>
                )}
              </div>
            </div>

            {recommendedReelCandidate && (
              <div className="rounded-lg border border-brand-pink/40 bg-brand-pink/5 p-2 flex flex-col gap-1">
                <span className="text-[11px] text-brand-maroon/60">🎬 זה הריל שכדאי לייצר (מ&quot;המלצות לרילים הבאים&quot; בדשבורד):</span>
                <a href={recommendedReelCandidate.permalink} target="_blank" rel="noreferrer" className="text-brand-maroon hover:underline text-xs truncate">
                  {recommendedReelCandidate.caption ?? "(ללא כיתוב)"}
                </a>
                <span className="text-[11px] text-brand-maroon/50" dir="ltr">
                  👁 {recommendedReelCandidate.viewsCount ?? "—"} · ❤️ {recommendedReelCandidate.likesCount ?? "—"} · 💬{" "}
                  {recommendedReelCandidate.commentsCount ?? "—"}
                </span>
                {recommendedReelCandidate.postId ? (
                  <Link
                    href={`/posts/${recommendedReelCandidate.postId}`}
                    className="self-start rounded-md bg-brand-red px-2 py-1 text-white text-xs hover:bg-brand-red-dark"
                  >
                    + הוסיפי ריל לתוכן הזה
                  </Link>
                ) : (
                  <span className="text-[11px] text-brand-maroon/40">התוכן לא מקושר לפוסט בכלי — אין אפשרות להוסיף ריל ישירות מכאן</span>
                )}
              </div>
            )}

            <button type="button" onClick={ensurePicker} className="self-start rounded border border-brand-pink/40 bg-white px-2 py-1 text-xs hover:bg-brand-pink/10">
              שיבוץ תוכן קיים...
            </button>
            {pickerOpen && (
              <div className="rounded border border-brand-pink/40 bg-white p-1.5 max-h-40 overflow-y-auto flex flex-col gap-1">
                {loadingPicker && <span className="text-brand-maroon/50 text-xs">טוענת...</span>}
                {!loadingPicker && readyItems?.length === 0 && <span className="text-brand-maroon/50 text-xs">אין תוכן שמחכה כרגע</span>}
                {!loadingPicker &&
                  readyItems?.map((item) => (
                    <button
                      key={item.id}
                      type="button"
                      onClick={() => (target.mode === "existing" ? patchExisting({ platformContentId: item.id }) : createNew(item.id))}
                      className="text-right rounded px-1 py-0.5 text-xs hover:bg-brand-pink/10 truncate"
                    >
                      {PLATFORM_LABELS[item.type] ?? item.type} ({STATUS_LABELS[item.status] ?? item.status}) — {item.text ? item.text.slice(0, 30) : "(ללא טקסט)"}
                    </button>
                  ))}
              </div>
            )}
          </div>
        )}

        <div className="flex items-center justify-between pt-1 border-t border-brand-pink/20">
          {target.mode === "existing" ? (
            <button type="button" onClick={deleteExisting} disabled={busy} className="text-xs text-brand-red hover:underline">
              מחיקת השיבוץ
            </button>
          ) : (
            <button
              type="button"
              onClick={() => createNew(null)}
              disabled={busy}
              className="rounded-lg bg-brand-red px-3 py-1.5 text-white text-xs font-medium hover:bg-brand-red-dark disabled:opacity-50"
            >
              יצירת שיבוץ ריק בשעה זו
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
