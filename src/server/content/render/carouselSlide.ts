import { h, type SatoriNode } from "./h";
import { MIN_FONT_SIZE_CAROUSEL } from "../accessibility";
import { prepareRtlWordLines, buildWordRowNode, renderPreparedLines } from "./rtlText";

export const CAROUSEL_WIDTH = 1080;
export const CAROUSEL_HEIGHT = 1350; // יחס 4:5
const HORIZONTAL_PADDING = 56;

// צבעים שמדמים כיתוב וכרטיס פוסט בפייסבוק (רקע לבן, כמו "צילום מסך" — סעיף 4.2/6).
const FB_TEXT_COLOR = "#050505";
const FB_SECONDARY_COLOR = "#65676B";
const FB_LINK_COLOR = "#385898";
const FB_AVATAR_BG = "#E4E6EB";

// גודל פונט קבוע לטקסט הגוף — לא תלוי באורך הטקסט (זה נראה כמו טעות אם זה קופץ בין עמודים).
// גדול במפורש מהמינימום הבסיסי — לפי משוב שהטקסט היה קטן מכדי לקרוא בלי זום.
const BODY_FONT_SIZE = MIN_FONT_SIZE_CAROUSEL + 14;
const BODY_LINE_GAP = 20;

export interface CarouselSlideInput {
  bodyText: string;
  hashtags: string[];
  pageIndex: number;
  pageCount: number;
  displayName: string;
  profileImageDataUri?: string | null;
}

function avatarNode(displayName: string, profileImageDataUri: string | null | undefined) {
  if (profileImageDataUri) {
    return h("img", {
      src: profileImageDataUri,
      width: 84,
      height: 84,
      style: { borderRadius: "50%", objectFit: "cover" },
    });
  }
  const initials = displayName.trim().slice(0, 2) || "?";
  return h(
    "div",
    {
      style: {
        display: "flex",
        width: 84,
        height: 84,
        borderRadius: "50%",
        backgroundColor: FB_AVATAR_BG,
        alignItems: "center",
        justifyContent: "center",
        fontSize: 30,
        fontWeight: 700,
        color: FB_SECONDARY_COLOR,
      },
    },
    initials
  );
}

export function buildCarouselSlideNode(input: CarouselSlideInput): SatoriNode {
  const availableWidth = CAROUSEL_WIDTH - 2 * HORIZONTAL_PADDING;
  const fontSize = BODY_FONT_SIZE;

  return h(
    "div",
    {
      style: {
        display: "flex",
        flexDirection: "column",
        width: CAROUSEL_WIDTH,
        height: CAROUSEL_HEIGHT,
        backgroundColor: "#FFFFFF",
        padding: HORIZONTAL_PADDING,
        fontFamily: "Noto Sans Hebrew, Noto Sans Hebrew Latin",
      },
    },
    // עוטפים את הכותרת (תמונת פרופיל + שם + תגיות) ואת גוף הטקסט יחד כיחידה אחת,
    // וממרכזים את *היחידה* אנכית בשטח הפנוי — כך שהמרחק הפנימי בין הכותרת
    // לטקסט נשאר קבוע וקטן, אבל כל הבלוק יחד יכול לזוז מעלה/מטה בעמוד.
    h(
      "div",
      {
        style: {
          display: "flex",
          flexDirection: "column",
          flex: 1,
          justifyContent: "center",
        },
      },
      // כותרת (תמונת פרופיל + שם) ותגיות — רק בעמוד הראשון, בדיוק כמו כותרת פוסט בפייסבוק
      // row-reverse (לא direction:"rtl") — ראו הערה ב-rtlText.ts על חוסר העקביות של satori
      ...(input.pageIndex === 1
        ? [
            h(
              "div",
              {
                style: {
                  display: "flex",
                  flexDirection: "row-reverse",
                  alignItems: "center",
                  gap: 20,
                  marginBottom: 20,
                },
              },
              avatarNode(input.displayName, input.profileImageDataUri),
              buildWordRowNode(input.displayName.split(/\s+/).filter(Boolean), {
                fontSize: 32,
                fontWeight: 700,
                color: FB_TEXT_COLOR,
              })
            ),
          ]
        : []),
      // גוף הפוסט: התגיות שנבחרו (רק בעמוד הראשון), ולאחריהן הטקסט
      h(
        "div",
        {
          style: {
            display: "flex",
            flexDirection: "column",
            alignItems: "flex-end",
            gap: BODY_LINE_GAP,
          },
        },
        ...(input.hashtags.length > 0 && input.pageIndex === 1
          ? [
              ...renderPreparedLines(
                prepareRtlWordLines(input.hashtags.join(" "), fontSize - 2, availableWidth),
                { fontSize: fontSize - 2, fontWeight: 400, color: FB_LINK_COLOR, justifyContent: "flex-end" }
              ),
              h("div", { style: { display: "flex", height: 12 } }),
            ]
          : []),
        ...renderPreparedLines(prepareRtlWordLines(input.bodyText, fontSize, availableWidth), {
          fontSize,
          fontWeight: 400,
          color: FB_TEXT_COLOR,
          justifyContent: "flex-end",
        })
      )
    ),
    h(
      "div",
      {
        style: {
          display: "flex",
          justifyContent: "center",
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: 24,
            color: FB_SECONDARY_COLOR,
          },
        },
        `${input.pageIndex} / ${input.pageCount}`
      )
    )
  );
}
