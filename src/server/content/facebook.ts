import { scanForIdentifyingDetails } from "./privacyScanner";
import { ALWAYS_FIRST_HASHTAG } from "@/lib/labels";

export { ALWAYS_FIRST_HASHTAG };

/**
 * הכנת דראפט לפייסבוק, לפי סעיף 4.1: הגהה בסיסית + הצעת תגיות + הצעת תיוגים.
 * ה"הגהה" כאן היא נרמול טקסט בסיסי (רווחים/פיסוק כפולים) — לא בדיקת כתיב מלאה.
 * שאלת ה-4.1 בנוגע ל"למידת תגיות חוזרות" נותרה פתוחה (ניתן להוסיף בהמשך).
 */

function normalizeHashtag(tag: string): string {
  const trimmed = tag.trim();
  if (!trimmed) return trimmed;
  return trimmed.startsWith("#") ? trimmed : `#${trimmed}`;
}

/**
 * בונה את רשימת התגיות הסופית: אם המשתמשת הזינה תגיות ידניות — משתמשים
 * בהן (ולא בהצעה האוטומטית). התגית הקבועה מופיעה תמיד ראשונה, בכל מקרה.
 */
export function finalizeHashtags(manualHashtags: string[] | undefined | null, autoSuggested: string[]): string[] {
  const base = manualHashtags && manualHashtags.length > 0
    ? manualHashtags.map(normalizeHashtag).filter(Boolean)
    : autoSuggested;

  const withoutPinned = base.filter((tag) => tag !== ALWAYS_FIRST_HASHTAG);
  return [ALWAYS_FIRST_HASHTAG, ...withoutPinned];
}

const STOPWORDS = new Set([
  "את","של","על","עם","לא","כן","זה","זו","אני","הוא","היא","אנחנו","הם","הן",
  "גם","אבל","כי","אם","מה","איך","למה","כמו","יותר","פחות","כל","כלום","יש",
  "אין","היה","היו","להיות","אז","רק","עוד","כבר","שם","פה","הזה","הזאת","אלה",
  "או","וגם","כש","כדי","בין","אחרי","לפני","עד","מאוד","קצת","הרבה","אחד","אחת",
]);

// חשוב: לא נוגעים בירידות שורה/הפרדת פסקאות בכלל — רק ברווחים/טאבים בתוך שורה,
// ובכפילויות סימני פיסוק. המשתמשת ביקשה במפורש לשמור על השורות והפסקאות כמו שהיא כתבה.
function normalizeText(rawText: string): string {
  return rawText
    .replace(/[ \t]+/g, " ")
    .replace(/([.,!?])\1+/g, "$1")
    .replace(/ ([.,!?])/g, "$1")
    .trim();
}

export function suggestHashtags(text: string, max = 6): string[] {
  const words = text
    .replace(/[^א-ת\s]/g, " ")
    .split(/\s+/)
    .map((w) => w.trim())
    .filter((w) => w.length >= 3 && !STOPWORDS.has(w));

  const counts = new Map<string, number>();
  for (const w of words) counts.set(w, (counts.get(w) ?? 0) + 1);

  return [...counts.entries()]
    .sort((a, b) => b[1] - a[1])
    .slice(0, max)
    .map(([word]) => `#${word}`);
}

export function suggestTags(text: string): string[] {
  const flags = scanForIdentifyingDetails(text).filter((f) => f.type === "possible_full_name");
  return [...new Set(flags.map((f) => f.match))];
}

export interface FacebookDraft {
  text: string;
  hashtags: string[];
  tags: string[];
}

export function prepareFacebookDraft(rawText: string, manualHashtags?: string[] | null): FacebookDraft {
  return {
    text: normalizeText(rawText),
    hashtags: finalizeHashtags(manualHashtags, suggestHashtags(rawText)),
    tags: suggestTags(rawText),
  };
}
