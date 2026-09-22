"use client";

import { useState } from "react";

interface PropertyInfo {
  name: string;
  type: string;
  options: string[];
}

interface PropertyRef {
  name: string;
  type: string;
}

interface PropertyMap {
  tag: PropertyRef;
  status: PropertyRef & { readyValue: string };
  type: PropertyRef | null;
  tags: PropertyRef | null;
}

const TAG_TYPES = ["title", "rich_text", "select"];
const STATUS_TYPES = ["status", "select"];
const TYPE_TYPES = ["select", "rich_text", "multi_select"];
const TAGS_TYPES = ["multi_select", "rich_text"];

/** בהגדרות: חיבור לטבלת הקטעים ב-Notion — לינק הטבלה + מיפוי עמודות (לא כולל את המפתח הסודי, ראו .env). */
export default function NotionConnectionForm({
  apiKeyConfigured,
  initialDatabaseUrl,
  initialPropertyMap,
}: {
  apiKeyConfigured: boolean;
  initialDatabaseUrl: string | null;
  initialPropertyMap: PropertyMap | null;
}) {
  const [databaseUrl, setDatabaseUrl] = useState(initialDatabaseUrl ?? "");
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tableTitle, setTableTitle] = useState<string | null>(null);
  const [properties, setProperties] = useState<PropertyInfo[] | null>(null);

  const [tagName, setTagName] = useState(initialPropertyMap?.tag.name ?? "");
  const [statusName, setStatusName] = useState(initialPropertyMap?.status.name ?? "");
  const [readyValue, setReadyValue] = useState(initialPropertyMap?.status.readyValue ?? "");
  const [typeName, setTypeName] = useState(initialPropertyMap?.type?.name ?? "");
  const [tagsName, setTagsName] = useState(initialPropertyMap?.tags?.name ?? "");

  const [savedOk, setSavedOk] = useState(false);
  const [openingEnv, setOpeningEnv] = useState(false);
  const [openEnvError, setOpenEnvError] = useState<string | null>(null);

  function findProp(name: string): PropertyInfo | undefined {
    return properties?.find((p) => p.name === name);
  }

  async function handleOpenEnv() {
    setOpeningEnv(true);
    setOpenEnvError(null);
    try {
      const res = await fetch("/api/settings/open-env", { method: "POST" });
      if (!res.ok) {
        const data = await res.json();
        setOpenEnvError(data?.error ?? "שגיאה בפתיחת הקובץ");
      }
    } catch {
      setOpenEnvError("שגיאה בפתיחת הקובץ");
    } finally {
      setOpeningEnv(false);
    }
  }

  async function handleTest() {
    setTesting(true);
    setError(null);
    setSavedOk(false);
    const res = await fetch("/api/settings/notion/schema", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ databaseUrl }),
    });
    const data = await res.json();
    setTesting(false);
    if (!res.ok) {
      setError(data.error ?? "החיבור נכשל");
      setProperties(null);
      return;
    }
    setTableTitle(data.title);
    setProperties(data.properties);
  }

  async function handleSave() {
    if (!tagName || !statusName || !readyValue) {
      setError("צריך לבחור עמודת תגית, עמודת סטטוס, ואת הערך שמסמן מוכן");
      return;
    }
    const tagProp = findProp(tagName);
    const statusProp = findProp(statusName);
    if (!tagProp || !statusProp) return;

    const propertyMap: PropertyMap = {
      tag: { name: tagProp.name, type: tagProp.type },
      status: { name: statusProp.name, type: statusProp.type, readyValue },
      type: typeName ? { name: typeName, type: findProp(typeName)?.type ?? "select" } : null,
      tags: tagsName ? { name: tagsName, type: findProp(tagsName)?.type ?? "multi_select" } : null,
    };

    setSaving(true);
    setError(null);
    const res = await fetch("/api/settings/notion", {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ databaseUrl, propertyMap }),
    });
    const data = await res.json();
    setSaving(false);
    if (!res.ok) {
      setError(data.error ?? "השמירה נכשלה");
      return;
    }
    setSavedOk(true);
  }

  const statusProp = findProp(statusName);

  return (
    <div className="flex flex-col gap-4 text-sm">
      {!apiKeyConfigured && (
        <div className="flex flex-col gap-2 rounded-lg border border-amber-300 bg-amber-50 p-3 text-amber-800">
          <p>
            ⚠️ NOTION_API_KEY לא מוגדר. הוסיפי אותו לקובץ .env בשורש הפרויקט (ראו .env.example) ואז הפעילי מחדש את הכלי — בלעדיו החיבור לא יעבוד.
          </p>
          <div className="flex gap-2">
            <a
              href="https://www.notion.so/my-integrations"
              target="_blank"
              rel="noreferrer"
              className="self-start rounded-md border border-amber-400 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100"
            >
              🔑 פתחי את עמוד האינטגרציות ב-Notion (להעתקת הטוקן)
            </a>
            <button
              type="button"
              onClick={handleOpenEnv}
              disabled={openingEnv}
              className="self-start rounded-md border border-amber-400 px-3 py-1.5 text-xs text-amber-800 hover:bg-amber-100 disabled:opacity-50"
            >
              {openingEnv ? "פותחת..." : "📄 פתחי את קובץ ה-.env"}
            </button>
          </div>
          {openEnvError && <p className="text-xs text-red-600">{openEnvError}</p>}
        </div>
      )}
      {apiKeyConfigured && (
        <div className="flex flex-col gap-1 self-start">
          <div className="flex gap-3">
            <a
              href="https://www.notion.so/my-integrations"
              target="_blank"
              rel="noreferrer"
              className="self-start text-xs text-brand-red hover:text-brand-red-dark hover:underline"
            >
              🔑 עמוד האינטגרציות ב-Notion
            </a>
            <button
              type="button"
              onClick={handleOpenEnv}
              disabled={openingEnv}
              className="self-start text-xs text-brand-red hover:text-brand-red-dark hover:underline disabled:opacity-50"
            >
              {openingEnv ? "פותחת..." : "📄 פתחי את קובץ ה-.env"}
            </button>
          </div>
          {openEnvError && <p className="text-xs text-red-600">{openEnvError}</p>}
        </div>
      )}

      <div className="flex flex-col gap-1.5">
        <label className="font-medium text-brand-maroon">לינק לטבלת הקטעים ב-Notion</label>
        <div className="flex gap-2">
          <input
            type="text"
            value={databaseUrl}
            onChange={(e) => setDatabaseUrl(e.target.value)}
            placeholder="https://www.notion.so/..."
            dir="ltr"
            className="flex-1 rounded-lg border border-brand-pink/40 p-2 text-sm bg-white"
          />
          <button
            type="button"
            onClick={handleTest}
            disabled={testing || !databaseUrl.trim()}
            className="rounded-lg border border-brand-pink/40 px-3 py-2 text-sm hover:bg-brand-pink/10 disabled:opacity-50"
          >
            {testing ? "בודקת..." : "בדיקת חיבור"}
          </button>
        </div>
      </div>

      {error && <p className="text-red-600 text-xs">{error}</p>}
      {savedOk && <p className="text-green-700 text-xs">✓ נשמר בהצלחה</p>}

      {properties && (
        <div className="flex flex-col gap-3 rounded-lg border border-brand-pink/30 p-3">
          <p className="text-xs text-brand-maroon/60">מחוברת ל: {tableTitle}. בחרי מה מתאים לכל תפקיד:</p>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-brand-maroon/70">עמודת התגית (למשל #אימפרוביזציה)</label>
            <select value={tagName} onChange={(e) => setTagName(e.target.value)} className="rounded border border-brand-pink/40 bg-white p-1.5 text-xs">
              <option value="">בחרי עמודה...</option>
              {properties
                .filter((p) => TAG_TYPES.includes(p.type))
                .map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.type})
                  </option>
                ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-brand-maroon/70">עמודת הסטטוס</label>
            <select
              value={statusName}
              onChange={(e) => {
                setStatusName(e.target.value);
                setReadyValue("");
              }}
              className="rounded border border-brand-pink/40 bg-white p-1.5 text-xs"
            >
              <option value="">בחרי עמודה...</option>
              {properties
                .filter((p) => STATUS_TYPES.includes(p.type))
                .map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.type})
                  </option>
                ))}
            </select>
          </div>

          {statusProp && (
            <div className="flex flex-col gap-1">
              <label className="text-xs text-brand-maroon/70">איזה ערך בעמודה הזו מסמן &quot;מוכן&quot;?</label>
              <select value={readyValue} onChange={(e) => setReadyValue(e.target.value)} className="rounded border border-brand-pink/40 bg-white p-1.5 text-xs">
                <option value="">בחרי ערך...</option>
                {statusProp.options.map((o) => (
                  <option key={o} value={o}>
                    {o}
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="flex flex-col gap-1">
            <label className="text-xs text-brand-maroon/70">עמודת הסוג (Type) — אופציונלי</label>
            <select value={typeName} onChange={(e) => setTypeName(e.target.value)} className="rounded border border-brand-pink/40 bg-white p-1.5 text-xs">
              <option value="">ללא</option>
              {properties
                .filter((p) => TYPE_TYPES.includes(p.type))
                .map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.type})
                  </option>
                ))}
            </select>
          </div>

          <div className="flex flex-col gap-1">
            <label className="text-xs text-brand-maroon/70">עמודת התגיות (Tags) — אופציונלי</label>
            <select value={tagsName} onChange={(e) => setTagsName(e.target.value)} className="rounded border border-brand-pink/40 bg-white p-1.5 text-xs">
              <option value="">ללא</option>
              {properties
                .filter((p) => TAGS_TYPES.includes(p.type))
                .map((p) => (
                  <option key={p.name} value={p.name}>
                    {p.name} ({p.type})
                  </option>
                ))}
            </select>
          </div>

          <button
            type="button"
            onClick={handleSave}
            disabled={saving}
            className="self-start rounded-lg bg-brand-red px-4 py-2 text-white text-sm font-medium hover:bg-brand-red-dark disabled:opacity-50"
          >
            {saving ? "שומרת..." : "שמירה"}
          </button>
        </div>
      )}
    </div>
  );
}
