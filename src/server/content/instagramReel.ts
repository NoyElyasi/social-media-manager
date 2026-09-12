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
export const MAX_CHARS_PER_CAPTION = 50;

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
  hasNarration: boolean;
  /** שם קובץ ההקלטה שנשמר בתוך folderPath (למשל "narration.webm"), או null אם אין הקראה. */
  narrationAudioFileName: string | null;
}

/**
 * הקלטת הקראה שהמשתמשת סינכרנה ידנית (לחיצה על כל מילה בזמן ההקלטה, ראו
 * NarrationRecorder) — כשקיימת, קצב הופעת המילים בריל נגזר מהתזמונים
 * האמיתיים האלה במקום מ-WORD_REVEAL_SECONDS/READ_SECONDS_PER_WORD הקבועים,
 * והאודיו מוטמע כפס קול בתוך reel.mp4. רלוונטי רק במצב revealMode="word"
 * (בלי משמעות ברמת אות-אות) — במצב אחר מתעלמים ממנה בשקט.
 */
export interface ReelNarration {
  audioBase64: string;
  audioMimeType: string;
  /** שנייה שבה המשתמשת התחילה לומר כל מילה, יחסית לתחילת ההקלטה — מערך אחד
   * שטוח, לפי סדר המילים המדויק שיוצא מ-splitIntoSlides+פיצול לרווחים
   * (בדיוק כמו ב-countTotalWords/renderCaptionFrames). */
  wordTimestamps: number[];
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
  /** ראו ReelNarration — אופציונלי, לא "נדבק" בין רינדורים. */
  narration?: ReelNarration | null;
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
  onProgress: ((renderedFrames: number, totalFrames: number) => void) | undefined,
  // תזמוני מילים אמיתיים מהקלטת הקראה מסונכרנת (ראו ReelNarration) — קיים
  // רק אם revealMode==="word" וכמות המילים תואמת בדיוק לכמות המילים בטקסט
  // (אחרת התזמונים לא רלוונטיים יותר, ומתעלמים מהם בשקט אצל הקורא).
  wordTimestamps: number[] | null,
  narrationTotalSeconds: number | null
): Promise<{ framePaths: string[]; durations: number[] }> {
  const framePaths: string[] = [];
  const durations: number[] = [];
  const totalFrames = revealMode === "letter" ? countTotalChars(captions) : countTotalWords(captions);
  const unitRevealSeconds = revealMode === "letter" ? LETTER_REVEAL_SECONDS : WORD_REVEAL_SECONDS;
  let frameIndex = 0;
  let globalWordIndex = 0;

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

      // מצב הקראה מסונכרנת: המשך המסגרת הוא בדיוק הזמן עד שהיא אמרה את
      // המילה הבאה (או עד שההקלטה מסתיימת, למילה האחרונה בכל הטקסט) —
      // כולל הפסקות טבעיות בין משפטים, בלי צורך ב-holdExtraSeconds מלאכותי.
      if (wordTimestamps && revealMode === "word") {
        const nextTimestamp =
          globalWordIndex + 1 < wordTimestamps.length
            ? wordTimestamps[globalWordIndex + 1]
            : narrationTotalSeconds ?? wordTimestamps[globalWordIndex] + unitRevealSeconds;
        durations.push(Math.max(0.05, nextTimestamp - wordTimestamps[globalWordIndex]));
      } else {
        durations.push(isLastUnit ? unitRevealSeconds + holdExtraSeconds : unitRevealSeconds);
      }

      frameIndex++;
      if (revealMode === "word") globalWordIndex++;
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

/** סיומת קובץ סבירה למ-mimeType של MediaRecorder בדפדפן (ברוב המקרים "audio/webm;codecs=opus"). */
function audioExtensionFromMimeType(mimeType: string): string {
  const subtype = mimeType.split(";")[0].split("/")[1] ?? "webm";
  if (subtype === "mp4") return "m4a";
  return subtype;
}

// לא מייבאים את @ffprobe-installer/ffprobe עצמו (require.resolve דינמי בתוכו
// גורם ל-Turbopack לנסות לצרף לבנדל את כל תיקיית החבילה, כולל README.md —
// קובץ שהוא לא יודע לטפל בו, מה שקורס את השרת). @ffprobe-installer/darwin-arm64
// יושבת תמיד ליד @ffmpeg-installer/darwin-arm64 (אותו node_modules), אז בונים
// את הנתיב לבינארי ידנית — path.join רגיל, בלי require דינמי בכלל.
function resolveFfprobePath(): string {
  const platform = `${os.platform()}-${os.arch()}`;
  const binary = os.platform() === "win32" ? "ffprobe.exe" : "ffprobe";
  return path.join(path.dirname(ffmpegInstaller.path), "..", "..", "@ffprobe-installer", platform, binary);
}

async function probeAudioDurationSeconds(filePath: string): Promise<number | null> {
  try {
    const { stdout } = await execFileAsync(resolveFfprobePath(), [
      "-v", "error",
      "-show_entries", "format=duration",
      "-of", "default=noprint_wrappers=1:nokey=1",
      filePath,
    ]);
    const seconds = parseFloat(stdout.trim());
    return Number.isFinite(seconds) ? seconds : null;
  } catch {
    return null;
  }
}

/** מטמיעה פס קול קיים בתוך הסרטון השקט — מחליפה את outputPath בגרסה עם אודיו. */
async function muxAudioIntoVideo(videoPath: string, audioPath: string, outputPath: string): Promise<void> {
  await execFileAsync(ffmpegInstaller.path, [
    "-y",
    "-i", videoPath,
    "-i", audioPath,
    "-map", "0:v:0",
    "-map", "1:a:0",
    "-c:v", "copy",
    "-c:a", "aac",
    "-shortest",
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
  const revealMode = params.revealMode ?? "word";

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-"));
  try {
    // הקלטת ההקראה תקפה רק במצב "מילה-מילה" וכשכמות התזמונים תואמת בדיוק
    // לכמות המילים בטקסט הנוכחי (אחרת הטקסט השתנה מאז ההקלטה, והתזמונים
    // לא רלוונטיים יותר) — במקרה אחר מתעלמים ממנה בשקט וחוזרים לקצב הקבוע.
    const totalWordCount = countTotalWords(captions);
    let audioPath: string | null = null;
    let narrationTotalSeconds: number | null = null;
    let wordTimestamps: number[] | null = null;

    if (params.narration && revealMode === "word" && params.narration.wordTimestamps.length === totalWordCount) {
      const ext = audioExtensionFromMimeType(params.narration.audioMimeType);
      audioPath = path.join(workDir, `narration.${ext}`);
      await fs.writeFile(audioPath, Buffer.from(params.narration.audioBase64, "base64"));
      narrationTotalSeconds = await probeAudioDurationSeconds(audioPath);
      wordTimestamps = params.narration.wordTimestamps;
    }

    const { framePaths, durations } = await renderCaptionFrames(
      captions,
      backgroundHex,
      params.backgroundImageDataUri,
      displayHashtags,
      revealMode,
      workDir,
      params.signal,
      params.onProgress,
      wordTimestamps,
      narrationTotalSeconds
    );
    if (params.signal?.aborted) throw new ReelCancelledError();
    const silentPath = path.join(workDir, "reel-silent.mp4");
    await encodeVideo(framePaths, durations, silentPath);

    const outputPath = path.join(workDir, "reel.mp4");
    const hasNarration = audioPath !== null;
    if (hasNarration && audioPath) {
      await muxAudioIntoVideo(silentPath, audioPath, outputPath);
    } else {
      await fs.rename(silentPath, outputPath);
    }

    const videoBuffer = await fs.readFile(outputPath);
    const fileName = "reel.mp4";
    await params.storage.saveFile(params.folderPath, fileName, videoBuffer);

    let narrationAudioFileName: string | null = null;
    if (hasNarration && audioPath) {
      narrationAudioFileName = `narration${path.extname(audioPath)}`;
      await params.storage.saveFile(params.folderPath, narrationAudioFileName, await fs.readFile(audioPath));
    }

    const durationSeconds = narrationTotalSeconds ?? durations.reduce((sum, d) => sum + d, 0);
    const altText = captions.join(" ");

    await params.storage.saveTextFile(
      params.folderPath,
      "metadata.txt",
      [
        `כתוביות (${captions.length}):`,
        captions.map((c, i) => `${i + 1}. ${c}`).join("\n"),
        `תגיות מוטבעות בסרטון: ${displayHashtags.join(" ") || "אין"}`,
        `אורך כולל: ${durationSeconds.toFixed(1)} שניות`,
        `הקראה מסונכרנת: ${hasNarration ? "כן" : "לא"}`,
      ].join("\n\n")
    );
    await params.storage.saveTextFile(params.folderPath, "alt-text.txt", `${fileName}:\n${altText}`);

    return { file: fileName, durationSeconds, captions, altText, hasNarration, narrationAudioFileName };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
