/**
 * סקאנר פרטים מזהים לפי סעיף 8 באפיון: בדיקה היוריסטית (לא בינה מלאכותית)
 * של הטקסט הגולמי לפני הכנת פייסבוק, לאיתור פרטים שעשויים לחשוף זהות.
 * זהו כלי עזר בלבד — הוא לא מחליף שיקול דעת משפטי, ולא משנה את הטקסט אוטומטית.
 */

export type PrivacyFlagType =
  | "phone"
  | "email"
  | "social_handle"
  | "id_number"
  | "possible_full_name"
  | "specific_place"
  | "sponsored_content";

export interface PrivacyFlag {
  type: PrivacyFlagType;
  match: string;
  context: string; // המשפט שבו נמצא הביטוי
}

const PHONE_REGEX = /0(?:5\d|[2-4]|[89])[-\s]?\d{3}[-\s]?\d{4}\b/g;
const EMAIL_REGEX = /[\w.+-]+@[\w-]+\.[\w.-]+/g;
const HANDLE_REGEX = /@[A-Za-z0-9_.]{2,}/g;
const ID_NUMBER_REGEX = /\b\d{9}\b/g;

// רשימת שמות פרטיים נפוצים בעברית — לצורך היוריסטיקה של "שם מלא" (שם פרטי + שם משפחה).
// זו רשימה חלקית ולא ממצה; מטרתה לתת אזהרה ראשונית, לא זיהוי מוחלט.
export const COMMON_HEBREW_FIRST_NAMES = new Set([
  "נועה","נועם","דניאל","יוסי","משה","דוד","שרה","רחל","מיכל","אורית",
  "יעל","טל","עומר","איתי","רועי","גיל","ליאור","שירה","הילה","דנה",
  "אבי","אמיר","רון","נתן","עידו","מאיה","שני","קרן","ורד","עדי",
  "אלון","גל","נדב","יובל","אריאל","תמר","נעמי","חן","עינב","סתיו",
]);

const PLACE_KEYWORDS = [
  "בית ספר",
  "בית הספר",
  "תיכון",
  "עובד ב",
  "עובדת ב",
  "עבדתי ב",
  "השכונה",
  "שכונת",
  "רחוב",
  "מתגורר ב",
  "מתגוררת ב",
];

const SPONSORED_KEYWORDS = ["בשיתוף", "בשותפות עם", "תודה ל... על", "קיבלתי מתנה מ", "ממומן על ידי"];

function splitSentences(text: string): string[] {
  return text.split(/(?<=[.!?\n])/).map((s) => s.trim()).filter(Boolean);
}

function findContext(sentences: string[], index: number): string {
  return sentences.find((s) => s.includes(sentences[index])) ?? sentences[index] ?? "";
}

export function scanForIdentifyingDetails(text: string): PrivacyFlag[] {
  const flags: PrivacyFlag[] = [];
  const sentences = splitSentences(text);

  const contextFor = (match: string) => sentences.find((s) => s.includes(match)) ?? text;

  for (const match of text.matchAll(PHONE_REGEX)) {
    flags.push({ type: "phone", match: match[0], context: contextFor(match[0]) });
  }
  for (const match of text.matchAll(EMAIL_REGEX)) {
    flags.push({ type: "email", match: match[0], context: contextFor(match[0]) });
  }
  for (const match of text.matchAll(HANDLE_REGEX)) {
    flags.push({ type: "social_handle", match: match[0], context: contextFor(match[0]) });
  }
  for (const match of text.matchAll(ID_NUMBER_REGEX)) {
    flags.push({ type: "id_number", match: match[0], context: contextFor(match[0]) });
  }

  // שם מלא אפשרי: מילה מתוך רשימת שמות פרטיים נפוצים ולאחריה מילה נוספת (שם משפחה משוער)
  const words = text.split(/\s+/);
  for (let i = 0; i < words.length - 1; i++) {
    const first = words[i].replace(/[^א-ת]/g, "");
    const second = words[i + 1].replace(/[^א-ת]/g, "");
    if (COMMON_HEBREW_FIRST_NAMES.has(first) && second.length >= 2) {
      const fullMatch = `${words[i]} ${words[i + 1]}`;
      flags.push({ type: "possible_full_name", match: fullMatch, context: contextFor(words[i]) });
    }
  }

  for (const keyword of PLACE_KEYWORDS) {
    if (text.includes(keyword)) {
      flags.push({ type: "specific_place", match: keyword, context: contextFor(keyword) });
    }
  }

  for (const keyword of SPONSORED_KEYWORDS) {
    if (text.includes(keyword)) {
      flags.push({ type: "sponsored_content", match: keyword, context: contextFor(keyword) });
    }
  }

  return flags;
}

export const PRIVACY_FLAG_LABELS: Record<PrivacyFlagType, string> = {
  phone: "מספר טלפון",
  email: "כתובת אימייל",
  social_handle: "שם משתמש ברשת חברתית",
  id_number: "מספר בעל 9 ספרות (עשוי להיות ת\"ז)",
  possible_full_name: "שם מלא אפשרי",
  specific_place: "מקום/מוסד ספציפי (עבודה, בית ספר, שכונה)",
  sponsored_content: "תוכן ממומן — יש לסמן #פרסומת / #ad",
};
