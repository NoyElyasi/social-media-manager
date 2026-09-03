import { h, type SatoriNode } from "./h";
import { pickAccessibleTextColor, MIN_FONT_SIZE_STORY } from "../accessibility";
import { prepareRtlWordLines, renderPreparedLines } from "./rtlText";

export const STORY_WIDTH = 1080;
export const STORY_HEIGHT = 1920; // יחס 9:16
const HORIZONTAL_PADDING = 80;

export interface StorySlideInput {
  marketingLine: string;
  linkLabel: string;
  backgroundHex: string;
}

export function buildStorySlideNode(input: StorySlideInput): SatoriNode {
  const { color: textColor } = pickAccessibleTextColor(input.backgroundHex);

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: STORY_WIDTH,
        height: STORY_HEIGHT,
        backgroundColor: input.backgroundHex,
        padding: 80,
        fontFamily: "Noto Sans Hebrew, Noto Sans Hebrew Latin",
        justifyContent: "center",
        alignItems: "center",
      },
    },
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          gap: 8,
          marginBottom: 56,
        },
      },
      ...renderPreparedLines(
        prepareRtlWordLines(input.marketingLine, MIN_FONT_SIZE_STORY + 12, STORY_WIDTH - 2 * HORIZONTAL_PADDING),
        { fontSize: MIN_FONT_SIZE_STORY + 12, fontWeight: 700, color: textColor, justifyContent: "center" }
      )
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          alignItems: "center",
          opacity: 0.9,
          border: `4px solid ${textColor}`,
          borderRadius: 24,
          padding: "20px 32px",
        },
      },
      ...renderPreparedLines(
        prepareRtlWordLines(input.linkLabel, MIN_FONT_SIZE_STORY, STORY_WIDTH - 2 * HORIZONTAL_PADDING - 64),
        { fontSize: MIN_FONT_SIZE_STORY, color: textColor, justifyContent: "center" }
      )
    )
  );
}
