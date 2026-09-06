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

// מיקום קבוע (לא יחסי לגובה התוכן) לתחילת הכותרת/טקסט — לפי בקשה מפורשת
// "המיקום משתנה כל עמוד, אני רוצה שיהיה קבוע" (הגרסה הקודמת השתמשה ב-flex
// כדי למרכז אנכית, ולכן זזה בהתאם לכמות השורות). לא גבוה מידי (יש רווח נוח
// מהראש) ולא צמוד מידי לימין (ראו CONTENT_RIGHT_INSET, בדיוק כמו CAPTION_RIGHT_INSET בריל).
const CONTENT_TOP_OFFSET = 320;
const CONTENT_RIGHT_INSET = 40;
const CONTENT_RIGHT_OFFSET = HORIZONTAL_PADDING + CONTENT_RIGHT_INSET;
const FOOTER_BOTTOM_OFFSET = 56;

// גדול יותר לפי בקשה מפורשת ("הלוגו של תמונת הפרופיל קטן מידי") — היה 84.
const AVATAR_SIZE = 120;
const AVATAR_NAME_FONT_SIZE = 38;

// עמוד שער: כותרת גדולה (התיוג הראשי) במרכז, מעל תבנית רקע — צבעים קבועים
// שתואמים את פלטת התבניות (קרם/ורוד/אדום), בדיוק כמו TEMPLATE_TEXT_COLOR בריל.
const COVER_HASHTAG_COLOR = "#C41E3A";
const COVER_UNDERLINE_COLOR = "#E7A9B8";
// גדול ועבה יותר לפי בקשה מפורשת (הועלה מ-88/700) — 900 (Black) הוא המשקל
// הכבד ביותר שיש לגופן העברי שלנו (ראו fonts.ts), Bold (700) לא היה עבה מספיק.
const COVER_FONT_SIZE = 120;
const COVER_FONT_WEIGHT = 900;
const COVER_HORIZONTAL_PADDING = 90;
const COVER_UNDERLINE_WIDTH = 220;

export interface CarouselSlideInput {
  bodyText: string;
  hashtags: string[];
  pageIndex: number;
  pageCount: number;
  displayName: string;
  profileImageDataUri?: string | null;
  /** תבנית רקע שהועלתה ונבחרה בזמן יצירת הפוסט — מחליפה את הרקע הלבן לגמרי (בלי בחירה: לבן כבררת מחדל, כמו קודם). */
  backgroundImageDataUri?: string | null;
}

function avatarNode(displayName: string, profileImageDataUri: string | null | undefined) {
  if (profileImageDataUri) {
    return h("img", {
      src: profileImageDataUri,
      width: AVATAR_SIZE,
      height: AVATAR_SIZE,
      style: { borderRadius: "50%", objectFit: "cover" },
    });
  }
  const initials = displayName.trim().slice(0, 2) || "?";
  return h(
    "div",
    {
      style: {
        display: "flex",
        width: AVATAR_SIZE,
        height: AVATAR_SIZE,
        borderRadius: "50%",
        backgroundColor: FB_AVATAR_BG,
        alignItems: "center",
        justifyContent: "center",
        fontSize: 40,
        fontWeight: 700,
        color: FB_SECONDARY_COLOR,
      },
    },
    initials
  );
}

export function buildCarouselSlideNode(input: CarouselSlideInput): SatoriNode {
  const availableWidth = CAROUSEL_WIDTH - 2 * HORIZONTAL_PADDING - CONTENT_RIGHT_INSET;
  const fontSize = BODY_FONT_SIZE;

  return h(
    "div",
    {
      style: {
        display: "flex",
        position: "relative",
        flexDirection: "column",
        width: CAROUSEL_WIDTH,
        height: CAROUSEL_HEIGHT,
        backgroundColor: "#FFFFFF",
        padding: HORIZONTAL_PADDING,
        fontFamily: "Noto Sans Hebrew, Noto Sans Hebrew Latin",
      },
    },
    // תבנית רקע נבחרת (אם יש) מחליפה את הלבן לגמרי — תמונה מלאה מתחת לכל
    // התוכן (כרטיס הפרופיל/הטקסט מצוירים אחריה ב-DOM, ולכן מעליה חזותית).
    !!input.backgroundImageDataUri &&
      h("img", {
        src: input.backgroundImageDataUri,
        width: CAROUSEL_WIDTH,
        height: CAROUSEL_HEIGHT,
        style: {
          position: "absolute",
          top: 0,
          left: 0,
          width: CAROUSEL_WIDTH,
          height: CAROUSEL_HEIGHT,
          objectFit: "cover",
        },
      }),
    // עוטפים את הכותרת (תמונת פרופיל + שם + תגיות) ואת גוף הטקסט יחד כיחידה אחת,
    // במיקום קבוע (position:absolute) — לא תלוי בכמות השורות בפועל, כך שכל
    // עמוד מתחיל מאותה נקודה בדיוק (לפי בקשה מפורשת, ראו CONTENT_TOP_OFFSET).
    h(
      "div",
      {
        style: {
          display: "flex",
          position: "absolute",
          flexDirection: "column",
          alignItems: "flex-end",
          top: CONTENT_TOP_OFFSET,
          right: CONTENT_RIGHT_OFFSET,
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
                  marginBottom: 24,
                },
              },
              avatarNode(input.displayName, input.profileImageDataUri),
              buildWordRowNode(input.displayName.split(/\s+/).filter(Boolean), {
                fontSize: AVATAR_NAME_FONT_SIZE,
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
          position: "absolute",
          bottom: FOOTER_BOTTOM_OFFSET,
          left: 0,
          right: 0,
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

export interface CoverSlideInput {
  /** תבנית הרקע שהועלתה ונבחרה בהגדרות לעמוד שער — מלאה, בלי fallback (בלי בחירה, אין עמוד שער בכלל). */
  backgroundImageDataUri: string;
  /** התיוג הראשי שיוצג גדול במרכז (בלי #אחתביום — היא כבר מוטבעת בתבנית הרקע עצמה). */
  hashtagText: string;
}

/**
 * עמוד שער אופציונלי לקרוסלה: תבנית רקע מלאה עם התיוג הראשי של הפוסט מוצג
 * גדול, ממורכז, עם קו תחתון דקורטיבי — בלי כרטיס פרופיל/מספור עמודים
 * (לא נספר ב-pageIndex/pageCount של שאר העמודים, ראו instagramCarousel.ts).
 */
export function buildCoverSlideNode(input: CoverSlideInput): SatoriNode {
  const availableWidth = CAROUSEL_WIDTH - 2 * COVER_HORIZONTAL_PADDING;

  return h(
    "div",
    {
      style: {
        display: "flex",
        position: "relative",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        width: CAROUSEL_WIDTH,
        height: CAROUSEL_HEIGHT,
        padding: COVER_HORIZONTAL_PADDING,
        fontFamily: "Noto Sans Hebrew, Noto Sans Hebrew Latin",
      },
    },
    h("img", {
      src: input.backgroundImageDataUri,
      width: CAROUSEL_WIDTH,
      height: CAROUSEL_HEIGHT,
      style: {
        position: "absolute",
        top: 0,
        left: 0,
        width: CAROUSEL_WIDTH,
        height: CAROUSEL_HEIGHT,
        objectFit: "cover",
      },
    }),
    h(
      "div",
      { style: { display: "flex", flexDirection: "column", alignItems: "center", gap: 16 } },
      ...renderPreparedLines(prepareRtlWordLines(input.hashtagText, COVER_FONT_SIZE, availableWidth), {
        fontSize: COVER_FONT_SIZE,
        fontWeight: COVER_FONT_WEIGHT,
        color: COVER_HASHTAG_COLOR,
        justifyContent: "center",
      }),
      h("div", {
        style: { display: "flex", width: COVER_UNDERLINE_WIDTH, height: 6, backgroundColor: COVER_UNDERLINE_COLOR },
      })
    )
  );
}
