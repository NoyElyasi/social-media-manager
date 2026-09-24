import { prisma } from "./db";

/**
 * חיבור ל-Notion API — שולף קטעים מוכנים (status="Ready", לפי המיפוי
 * שנקבע בהגדרות) מטבלה שהיא כותבת בה, לפי תגית תואמת (ראו weeklySchedule
 * לתגית — "אף פעם לא 2 פוסטים עם אותה תגית", אז חיפוש שווה-ערך מספיק).
 *
 * המפתח הסודי (NOTION_API_KEY) מגיע ממשתנה סביבה, לא מה-DB — היא ביקשה
 * שסודות לא יישבו בממשק/הגדרות. רק לינק הטבלה (לא סודי) נשמר ב-ProfileSettings.
 */

const NOTION_VERSION = "2022-06-28";

function getApiKey(): string | null {
  return process.env.NOTION_API_KEY?.trim() || null;
}

/** מזהה ה-database מתוך לינק Notion רגיל — התאריך/שם בלינק לא רלוונטי, רק ה-32 התווים ההקסה. */
export function extractDatabaseId(url: string): string | null {
  const withDashes = url.match(/([a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12})/i);
  if (withDashes) return withDashes[1].replace(/-/g, "");
  const bare = url.match(/([a-f0-9]{32})/i);
  return bare ? bare[1] : null;
}

async function notionFetch(path: string, apiKey: string, init: RequestInit = {}): Promise<Response> {
  return fetch(`https://api.notion.com/v1${path}`, {
    ...init,
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Notion-Version": NOTION_VERSION,
      "Content-Type": "application/json",
      ...(init.headers ?? {}),
    },
  });
}

async function notionErrorMessage(res: Response): Promise<string> {
  const data = await res.json().catch(() => null);
  return (data && typeof data === "object" && "message" in data ? String((data as { message: unknown }).message) : null) ?? `שגיאת Notion (${res.status})`;
}

export interface NotionPropertyInfo {
  name: string;
  type: string;
  options: string[]; // ל-select/status/multi_select בלבד — אחרת ריק
}

type NotionApiObject = Record<string, unknown>;

function readOptions(prop: NotionApiObject, key: string): string[] {
  const container = prop[key] as { options?: { name: string }[] } | undefined;
  return (container?.options ?? []).map((o) => o.name);
}

/** שולפת את סכימת הטבלה (שמות+סוגי עמודות+אפשרויות) — ל"בדיקת חיבור" ומיפוי בהגדרות. */
export async function fetchDatabaseSchema(
  databaseUrl: string
): Promise<{ ok: true; title: string; properties: NotionPropertyInfo[] } | { ok: false; error: string }> {
  const apiKey = getApiKey();
  if (!apiKey) return { ok: false, error: "לא הוגדר NOTION_API_KEY בקובץ .env — צריך להוסיף אותו ולהפעיל מחדש את הכלי" };

  const databaseId = extractDatabaseId(databaseUrl);
  if (!databaseId) return { ok: false, error: "לא הצלחתי לזהות database ID בלינק — העתיקי את הלינק המלא לטבלה מהדפדפן" };

  const res = await notionFetch(`/databases/${databaseId}`, apiKey);
  if (!res.ok) return { ok: false, error: await notionErrorMessage(res) };

  const data = (await res.json()) as NotionApiObject;
  const rawProperties = (data.properties ?? {}) as Record<string, NotionApiObject>;
  const properties: NotionPropertyInfo[] = Object.entries(rawProperties).map(([name, prop]) => {
    const type = String(prop.type);
    const options = type === "select" ? readOptions(prop, "select") : type === "status" ? readOptions(prop, "status") : type === "multi_select" ? readOptions(prop, "multi_select") : [];
    return { name, type, options };
  });

  const titleParts = (data.title ?? []) as { plain_text?: string }[];
  const title = titleParts.map((t) => t.plain_text ?? "").join("") || "טבלה ללא שם";

  return { ok: true, title, properties };
}

export interface NotionPropertyRef {
  name: string;
  type: string;
}

export interface NotionPropertyMap {
  tag: NotionPropertyRef;
  status: NotionPropertyRef & { readyValue: string };
  type: NotionPropertyRef | null;
  tags: NotionPropertyRef | null;
}

function buildEqualsFilter(prop: NotionPropertyRef, value: string): NotionApiObject {
  switch (prop.type) {
    case "title":
      return { property: prop.name, title: { equals: value } };
    case "select":
      return { property: prop.name, select: { equals: value } };
    case "status":
      return { property: prop.name, status: { equals: value } };
    default:
      return { property: prop.name, rich_text: { equals: value } };
  }
}

function extractSingleValue(prop: NotionApiObject | undefined): string | null {
  if (!prop) return null;
  const type = String(prop.type);
  if (type === "select") return (prop.select as { name?: string } | null)?.name ?? null;
  if (type === "status") return (prop.status as { name?: string } | null)?.name ?? null;
  if (type === "rich_text" || type === "title") {
    const parts = (prop[type] ?? []) as { plain_text?: string }[];
    return parts.map((p) => p.plain_text ?? "").join("") || null;
  }
  return null;
}

function extractMultiValue(prop: NotionApiObject | undefined): string[] {
  if (!prop) return [];
  if (String(prop.type) === "multi_select") {
    return ((prop.multi_select ?? []) as { name: string }[]).map((o) => o.name);
  }
  const single = extractSingleValue(prop);
  return single ? [single] : [];
}

/** מרכיבה את כל הטקסט של עמוד Notion (פסקאות/כותרות/רשימות) לטקסט רגיל, פסקה מופרדת בשורה ריקה — כדי לשמר ריווח/ירידת שורה כמו במקור. */
async function fetchPageBodyText(pageId: string, apiKey: string): Promise<string> {
  const paragraphs: string[] = [];
  let cursor: string | undefined;

  do {
    const qs = cursor ? `?start_cursor=${encodeURIComponent(cursor)}` : "";
    const res = await notionFetch(`/blocks/${pageId}/children${qs}`, apiKey);
    if (!res.ok) break;
    const data = (await res.json()) as NotionApiObject;
    const results = (data.results ?? []) as NotionApiObject[];

    for (const block of results) {
      const type = String(block.type);
      const richText = (block[type] as { rich_text?: { plain_text?: string }[] } | undefined)?.rich_text;
      paragraphs.push(Array.isArray(richText) ? richText.map((t) => t.plain_text ?? "").join("") : "");
    }

    cursor = data.has_more ? (data.next_cursor as string | undefined) : undefined;
  } while (cursor);

  return paragraphs.join("\n\n");
}

export interface NotionSegment {
  pageUrl: string;
  bodyText: string;
  // עמודת Type היא multi_select — שורה יכולה להכיל גם נושא (למשל "פחד") וגם
  // מילת-בקרה ("ישן"/"טיפ"/"מכתב") יחד, ראו applyNotionTypeValue.
  typeValues: string[];
  tagValues: string[];
}

async function loadNotionConfig(): Promise<{ apiKey: string; databaseId: string; map: NotionPropertyMap } | { error: string }> {
  const apiKey = getApiKey();
  if (!apiKey) return { error: "לא הוגדר NOTION_API_KEY בקובץ .env" };

  const profile = await prisma.profileSettings.findUnique({ where: { id: "default" } });
  if (!profile?.notionDatabaseUrl) return { error: "לא הוגדר חיבור ל-Notion בהגדרות" };

  const databaseId = extractDatabaseId(profile.notionDatabaseUrl);
  if (!databaseId) return { error: "לינק הטבלה בהגדרות לא תקין" };

  let map: NotionPropertyMap | null = null;
  try {
    map = profile.notionPropertyMap ? JSON.parse(profile.notionPropertyMap) : null;
  } catch {
    map = null;
  }
  if (!map) return { error: "צריך למפות את עמודות הטבלה בהגדרות (בדיקת חיבור) לפני חיפוש" };

  return { apiKey, databaseId, map };
}

/**
 * מחפשת קטע "מוכן" (status = הערך שנבחר בהגדרות) בטבלת ה-Notion, לפי תגית
 * תואמת. מנסה גם עם וגם בלי # מוביל (לא ידוע איך היא כותבת את התגית בטבלה).
 */
export async function findReadySegmentByTag(tag: string): Promise<{ ok: true; segment: NotionSegment | null } | { ok: false; error: string }> {
  const config = await loadNotionConfig();
  if ("error" in config) return { ok: false, error: config.error };
  const { apiKey, databaseId, map } = config;

  const cleanTag = tag.replace(/^#/, "").trim();
  const candidates = [tag.trim(), cleanTag].filter((v, i, arr) => v.length > 0 && arr.indexOf(v) === i);

  for (const candidate of candidates) {
    const filter = {
      and: [buildEqualsFilter(map.tag, candidate), buildEqualsFilter({ name: map.status.name, type: map.status.type }, map.status.readyValue)],
    };
    const res = await notionFetch(`/databases/${databaseId}/query`, apiKey, {
      method: "POST",
      body: JSON.stringify({ filter, page_size: 1 }),
    });
    if (!res.ok) return { ok: false, error: await notionErrorMessage(res) };

    const data = (await res.json()) as NotionApiObject;
    const page = (data.results as NotionApiObject[] | undefined)?.[0];
    if (page) {
      const pageId = String(page.id);
      const pageUrl = String(page.url);
      const properties = (page.properties ?? {}) as Record<string, NotionApiObject>;
      const bodyText = await fetchPageBodyText(pageId, apiKey);
      return {
        ok: true,
        segment: {
          pageUrl,
          bodyText,
          typeValues: map.type ? extractMultiValue(properties[map.type.name]) : [],
          tagValues: map.tags ? extractMultiValue(properties[map.tags.name]) : [],
        },
      };
    }
  }

  return { ok: true, segment: null };
}

export interface NotionReadyRow {
  tag: string;
  pageId: string;
  pageUrl: string;
  // ראו NotionSegment.typeValues — multi_select, יכול להכיל גם נושא וגם מילת-בקרה יחד.
  typeValues: string[];
  // זמן יצירת השורה בנושיין — לשימוש בתור ה"ישן" (מיון לפי סדר כתיבה בטבלה),
  // ראו weeklySchedule.ts. לא רלוונטי לתור ה"חדש", ששם ממיינים לפי שיקלול אחר.
  createdTime: string;
}

/**
 * כל השורות "מוכן" בטבלה, בלי טקסט גוף (יקר לשלוף — נשלף רק לשורות שבאמת
 * נבחרות, ראו getShortPreview) — לשימוש בסידור השבועי האוטומטי
 * (generateWeeklySchedule ב-weeklySchedule.ts). מחזירה [] בלי לזרוק אם
 * Notion לא מוגדר/נכשל, כדי שהשיבוץ יחזור בשקט למתכונת הרגילה (בלי הצעה).
 */
export async function listReadySegments(): Promise<NotionReadyRow[]> {
  const config = await loadNotionConfig();
  if ("error" in config) return [];
  const { apiKey, databaseId, map } = config;

  const rows: NotionReadyRow[] = [];
  let cursor: string | undefined;

  do {
    const filter = buildEqualsFilter({ name: map.status.name, type: map.status.type }, map.status.readyValue);
    const res = await notionFetch(`/databases/${databaseId}/query`, apiKey, {
      method: "POST",
      body: JSON.stringify({ filter, page_size: 100, ...(cursor ? { start_cursor: cursor } : {}) }),
    });
    if (!res.ok) break;

    const data = (await res.json()) as NotionApiObject;
    const results = (data.results ?? []) as NotionApiObject[];
    for (const page of results) {
      const properties = (page.properties ?? {}) as Record<string, NotionApiObject>;
      const tag = extractSingleValue(properties[map.tag.name]);
      if (!tag) continue;
      rows.push({
        tag,
        pageId: String(page.id),
        pageUrl: String(page.url),
        typeValues: map.type ? extractMultiValue(properties[map.type.name]) : [],
        createdTime: String(page.created_time ?? ""),
      });
    }
    cursor = data.has_more ? (data.next_cursor as string | undefined) : undefined;
  } while (cursor);

  return rows;
}

/**
 * כמו findReadySegmentByTag, אבל בלי סינון לפי סטטוס — לשימוש בסנכרון בפועל
 * (reconcileMonthWithInstagram ב-weeklySchedule.ts): בזמן שהתוכן פורסם בפועל
 * הסטטוס בנושיין כבר לא בהכרח "מוכן", אבל עמודת ה-Type שלה (טיפ/מכתב/ישן/
 * נושא) עדיין נכונה ורלוונטית לסיווג.
 */
export async function findSegmentTypeByTag(tag: string): Promise<string[] | null> {
  const config = await loadNotionConfig();
  if ("error" in config) return null;
  const { apiKey, databaseId, map } = config;

  const cleanTag = tag.replace(/^#/, "").trim();
  const candidates = [tag.trim(), cleanTag].filter((v, i, arr) => v.length > 0 && arr.indexOf(v) === i);

  for (const candidate of candidates) {
    const filter = buildEqualsFilter(map.tag, candidate);
    const res = await notionFetch(`/databases/${databaseId}/query`, apiKey, {
      method: "POST",
      body: JSON.stringify({ filter, page_size: 1 }),
    });
    if (!res.ok) continue;

    const data = (await res.json()) as NotionApiObject;
    const page = (data.results as NotionApiObject[] | undefined)?.[0];
    if (page) {
      const properties = (page.properties ?? {}) as Record<string, NotionApiObject>;
      return map.type ? extractMultiValue(properties[map.type.name]) : [];
    }
  }

  return null;
}

/** תקציר קצר של טקסט העמוד (לתצוגה בלוח השנה) — נשלף רק לקטע שכבר נבחר, לא לכל הרשימה. */
export async function getShortPreview(pageId: string): Promise<string> {
  const apiKey = getApiKey();
  if (!apiKey) return "";
  const text = await fetchPageBodyText(pageId, apiKey);
  return text.slice(0, 120);
}
