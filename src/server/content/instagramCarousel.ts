import type { StorageService } from "../storage/types";
import { suggestHashtags, suggestTags, finalizeHashtags } from "./facebook";
import { suggestSongs, type SongSuggestion } from "./songSuggestions";
import { buildCarouselSlideNode, CAROUSEL_WIDTH, CAROUSEL_HEIGHT } from "./render/carouselSlide";
import { renderNodeToPng } from "./render/renderImage";

const MAX_CHARS_PER_SLIDE = 220;

/** הסימון שהמשתמשת מוסיפה בטקסט הגולמי כדי לסמן ידנית איפה מתחיל עמוד קרוסלה חדש. */
export const MANUAL_SLIDE_BREAK = "///";

export type SplitMode = "auto" | "manual";

/**
 * מסירה את סימוני החילוק הידני מהטקסט, לשימוש בכל מה שאינו פיצול הקרוסלה
 * עצמו (הגהה, סקאנר פרטיות, סטורי). חשוב: לא נוגעים בירידות שורה או
 * בהפרדת פסקאות בכלל — רק ברווחים/טאבים סביב הסימון ובתוך שורה בודדת.
 */
export function stripSlideMarkers(text: string): string {
  return text
    .replaceAll(MANUAL_SLIDE_BREAK, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ *\n */g, "\n")
    .trim();
}

/**
 * מחלק את הטקסט לעמודי קרוסלה (סעיף 4.2).
 * "auto" — לפי כמות תוכן הגיונית לעמוד (אורך טקסט).
 * "manual" — לפי המקומות שהמשתמשת סימנה בעצמה עם MANUAL_SLIDE_BREAK.
 */
export function splitIntoSlides(
  text: string,
  mode: SplitMode = "auto",
  maxChars = MAX_CHARS_PER_SLIDE
): string[] {
  if (mode === "manual" && text.includes(MANUAL_SLIDE_BREAK)) {
    const parts = text
      .split(MANUAL_SLIDE_BREAK)
      .map((s) => s.trim())
      .filter(Boolean);
    return parts.length > 0 ? parts : [text.trim()];
  }

  // מפרקים למשפטים, אבל שומרים את המפריד המדויק (רווח בודד / ירידת שורה /
  // שורה ריקה) שהיה בין כל שני משפטים — כדי שכשמארזים משפטים לתוך עמוד,
  // ירידות שורה ופסקאות שהמשתמשת כתבה לא יתמזגו לרווח בודד.
  const cleaned = text.replaceAll(MANUAL_SLIDE_BREAK, " ");
  const sentenceRegex = /([^.!?\n]*[.!?]+|[^.!?\n]+)(\s*)/g;
  const pieces: { content: string; sep: string }[] = [];
  let match: RegExpExecArray | null;
  while ((match = sentenceRegex.exec(cleaned)) !== null) {
    if (match[0] === "") {
      sentenceRegex.lastIndex++;
      continue;
    }
    if (match[1]) pieces.push({ content: match[1], sep: match[2] });
  }

  const slides: string[] = [];
  let current = "";

  for (let i = 0; i < pieces.length; i++) {
    const { content, sep } = pieces[i];
    const candidate = current + content;
    if (candidate.length > maxChars && current) {
      slides.push(current.trim());
      current = content;
    } else {
      current = candidate;
    }
    if (i < pieces.length - 1) current += sep;
  }
  if (current.trim()) slides.push(current.trim());

  return slides.length > 0 ? slides : [text];
}

export interface InstagramCarouselResult {
  text: string;
  hashtags: string[];
  tags: string[];
  suggestedSongs: SongSuggestion[];
  files: string[]; // שמות קבצים בתוך folderPath (slide-01.png, ...)
  altTexts: string[]; // מקביל ל-files, לפי סעיף 7
}

export interface PrepareCarouselParams {
  rawText: string;
  splitMode?: SplitMode;
  /** תגיות סופיות לשילוב בתוך התמונה. אם לא סופק — משתמשים בהצעה האוטומטית. */
  hashtags?: string[];
  folderPath: string; // תיקיית המשנה "אינסטגרם-פוסט" בתוך תיקיית הפוסט
  displayName: string;
  profileImageDataUri?: string | null;
  storage: StorageService;
}

export async function prepareInstagramCarousel(
  params: PrepareCarouselParams
): Promise<InstagramCarouselResult> {
  const cleanText = stripSlideMarkers(params.rawText);
  const slides = splitIntoSlides(params.rawText, params.splitMode ?? "auto");
  const hashtags = finalizeHashtags(params.hashtags, suggestHashtags(cleanText));
  const tags = suggestTags(cleanText);
  const suggestedSongs = suggestSongs(cleanText);

  const files: string[] = [];
  const altTexts: string[] = [];

  for (let i = 0; i < slides.length; i++) {
    const buildNode = (profileImageDataUri: string | null | undefined) =>
      buildCarouselSlideNode({
        bodyText: slides[i],
        hashtags,
        pageIndex: i + 1,
        pageCount: slides.length,
        displayName: params.displayName,
        profileImageDataUri,
      });

    let png: Buffer;
    try {
      png = await renderNodeToPng(buildNode(params.profileImageDataUri), CAROUSEL_WIDTH, CAROUSEL_HEIGHT);
    } catch (err) {
      // אם משהו לא תקין בתמונת הפרופיל השמורה (פורמט/גודל שסאטורי לא אוהב),
      // לא רוצים שכל הכנת הפוסט תיכשל — מנסים שוב בלי התמונה (ראשי תיבות).
      console.error("carousel slide render failed with profile image, retrying without it:", err);
      png = await renderNodeToPng(buildNode(null), CAROUSEL_WIDTH, CAROUSEL_HEIGHT);
    }

    const fileName = `slide-${String(i + 1).padStart(2, "0")}.png`;
    await params.storage.saveFile(params.folderPath, fileName, png);

    files.push(fileName);
    altTexts.push(slides[i]);
  }

  await params.storage.saveTextFile(
    params.folderPath,
    "metadata.txt",
    [
      `תגיות: ${hashtags.join(" ")}`,
      `כיתוב: ${cleanText}`,
      `תיוגים: ${tags.join(", ")}`,
      `הצעות שיר: ${suggestedSongs.map((s) => `${s.title} — ${s.artist}`).join(" / ")}`,
    ].join("\n\n")
  );

  await params.storage.saveTextFile(
    params.folderPath,
    "alt-text.txt",
    altTexts.map((t, i) => `slide-${String(i + 1).padStart(2, "0")}.png:\n${t}`).join("\n\n")
  );

  return {
    text: cleanText,
    hashtags,
    tags,
    suggestedSongs,
    files,
    altTexts,
  };
}
