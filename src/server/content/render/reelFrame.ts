import { h, type SatoriNode } from "./h";
import { pickAccessibleTextColor, MIN_FONT_SIZE_REEL } from "../accessibility";
import { prepareRtlWordLines, renderPreparedLines } from "./rtlText";

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920; // יחס 9:16
const HORIZONTAL_PADDING = 80;
// גדול במפורש מהמינימום הבסיסי — לפי משוב שהטקסט היה קטן מכדי לקרוא בלי זום.
const REEL_FONT_SIZE = MIN_FONT_SIZE_REEL + 36;
const REEL_LINE_GAP = 14;
// קטנה וקבועה בכוונה — לא פרופורציונלית לגודל הכתובית.
const HASHTAG_FONT_SIZE = 34;

// הכתובית: קצת יותר שמאלה מהצמדה מלאה לימין (לא צמודה לשוליים).
const CAPTION_RIGHT_INSET = 70;
const CAPTION_RIGHT_OFFSET = HORIZONTAL_PADDING + CAPTION_RIGHT_INSET;

// מיקום קבוע (לא יחסי/ממורכז) לשורה הראשונה של כל כתובית — לפי בקשה מפורשת
// "תתחיל תמיד מאותו מיקום, אל תרד אם המשפט קצר יותר". לא תלוי בגובה הטקסט
// בפועל (בניגוד לגרסה הקודמת שהשתמשה ב-flex spacers, וזזה בהתאם לכמות השורות).
const CAPTION_TOP_OFFSET = 700;

// ההאשטגים ממוקמים יחסית לכתובית עצמה (טיפה מעליה) ולא יחסית לרקע/ללוגו —
// כדי שלא "יתלשו" אם הרקע יוחלף לתבנית עם לוגו בגודל/מיקום אחר. bottom (לא
// top) כדי שאם יש כמה תגיות והשורה מתפצלת לשתי שורות, היא תגדל למעלה
// ותישאר צמודה לכתובית, במקום לדחוף את הכתובית.
const HASHTAG_GAP_ABOVE_CAPTION = 36;
const HASHTAG_BOTTOM_OFFSET = REEL_HEIGHT - CAPTION_TOP_OFFSET + HASHTAG_GAP_ABOVE_CAPTION;

// צבע טקסט קבוע לשימוש מעל תבנית הרקע (תמונה) — לא מחושב מהרקע (זו תמונה,
// לא צבע אחיד), נבחר ידנית כדי להתאים לפלטת המותג הבהירה (קרם/ורוד).
const TEMPLATE_TEXT_COLOR = "#4A1420";

export interface ReelFrameInput {
  /** הטקסט המלא של הכתובית הנוכחית — קבוע לאורך כל אנימציית הכתיבה שלה, כדי
   * שהפריסה/מיקום השורות תמיד יחושבו על הטקסט השלם (ראו revealedWordCount). */
  fullText: string;
  /** כמה מילים (מתוך fullText, בסדר הלוגי) חשופות ברגע הזה — effect כתיבה. */
  revealedWordCount: number;
  backgroundHex: string;
  /** תבנית רקע קבועה (תמונה, מוגדרת בהגדרות) — אם קיימת, מוצגת במקום הצבע האחיד. */
  backgroundImageDataUri?: string | null;
  /** תגיות הפוסט (בלי #אחתביום — היא מוטמעת כבר בתבנית הרקע) — מוצגות למעלה, בנפרד מהכתובית. */
  hashtags: string[];
}

/**
 * מסגרת בודדת בסרטון: כתובית אחת, צמודה לימין, על רקע צבעוני מלא או תבנית
 * מותג. אפקט "כתיבה בלייב": הפריסה (שורות/מיקום כל מילה) מחושבת פעם אחת על
 * הטקסט המלא של הכתובית, ולא משתנה בין מסגרות — כל מילה נחשפת (opacity)
 * במקום הסופי שלה בלי לזוז, לפי בקשה מפורשת "שהמילים לא זזות מהמיקום שלהן".
 * מיקום הכתובית וההאשטגים קבוע במוחלט (position:absolute) — לא תלוי בכמות
 * השורות בפועל, כך שכל כתובית מתחילה מאותה נקודה בדיוק.
 */
export function buildReelFrameNode(input: ReelFrameInput): SatoriNode {
  const hasTemplate = !!input.backgroundImageDataUri;
  const textColor = hasTemplate ? TEMPLATE_TEXT_COLOR : pickAccessibleTextColor(input.backgroundHex).color;

  return h(
    "div",
    {
      style: {
        display: "flex",
        position: "relative",
        flexDirection: "column",
        width: REEL_WIDTH,
        height: REEL_HEIGHT,
        backgroundColor: input.backgroundHex,
        padding: 80,
        fontFamily: "Noto Sans Hebrew, Noto Sans Hebrew Latin",
      },
    },
    hasTemplate &&
      h("img", {
        src: input.backgroundImageDataUri,
        width: REEL_WIDTH,
        height: REEL_HEIGHT,
        style: { position: "absolute", top: 0, left: 0, width: REEL_WIDTH, height: REEL_HEIGHT, objectFit: "cover" },
      }),
    input.hashtags.length > 0 &&
      h(
        "div",
        {
          style: {
            display: "flex",
            position: "absolute",
            flexDirection: "column",
            alignItems: "flex-end",
            bottom: HASHTAG_BOTTOM_OFFSET,
            right: CAPTION_RIGHT_OFFSET,
          },
        },
        ...renderPreparedLines(
          prepareRtlWordLines(input.hashtags.join(" "), HASHTAG_FONT_SIZE, REEL_WIDTH - 2 * HORIZONTAL_PADDING),
          { fontSize: HASHTAG_FONT_SIZE, fontWeight: 700, color: textColor, justifyContent: "flex-end" }
        )
      ),
    h(
      "div",
      {
        style: {
          display: "flex",
          position: "absolute",
          flexDirection: "column",
          alignItems: "flex-end",
          gap: REEL_LINE_GAP,
          top: CAPTION_TOP_OFFSET,
          right: CAPTION_RIGHT_OFFSET,
        },
      },
      ...renderPreparedLines(
        prepareRtlWordLines(input.fullText, REEL_FONT_SIZE, REEL_WIDTH - 2 * HORIZONTAL_PADDING - CAPTION_RIGHT_INSET),
        { fontSize: REEL_FONT_SIZE, fontWeight: 700, color: textColor, justifyContent: "flex-end" },
        input.revealedWordCount
      )
    )
  );
}
