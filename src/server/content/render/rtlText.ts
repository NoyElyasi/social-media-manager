import { h, type SatoriNode } from "./h";

/**
 * סאטורי (satori) לא מטפל טוב בטקסט RTL מרובה-מילים בתוך צומת טקסט אחד:
 * הסדר בין "מילים" (וגם בין ריצה עברית לתו לא-עברי צמוד) לא בהכרח נשמר.
 * הפתרון: אף פעם לא מעבירים לו מחרוזת מרובת-חלקים אחת; במקום זה בונים כל
 * שורה כ-flex row-reverse של תיבות נפרדות — כך שה-RTL וה-ריווח נשלטים
 * כליל על ידי Yoga (מנוע ה-flexbox), לא על ידי שכבת הטקסט/bidi הבעייתית.
 */
/**
 * אותה בעיה חוזרת גם *בתוך* מילה אחת, בכל מקום שמעורבב בה תו לא-עברי
 * (#, ., -, _ וכו') לצד אותיות עבריות — סאטורי לא בהכרח משמר את הסדר
 * הלוגי בין ה"ריצות" (runs). לדוגמה "#מבחן" עלול להציג את ה-# בצד שמאל
 * של המילה, ו"בדיקה." עלול להציג את הנקודה לפני האותיות ולא אחריהן.
 *
 * הפתרון: מפרקים כל מילה כזו לריצות (עברית לסירוגין עם לא-עברית), ומציגים
 * כל ריצה כתיבת flex נפרדת בתוך שורה "row-reverse" עם gap:0 — בדיוק כמו
 * שעושים לרשימת מילים שלמה (buildWordRowNode), רק ברזולוציה עמוקה יותר.
 * row-reverse מציב את הפריט הראשון במערך (בסדר הלוגי/המקורי) בקצה הימני,
 * כך שאין צורך בהיפוך ידני — התוצאה נכונה "מעצמה".
 */
const HEBREW_RUN_REGEX = new RegExp("[\\u0590-\\u05FF]+|[^\\u0590-\\u05FF]+", "g");

// revealed=false לא מציג את המילה (opacity:0) אבל שומר לה מקום מלא בפריסה —
// כך שמילים לא-חשופות עדיין תופסות את המקום הסופי שלהן, ומילים חשופות לא
// "זזות" כשמילה חדשה מצטרפת (ראו buildReelFrameNode / אפקט הכתיבה בריל).
function renderWordNode(word: string, revealed: boolean = true): SatoriNode {
  const visibility = revealed ? {} : { opacity: 0 };
  const segments = word.match(HEBREW_RUN_REGEX);
  if (!segments || segments.length <= 1) {
    return h("div", { style: { display: "flex", ...visibility } }, word);
  }
  return h(
    "div",
    { style: { display: "flex", flexDirection: "row-reverse", flexWrap: "nowrap", gap: 0, ...visibility } },
    ...segments.map((seg) => h("div", { style: { display: "flex" } }, seg))
  );
}

const HAS_HEBREW_REGEX = new RegExp("[\\u0590-\\u05FF]");

export function buildWordRowNode(
  words: string[],
  style: Record<string, unknown>,
  /** דגלי חשיפה למילה, באותו סדר לוגי כמו words (index 0 = המילה הראשונה שנקראת). ברירת מחדל: הכל חשוף. */
  revealedFlags?: boolean[]
): SatoriNode {
  // row-reverse מציג את המילה הראשונה במערך בקצה הימני — נכון לעברית (RTL).
  // אם אין אף אות עברית במילים (למשל שם תצוגה לטיני כמו "Noy Elyasi"),
  // הופכים את סדר המערך כדי ש-row-reverse "יתקן את עצמו" בחזרה לסדר LTR טבעי.
  const hasHebrew = words.some((w) => HAS_HEBREW_REGEX.test(w));
  const indices = words.map((_, i) => i);
  const orderedIndices = hasHebrew ? indices : [...indices].reverse();

  return h(
    "div",
    {
      style: {
        display: "flex",
        // "row" + direction:"rtl" התגלה כלא עקבי בסאטורי (הופך לפעמים את
        // הסדר, כולל מיקום ה-# בתוך תגית). "row-reverse" עם direction
        // רגיל (ltr) משתמש רק במנגנון ה-flex הבסיסי של Yoga, ומתנהג
        // עקבי: הילד הראשון במערך מוצג בקצה הימני, כמו שרוצים ב-RTL.
        flexDirection: "row-reverse",
        flexWrap: "nowrap",
        gap: typeof style.fontSize === "number" ? style.fontSize * 0.28 : 8,
        ...style,
      },
    },
    ...orderedIndices.map((i) => renderWordNode(words[i], revealedFlags ? revealedFlags[i] : true))
  );
}

/** אומדן מספר תווים שנכנס בשורה אחת, לפי גודל הפונט ורוחב זמין (בפיקסלים). */
export function estimateCharsPerLine(fontSize: number, availableWidthPx: number): number {
  const avgCharWidthPx = fontSize * 0.62; // אומדן שמרני לרוחב תו עברי ממוצע בגופן Noto Sans Hebrew
  return Math.max(8, Math.floor(availableWidthPx / avgCharWidthPx));
}

/**
 * שובר לשורות ומחזיר כל שורה כמערך מילים (בסדר טבעי/לוגי, בלי היפוך).
 * חשוב: בכל שורה מציגים את המילים כילדי flex נפרדים (לא כמחרוזת אחת עם
 * רווחים) — כך ה-RTL וה-ריווח נשלטים לחלוטין על ידינו (flexDirection +
 * direction:"rtl" + gap), ולא תלויים במימוש ה-bidi/הריווח הבעייתי של satori.
 */
// satori אינו מרנדר אמוג'י (אין לו גופן אמוג'י מובנה) — הוא מציג ריבוע ריק (tofu).
// מסירים אמוג'י רק כשמכינים את תוכן ה-*תמונה*; הטקסט לעריכה/העתקה נשאר עם האמוג'י כמו שהוא.
const EMOJI_REGEX =
  /[\u{1F1E6}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/gu;

// מסירים אמוג'י ומנרמלים רווחים/טאבים בתוך שורה — אבל לא נוגעים בירידות שורה
// בכלל: אלה נשלטות במפורש על ידי הקוראה, לא על ידי שכבת ה-wrap.
function stripEmoji(text: string): string {
  return text.replace(EMOJI_REGEX, "").replace(/[ \t]+/g, " ");
}

/**
 * שורה ריקה (null) מייצגת ירידת שורה/הפרדת פסקאות שהמשתמשת הכניסה בעצמה —
 * מרונדרת כרווח אנכי, לא נעלמת. שורה עם תוכן (string[]) עוברת גם היא
 * חלוקה-לפי-רוחב אם היא ארוכה מהמקום הזמין, אבל אף פעם לא מתמזגת עם שורה
 * הבאה שהמשתמשת הפרידה בכוונה עם Enter.
 */
export function wrapIntoWordLines(text: string, maxCharsPerLine: number): (string[] | null)[] {
  const rawLines = stripEmoji(text).split("\n");
  const result: (string[] | null)[] = [];

  for (const rawLine of rawLines) {
    const trimmedLine = rawLine.trim();
    if (!trimmedLine) {
      result.push(null);
      continue;
    }

    const words = trimmedLine.split(/\s+/).filter(Boolean);
    let current: string[] = [];
    let currentLen = 0;

    for (const word of words) {
      const addedLen = current.length === 0 ? word.length : word.length + 1;
      if (currentLen + addedLen > maxCharsPerLine && current.length > 0) {
        result.push(current);
        current = [word];
        currentLen = word.length;
      } else {
        current.push(word);
        currentLen += addedLen;
      }
    }
    if (current.length) result.push(current);
  }

  return result;
}

/** משבצת: שבירה לשורות לפי רוחב זמין, בלי לאחד ירידות שורה שהמשתמשת הכניסה. */
export function prepareRtlWordLines(
  text: string,
  fontSize: number,
  availableWidthPx: number
): (string[] | null)[] {
  const maxCharsPerLine = estimateCharsPerLine(fontSize, availableWidthPx);
  return wrapIntoWordLines(text, maxCharsPerLine);
}

/**
 * מרנדרת מערך שורות (מ-prepareRtlWordLines) לרשימת satori nodes: שורת מילים
 * רגילה, או רווח אנכי במקום שורה ריקה (ירידת שורה/פסקה שהמשתמשת הכניסה).
 *
 * revealedWordCount (אופציונלי): כמה מילים "חשופות" בסך הכול, נספר לפי הסדר
 * הלוגי על פני כל השורות (למשל אפקט כתיבה בריל — ראו buildReelFrameNode).
 * אם לא סופק, כל המילים חשופות (ברירת המחדל, שקולה להתנהגות הקודמת).
 */
export function renderPreparedLines(
  lines: (string[] | null)[],
  style: Record<string, unknown>,
  revealedWordCount?: number
): SatoriNode[] {
  const fontSize = typeof style.fontSize === "number" ? style.fontSize : 16;
  let consumed = 0;
  return lines.map((entry) => {
    if (entry === null) {
      return h("div", { style: { display: "flex", height: Math.round(fontSize * 0.6) } });
    }
    const flags =
      revealedWordCount === undefined ? undefined : entry.map((_, idx) => consumed + idx < revealedWordCount);
    consumed += entry.length;
    return buildWordRowNode(entry, style, flags);
  });
}
