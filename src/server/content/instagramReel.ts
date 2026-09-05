import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import type { StorageService } from "../storage/types";
import { splitIntoSlides, type SplitMode } from "./instagramCarousel";
import { buildReelFrameNode, REEL_WIDTH, REEL_HEIGHT } from "./render/reelFrame";
import { renderNodeToPng } from "./render/renderImage";
import { pickBackgroundColor } from "./render/palette";
import type { RevealGranularity } from "./render/rtlText";
import { ALWAYS_FIRST_HASHTAG } from "@/lib/labels";

const execFileAsync = promisify(execFile);

/** "word" (מילה-מילה, ברירת מחדל) או "letter" (אות-אות) — אפקט הכתיבה בריל. */
export type RevealMode = RevealGranularity;

// כתוביות קצרות לריל — מסך אחד קטן וקריא, לא פסקה שלמה (סעיף 4.4).
const MAX_CHARS_PER_CAPTION = 50;

// קצב "כתיבה בלייב" של מילה חדשה על המסך — לא קצב קריאה, רק אפקט חזותי.
// לפי בקשה מפורשת "בקצב מהיר יותר" (היה 0.28).
const WORD_REVEAL_SECONDS = 0.16;
// קצב "אות-אות" — הרבה יותר קצר מקצב המילה, כי מילה ארוכה מכילה הרבה יותר
// אותיות ממילים בממוצע; בלי קצב נפרד, מילה ארוכה הייתה נראית איטית מדי.
const LETTER_REVEAL_SECONDS = 0.045;
// כמה זמן לוקח לאדם ממוצע לקרוא מילה אחת בנוחות (לא ממהר) — קובע כמה זמן
// כל כתובית *נשארת* על המסך אחרי שנכתבה במלואה (העצירה, לא הכתיבה עצמה).
// הקבועים כאן נמוכים בכוונה (לא פרופורציונליים בצורה נוקשה): כתוביות קצרות
// מתקצרות הרבה יותר באופן יחסי מכתוביות ארוכות. הועלו טיפה בחזרה לאחר
// שהצמצום הקודם התברר כמהיר מידי.
const READ_SECONDS_PER_WORD = 0.37;
const MIN_CAPTION_SECONDS = 0.6;

export interface InstagramReelResult {
  file: string;
  durationSeconds: number;
  captions: string[];
  altText: string;
}

/** נזרקת כשהיצירה בוטלה במפורש (signal) באמצע — לא שגיאה אמיתית. */
export class ReelCancelledError extends Error {
  constructor() {
    super("reel generation cancelled");
    this.name = "ReelCancelledError";
  }
}

export interface PrepareReelParams {
  rawText: string;
  seed: string;
  folderPath: string;
  storage: StorageService;
  /** "auto" (ברירת מחדל) — אריזה אוטומטית, עם /// כגבול חילוק נוסף שנכבד.
   * "manual" — רק /// קובע איפה עוברים לכתובית הבאה. */
  splitMode?: SplitMode;
  /** תבנית רקע קבועה (תמונה) לסרטון — אם לא סופקה, נבחר צבע רקע אוטומטי. */
  backgroundImageDataUri?: string | null;
  /** תגיות משותפות הפוסט — #אחתביום מסוננת אוטומטית (היא מוטמעת כבר בתבנית הרקע). */
  hashtags?: string[];
  /** אנימציית החשיפה — "word" (ברירת מחדל) או "letter". */
  revealMode?: RevealMode;
  /** מאפשר עצירה מבוקשת מהלקוח (כפתור "עצור") — נבדק בין מסגרת למסגרת. */
  signal?: AbortSignal;
  /** התקדמות רינדור המסגרות, לצורך אינדיקציית זמן משוער בממשק. */
  onProgress?: (renderedFrames: number, totalFrames: number) => void;
}

function countTotalWords(captions: string[]): number {
  return captions.reduce((sum, c) => sum + c.split(/\s+/).filter(Boolean).length, 0);
}

/** סופרת רק תווי תוכן (בלי רווחים) — אלה היחידות שנחשפות במצב "אות-אות". */
function countTotalChars(captions: string[]): number {
  return captions.reduce((sum, c) => sum + c.split(/\s+/).filter(Boolean).join("").length, 0);
}

async function renderCaptionFrames(
  captions: string[],
  backgroundHex: string,
  backgroundImageDataUri: string | null | undefined,
  displayHashtags: string[],
  revealMode: RevealMode,
  framesDir: string,
  signal: AbortSignal | undefined,
  onProgress: ((renderedFrames: number, totalFrames: number) => void) | undefined
): Promise<{ framePaths: string[]; durations: number[] }> {
  const framePaths: string[] = [];
  const durations: number[] = [];
  const totalFrames = revealMode === "letter" ? countTotalChars(captions) : countTotalWords(captions);
  const unitRevealSeconds = revealMode === "letter" ? LETTER_REVEAL_SECONDS : WORD_REVEAL_SECONDS;
  let frameIndex = 0;

  for (const caption of captions) {
    const words = caption.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const unitCount = revealMode === "letter" ? words.join("").length : words.length;

    const targetCaptionSeconds = Math.max(MIN_CAPTION_SECONDS, words.length * READ_SECONDS_PER_WORD);
    const revealSeconds = unitCount * unitRevealSeconds;
    const holdExtraSeconds = Math.max(0, targetCaptionSeconds - revealSeconds);

    for (let i = 0; i < unitCount; i++) {
      if (signal?.aborted) throw new ReelCancelledError();

      const png = await renderNodeToPng(
        buildReelFrameNode({
          fullText: caption,
          revealedUnitCount: i + 1,
          revealMode,
          backgroundHex,
          backgroundImageDataUri,
          hashtags: displayHashtags,
        }),
        REEL_WIDTH,
        REEL_HEIGHT
      );
      const fileName = `frame-${String(frameIndex).padStart(5, "0")}.png`;
      const filePath = path.join(framesDir, fileName);
      await fs.writeFile(filePath, png);

      const isLastUnit = i === unitCount - 1;
      framePaths.push(filePath);
      durations.push(isLastUnit ? unitRevealSeconds + holdExtraSeconds : unitRevealSeconds);
      frameIndex++;
      onProgress?.(frameIndex, totalFrames);
    }
  }

  return { framePaths, durations };
}

async function encodeVideo(framePaths: string[], durations: number[], outputPath: string): Promise<void> {
  const listPath = outputPath + ".list.txt";
  const lines: string[] = [];
  for (let i = 0; i < framePaths.length; i++) {
    lines.push(`file '${framePaths[i]}'`);
    lines.push(`duration ${durations[i].toFixed(3)}`);
  }
  // חובה לפי תיעוד ffmpeg concat demuxer: לחזור על הקובץ האחרון פעם נוספת
  // בלי duration, אחרת המשך הזמן שלו לא נלקח בחשבון בפועל.
  lines.push(`file '${framePaths[framePaths.length - 1]}'`);
  await fs.writeFile(listPath, lines.join("\n"), "utf-8");

  await execFileAsync(ffmpegInstaller.path, [
    "-y",
    "-f", "concat",
    "-safe", "0",
    "-i", listPath,
    "-vsync", "cfr",
    "-r", "30",
    "-pix_fmt", "yuv420p",
    "-c:v", "libx264",
    // keyframe (I-frame) כל שנייה בערך — בלי זה libx264 שם keyframe רק כל
    // 250 פריימים (~8 שניות) כברירת מחדל, ובריל קצר זה יוצר keyframe יחיד
    // בהתחלה בלבד: גרירת הסליידר אחורה לא באמת מזיזה את הנגן, כי אין לו
    // לאן "לחזור" חוץ מההתחלה. עם keyframe תכוף, גרירה אחורה עובדת בפועל.
    "-g", "30",
    "-keyint_min", "30",
    "-movflags", "+faststart",
    outputPath,
  ]);
}

export async function prepareInstagramReel(params: PrepareReelParams): Promise<InstagramReelResult> {
  // חשוב: מפצלים על rawText המקורי (עם סימוני ///), לא על טקסט מנוקה —
  // splitIntoSlides בעצמו אחראי על הטיפול בסימונים (ראו instagramCarousel.ts).
  const captions = splitIntoSlides(params.rawText, params.splitMode ?? "auto", MAX_CHARS_PER_CAPTION);
  const backgroundHex = pickBackgroundColor(params.seed + "-reel");
  // #אחתביום לא מוצגת כאן — היא מוטמעת כבר בתבנית הרקע (אם יש), אין צורך לכפול אותה.
  const displayHashtags = (params.hashtags ?? []).filter((tag) => tag !== ALWAYS_FIRST_HASHTAG);

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-"));
  try {
    const { framePaths, durations } = await renderCaptionFrames(
      captions,
      backgroundHex,
      params.backgroundImageDataUri,
      displayHashtags,
      params.revealMode ?? "word",
      workDir,
      params.signal,
      params.onProgress
    );
    if (params.signal?.aborted) throw new ReelCancelledError();
    const outputPath = path.join(workDir, "reel.mp4");
    await encodeVideo(framePaths, durations, outputPath);

    const videoBuffer = await fs.readFile(outputPath);
    const fileName = "reel.mp4";
    await params.storage.saveFile(params.folderPath, fileName, videoBuffer);

    const durationSeconds = durations.reduce((sum, d) => sum + d, 0);
    const altText = captions.join(" ");

    await params.storage.saveTextFile(
      params.folderPath,
      "metadata.txt",
      [
        `כתוביות (${captions.length}):`,
        captions.map((c, i) => `${i + 1}. ${c}`).join("\n"),
        `תגיות מוטבעות בסרטון: ${displayHashtags.join(" ") || "אין"}`,
        `אורך כולל: ${durationSeconds.toFixed(1)} שניות`,
      ].join("\n\n")
    );
    await params.storage.saveTextFile(params.folderPath, "alt-text.txt", `${fileName}:\n${altText}`);

    return { file: fileName, durationSeconds, captions, altText };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
