/**
 * ימים מיוחדים (חגים, מועדים, ימי ציון) — נשלפים חיים מ-Hebcal (ללא צורך
 * במפתח API), לא נשמרים ב-DB. משמשים להצגה/מידע בלוח השנה של התכנון השבועי
 * בלבד — לא חוסמים אוטומטית את הצעת הפרסום (לזה ראו BlockedDay, שהמשתמשת
 * קובעת בעצמה). אם השליפה נכשלת (אין רשת וכו') מחזירים מערך ריק בלי לזרוק —
 * הלוח ימשיך לעבוד גם בלי הימים המיוחדים.
 *
 * הערה: ימי בחירות (כלליות/מקומיות) אין להם API ציבורי אמין, ולכן לא
 * מגיעים מכאן בכלל — היא צריכה להוסיף אותם בעצמה כ-BlockedDay ידני.
 */

export interface SpecialDay {
  date: string; // YYYY-MM-DD
  title: string;
  isMajor: boolean;
}

function fmtDate(d: Date): string {
  return d.toISOString().slice(0, 10);
}

export async function getSpecialDays(start: Date, end: Date): Promise<SpecialDay[]> {
  const url = `https://www.hebcal.com/hebcal?cfg=json&start=${fmtDate(start)}&end=${fmtDate(end)}&maj=on&min=on&mod=on&i=on&c=off`;
  try {
    const res = await fetch(url, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data: { items?: { date?: string; title?: string; yomtov?: boolean }[] } = await res.json();
    const items = Array.isArray(data.items) ? data.items : [];
    return items
      .filter((it) => it.date && it.title)
      .map((it) => ({
        date: String(it.date).slice(0, 10),
        title: String(it.title),
        // yomtov=true = חג "אסור מלאכה" בפועל (ר"ה, יוה"כ, סוכות/פסח/שבועות
        // בימים הראשונים/אחרונים) — זה מה שחוסם את ההצעה האוטומטית, לא כל
        // "יום מיוחד" (צום/שבת מיוחדת/יום ציון מודרני לא חוסמים).
        isMajor: it.yomtov === true,
      }));
  } catch {
    return [];
  }
}
