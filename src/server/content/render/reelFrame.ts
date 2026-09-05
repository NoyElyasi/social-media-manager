import { h, type SatoriNode } from "./h";
import { pickAccessibleTextColor, MIN_FONT_SIZE_REEL } from "../accessibility";
import { prepareRtlWordLines, renderPreparedLines } from "./rtlText";

export const REEL_WIDTH = 1080;
export const REEL_HEIGHT = 1920; // יחס 9:16
const HORIZONTAL_PADDING = 80;
const REEL_FONT_SIZE = MIN_FONT_SIZE_REEL + 8;

export interface ReelFrameInput {
  /** הטקסט שכבר "נכתב" מהכתובית הנוכחית, עד לרגע הזה בזמן. */
  visibleText: string;
  backgroundHex: string;
}

/** מסגרת בודדת בסרטון: כתובית אחת, ממורכזת, על רקע צבעוני מלא. */
export function buildReelFrameNode(input: ReelFrameInput): SatoriNode {
  const { color: textColor } = pickAccessibleTextColor(input.backgroundHex);

  return h(
    "div",
    {
      style: {
        display: "flex",
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
    ...renderPreparedLines(
      prepareRtlWordLines(input.visibleText, REEL_FONT_SIZE, REEL_WIDTH - 2 * HORIZONTAL_PADDING),
      { fontSize: REEL_FONT_SIZE, fontWeight: 700, color: textColor, justifyContent: "center" }
    )
  );
}
