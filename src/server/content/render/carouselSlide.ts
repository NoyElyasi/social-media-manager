import { h, type SatoriNode } from "./h";
import { MIN_FONT_SIZE_CAROUSEL } from "../accessibility";
import { ALWAYS_FIRST_HASHTAG } from "@/lib/labels";
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

// פוסט "קצר" (מעט מלל): פונט גדול יותר, בלי לוגו תמונת הפרופיל, והתגית (ראשונה
// בבלוק) גבוהה וימינית יותר — הבלוק מתחיל ישר בנקודת ההתחלה של התבנית ומוצמד
// ימינה יותר בהפחתת SHORT_RIGHT_INSET_REDUCTION מהשוליים הרגילים.
const SHORT_BODY_FONT_SIZE = MIN_FONT_SIZE_CAROUSEL + 34;
const SHORT_RIGHT_INSET_REDUCTION = 40;
// תגית קטנה ורחוקה מהטקסט, ופסקאות עם רווח ביניהן אבל שורות צפופות בתוך פסקה (לפי הדוגמה שסופקה).
const SHORT_HASHTAG_FONT_SIZE = 28;
const SHORT_HASHTAG_GAP = 35;
const SHORT_HASHTAG_TOP_SHIFT = 35;
const SHORT_BODY_FONT_WEIGHT = 700;
const SHORT_PARAGRAPH_GAP_RATIO = 0.7;
const SHORT_DARK_TEXT_COLOR = "#FEF9F4";
// פוסט קצר תמיד נכנס לעמוד אחד: הפונט קטן בהדרגה מ-SHORT_BODY_FONT_SIZE עד שהטקסט נכנס בגובה הפנוי (אך לא מתחת לרצפה).
const SHORT_MIN_FIT_FONT_SIZE = 26;
// בפוסט קצר שואפים ל-5–6 מילים בשורה: הפונט הגדול ביותר שבו ממוצע המילים בשורה מלאה הוא לפחות 5 (ובכל מקרה בלי לחרוג מהעמוד).
const SHORT_MIN_AVG_WORDS_PER_LINE = 5.5;
const SHORT_FIT_LINE_HEIGHT = 1.45;
const SHORT_FIT_BOTTOM_MARGIN = 60;
const SHORT_FIT_FOOTER_RESERVE = 150;

// מיקום קבוע (לא יחסי לגובה התוכן) לתחילת הכותרת/טקסט — לפי בקשה מפורשת
// "המיקום משתנה כל עמוד, אני רוצה שיהיה קבוע" (הגרסה הקודמת השתמשה ב-flex
// כדי למרכז אנכית, ולכן זזה בהתאם לכמות השורות). לא גבוה מידי (יש רווח נוח
// מהראש) ולא צמוד מידי לימין (ראו CONTENT_RIGHT_INSET, בדיוק כמו CAPTION_RIGHT_INSET בריל).
const CONTENT_TOP_OFFSET = 340;
const CONTENT_RIGHT_INSET = 100;
const FOOTER_BOTTOM_OFFSET = 56;

// פס התקדמות מתחת למספור העמודים — בגוונים של המותג (אדום על ורוד), או
// בגוונים בהירים כשהתבנית מסומנת "כהה" בהגדרות (ראו setCarouselBackgroundDark)
// כדי שלא יבלע ברקע. לפי בקשה מפורשת שיתמלא ב"אחוזים לפי מספר הדפים שנותרו".
const PROGRESS_BAR_WIDTH = 260;
const PROGRESS_BAR_HEIGHT = 6;
const PROGRESS_BAR_TOP_GAP = 14;
const PROGRESS_TRACK_COLOR = "#E7A9B8";
const PROGRESS_FILL_COLOR = "#C41E3A";
const PROGRESS_TRACK_COLOR_DARK = "rgba(255,255,255,0.35)";
const PROGRESS_FILL_COLOR_DARK = "#FFFFFF";
const FOOTER_TEXT_COLOR_DARK = "#FFFFFF";

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
  /** התבנית מסומנת "כהה" בהגדרות — פס ההתקדמות ומספור העמודים יוצגו בגוונים בהירים (ראו setCarouselBackgroundDark). */
  isDarkBackground?: boolean;
  /** מיקום טקסט מותאם לתבנית הזו (ראו setBackgroundTextPosition) — override לקבועים הרגילים, כדי שהטקסט לא יתנגש בעיטורים של הרקע. null/undefined = ברירת המחדל (CONTENT_TOP_OFFSET/CONTENT_RIGHT_INSET). */
  textTopOffset?: number | null;
  textRightInset?: number | null;
  /** פוסט "קצר" — ראו SHORT_BODY_FONT_SIZE. */
  isShort?: boolean;
  hideProgressBar?: boolean;
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

function shownHashtags(input: CarouselSlideInput): string[] {
  return input.isShort ? input.hashtags.filter((tag) => tag !== ALWAYS_FIRST_HASHTAG) : input.hashtags;
}

function shortParagraphLines(bodyText: string, fontSize: number, availableWidth: number): string[][][] {
  return bodyText
    .split("\n")
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => prepareRtlWordLines(p, fontSize, availableWidth).filter((l): l is string[] => l !== null))
    .filter((lines) => lines.length > 0);
}

function estimateBodyHeight(input: CarouselSlideInput, fontSize: number, availableWidth: number): number {
  let height = 0;
  const hashtags = shownHashtags(input);
  if (hashtags.length > 0 && input.pageIndex === 1) {
    const tagLines = prepareRtlWordLines(hashtags.join(" "), SHORT_HASHTAG_FONT_SIZE, availableWidth).length;
    height += tagLines * SHORT_HASHTAG_FONT_SIZE * SHORT_FIT_LINE_HEIGHT + SHORT_HASHTAG_GAP;
  }
  const paragraphs = shortParagraphLines(input.bodyText, fontSize, availableWidth);
  const lineCount = paragraphs.reduce((sum, lines) => sum + lines.length, 0);
  height += lineCount * fontSize * SHORT_FIT_LINE_HEIGHT;
  height += Math.max(0, paragraphs.length - 1) * Math.round(fontSize * SHORT_PARAGRAPH_GAP_RATIO);
  return height;
}

function averageWordsPerFullLine(paragraphs: string[][][]): number | null {
  let words = 0;
  let count = 0;
  for (const lines of paragraphs) {
    for (const line of lines.slice(0, -1)) {
      words += line.length;
      count++;
    }
  }
  return count === 0 ? null : words / count;
}

function fitShortFontSize(input: CarouselSlideInput, topOffset: number, availableWidth: number): number {
  const showsFooter = input.pageCount > 1 && !input.hideProgressBar;
  const availableHeight =
    CAROUSEL_HEIGHT - topOffset - (showsFooter ? SHORT_FIT_FOOTER_RESERVE : SHORT_FIT_BOTTOM_MARGIN);
  for (let size = SHORT_BODY_FONT_SIZE; size > SHORT_MIN_FIT_FONT_SIZE; size -= 2) {
    if (estimateBodyHeight(input, size, availableWidth) > availableHeight) continue;
    const avgWords = averageWordsPerFullLine(shortParagraphLines(input.bodyText, size, availableWidth));
    if (avgWords === null || avgWords >= SHORT_MIN_AVG_WORDS_PER_LINE) return size;
  }
  return SHORT_MIN_FIT_FONT_SIZE;
}

export function buildCarouselSlideNode(input: CarouselSlideInput): SatoriNode {
  const baseTopOffset = input.textTopOffset ?? CONTENT_TOP_OFFSET;
  const rightInset = input.textRightInset ?? CONTENT_RIGHT_INSET;
  const isShort = !!input.isShort;
  const effectiveRightInset = isShort ? Math.max(0, rightInset - SHORT_RIGHT_INSET_REDUCTION) : rightInset;
  const rightOffset = HORIZONTAL_PADDING + effectiveRightInset;
  const availableWidth = CAROUSEL_WIDTH - 2 * HORIZONTAL_PADDING - effectiveRightInset;
  const hashtags = shownHashtags(input);
  const topOffset =
    isShort && hashtags.length > 0 && input.pageIndex === 1 ? baseTopOffset + SHORT_HASHTAG_TOP_SHIFT : baseTopOffset;
  const fontSize = isShort ? fitShortFontSize(input, topOffset, availableWidth) : BODY_FONT_SIZE;
  const progress = Math.min(1, Math.max(0, input.pageIndex / input.pageCount));
  const filledWidth = Math.round(PROGRESS_BAR_WIDTH * progress);

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
          top: topOffset,
          right: rightOffset,
        },
      },
      // כותרת (תמונת פרופיל + שם) ותגיות — רק בעמוד הראשון, בדיוק כמו כותרת פוסט בפייסבוק
      // row-reverse (לא direction:"rtl") — ראו הערה ב-rtlText.ts על חוסר העקביות של satori
      ...(input.pageIndex === 1 && !isShort
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
      isShort
        ? h(
            "div",
            { style: { display: "flex", flexDirection: "column", alignItems: "flex-end" } },
            ...(hashtags.length > 0 && input.pageIndex === 1
              ? [
                  ...renderPreparedLines(prepareRtlWordLines(hashtags.join(" "), SHORT_HASHTAG_FONT_SIZE, availableWidth), {
                    fontSize: SHORT_HASHTAG_FONT_SIZE,
                    fontWeight: 400,
                    color: input.isDarkBackground ? SHORT_DARK_TEXT_COLOR : FB_LINK_COLOR,
                    justifyContent: "flex-end",
                  }),
                  h("div", { style: { display: "flex", height: SHORT_HASHTAG_GAP } }),
                ]
              : []),
            ...shortParagraphLines(input.bodyText, fontSize, availableWidth).flatMap((lines, i) => [
              ...(i > 0
                ? [h("div", { style: { display: "flex", height: Math.round(fontSize * SHORT_PARAGRAPH_GAP_RATIO) } })]
                : []),
              ...renderPreparedLines(lines, {
                fontSize,
                fontWeight: SHORT_BODY_FONT_WEIGHT,
                color: input.isDarkBackground ? SHORT_DARK_TEXT_COLOR : FB_TEXT_COLOR,
                justifyContent: "flex-end",
              }),
            ])
          )
        : h(
            "div",
            {
              style: {
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: BODY_LINE_GAP,
              },
            },
            ...(hashtags.length > 0 && input.pageIndex === 1
              ? [
                  ...renderPreparedLines(prepareRtlWordLines(hashtags.join(" "), fontSize - 2, availableWidth), {
                    fontSize: fontSize - 2,
                    fontWeight: 400,
                    color: FB_LINK_COLOR,
                    justifyContent: "flex-end",
                  }),
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
    input.pageCount > 1 &&
    !input.hideProgressBar &&
    h(
      "div",
      {
        style: {
          display: "flex",
          position: "absolute",
          bottom: FOOTER_BOTTOM_OFFSET,
          left: 0,
          right: 0,
          flexDirection: "column",
          alignItems: "center",
          gap: PROGRESS_BAR_TOP_GAP,
        },
      },
      h(
        "div",
        {
          style: {
            display: "flex",
            fontSize: 24,
            color: input.isDarkBackground ? FOOTER_TEXT_COLOR_DARK : FB_SECONDARY_COLOR,
          },
        },
        `${input.pageIndex} / ${input.pageCount}`
      ),
      h(
        "div",
        {
          style: {
            display: "flex",
            width: PROGRESS_BAR_WIDTH,
            height: PROGRESS_BAR_HEIGHT,
            borderRadius: PROGRESS_BAR_HEIGHT / 2,
            overflow: "hidden",
            backgroundColor: input.isDarkBackground ? PROGRESS_TRACK_COLOR_DARK : PROGRESS_TRACK_COLOR,
          },
        },
        h("div", {
          style: {
            display: "flex",
            width: filledWidth,
            height: PROGRESS_BAR_HEIGHT,
            borderRadius: PROGRESS_BAR_HEIGHT / 2,
            backgroundColor: input.isDarkBackground ? PROGRESS_FILL_COLOR_DARK : PROGRESS_FILL_COLOR,
          },
        })
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
