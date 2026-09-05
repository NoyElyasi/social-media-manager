import { h, type SatoriNode } from "./h";
import { pickAccessibleTextColor, MIN_FONT_SIZE_REEL } from "../accessibility";
import { prepareRtlWordLines, renderPreparedLines } from "./rtlText";

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920; // יחס 9:16
const HORIZONTAL_PADDING = 80;
const REEL_FONT_SIZE = MIN_FONT_SIZE_REEL + 8;

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
}

/**
 * מסגרת בודדת בסרטון: כתובית אחת, ממורכזת, על רקע צבעוני מלא או תבנית מותג.
 * אפקט "כתיבה בלייב": הפריסה (שורות/מיקום כל מילה) מחושבת פעם אחת על הטקסט
 * המלא של הכתובית, ולא משתנה בין מסגרות — כל מילה נחשפת (opacity) במקום
 * הסופי שלה בלי לזוז, לפי בקשה מפורשת "שהמילים לא זזות מהמיקום שלהן".
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
        justifyContent: "center",
        alignItems: "center",
      },
    },
    hasTemplate &&
      h("img", {
        src: input.backgroundImageDataUri,
        width: REEL_WIDTH,
        height: REEL_HEIGHT,
        style: { position: "absolute", top: 0, left: 0, width: REEL_WIDTH, height: REEL_HEIGHT, objectFit: "cover" },
      }),
    h(
      "div",
      { style: { display: "flex", position: "relative", flexDirection: "column" } },
      ...renderPreparedLines(
        prepareRtlWordLines(input.fullText, REEL_FONT_SIZE, REEL_WIDTH - 2 * HORIZONTAL_PADDING),
        { fontSize: REEL_FONT_SIZE, fontWeight: 700, color: textColor, justifyContent: "center" },
        input.revealedWordCount
      )
    )
  );
}
