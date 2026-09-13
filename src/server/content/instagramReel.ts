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
  hasNarration: boolean;
  /** שם קובץ ההקלטה שנשמר בתוך folderPath (למשל "narration.webm"), או null אם אין הקראה. */
  narrationAudioFileName: string | null;
}

/**
 * הקלטה של המשתמשת מקריאה את הפוסט (מוקלטת בכלי או מועלית כקובץ מוכן) —
 * כשקיימת, קצב הופעת הטקסט בריל נגזר מניתוח עוצמת הסאונד של ההקלטה עצמה
 * (ראו detectWordTimestamps) במקום מהקבועים הקבועים (WORD_REVEAL_SECONDS/
 * LETTER_REVEAL_SECONDS/READ_SECONDS_PER_WORD), והאודיו מוטמע כפס קול בתוך
 * reel.mp4. זו הערכה גסה לפי "רגישות" לעוצמת הקול — לא זיהוי דיבור מדויק,
 * לפי בקשה מפורשת שלא חייבת להיות מדויקת ב-100%.
 */
export interface ReelNarration {
  audioBase64: string;
  audioMimeType: string;
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
  // תזמוני מילים גסים מניתוח עוצמת הקול בהקלטה (ראו detectWordTimestamps) —
  // כשקיימים, קובעים את קצב הכתיבה במקום הקבועים למעלה. תקף גם ב-revealMode="letter":
  // משך הזמן של כל מילה מתחלק שווה בשווה על פני האותיות שלה.
  wordTimestamps: number[] | null,
  narrationTotalSeconds: number | null,
  // כמה שניות של שקט יש לפני שהמילה הראשונה בפועל נאמרת (ראו
  // detectSpeechStartSeconds) — לפי משוב מפורש שההתחלה תמיד שקטה ("לוקח לי
  // זמן להתחיל להקריא"), אז מוסיפים מסגרת פותחת "ריקה" (בלי טקסט חשוף) באורך
  // הזה, כדי שהמילה הראשונה על המסך לא תופיע לפני שבאמת אמרו אותה בהקלטה.
  leadInSeconds: number
): Promise<{ framePaths: string[]; durations: number[] }> {
  const framePaths: string[] = [];
  const durations: number[] = [];
  const totalFrames = revealMode === "letter" ? countTotalChars(captions) : countTotalWords(captions);
  const unitRevealSeconds = revealMode === "letter" ? LETTER_REVEAL_SECONDS : WORD_REVEAL_SECONDS;
  let frameIndex = 0;
  let globalWordIndex = 0;

  if (leadInSeconds > 0.05 && captions.length > 0) {
    const png = await renderNodeToPng(
      buildReelFrameNode({
        fullText: captions[0],
        revealedUnitCount: 0,
        revealMode,
        backgroundHex,
        backgroundImageDataUri,
        hashtags: displayHashtags,
      }),
      REEL_WIDTH,
      REEL_HEIGHT
    );
    const filePath = path.join(framesDir, `frame-${String(frameIndex).padStart(5, "0")}.png`);
    await fs.writeFile(filePath, png);
    framePaths.push(filePath);
    durations.push(leadInSeconds);
    frameIndex++;
  }

  for (const caption of captions) {
    const words = caption.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;
    const unitCount = revealMode === "letter" ? words.join("").length : words.length;

    const targetCaptionSeconds = Math.max(MIN_CAPTION_SECONDS, words.length * READ_SECONDS_PER_WORD);
    const revealSeconds = unitCount * unitRevealSeconds;
    const holdExtraSeconds = Math.max(0, targetCaptionSeconds - revealSeconds);

    // משך הזמן האמיתי שהמשתמשת הקדישה לכל מילה בכתובית הזו (מהלחיצה על
    // המילה הזו ועד הלחיצה על הבאה, או עד סוף ההקלטה למילה האחרונה בטקסט).
    const wordSlotSeconds: number[] | null = wordTimestamps
      ? words.map((_, wIdx) => {
          const gIdx = globalWordIndex + wIdx;
          const nextTimestamp =
            gIdx + 1 < wordTimestamps.length
              ? wordTimestamps[gIdx + 1]
              : narrationTotalSeconds ?? wordTimestamps[gIdx] + unitRevealSeconds;
          return Math.max(0.05, nextTimestamp - wordTimestamps[gIdx]);
        })
      : null;

    let unitIndexInCaption = 0;
    for (let wIdx = 0; wIdx < words.length; wIdx++) {
      const letterCount = revealMode === "letter" ? words[wIdx].length : 1;

      for (let l = 0; l < letterCount; l++) {
        if (signal?.aborted) throw new ReelCancelledError();

        const png = await renderNodeToPng(
          buildReelFrameNode({
            fullText: caption,
            revealedUnitCount: unitIndexInCaption + 1,
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
        framePaths.push(filePath);

        const isLastUnitInCaption = unitIndexInCaption === unitCount - 1;

        if (wordSlotSeconds) {
          durations.push(wordSlotSeconds[wIdx] / letterCount);
        } else {
          durations.push(isLastUnitInCaption ? unitRevealSeconds + holdExtraSeconds : unitRevealSeconds);
        }

        frameIndex++;
        unitIndexInCaption++;
        onProgress?.(frameIndex, totalFrames);
      }
    }
    globalWordIndex += words.length;
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
  // "audio/mp4" ו-"audio/x-m4a" הן שתיהן וריאציות MIME נפוצות ל-m4a
  // (ראינו את שתיהן בפועל, תלוי בדפדפן/מכשיר).
  if (subtype === "mp4" || subtype === "x-m4a") return "m4a";
  return subtype;
}

/**
 * ההופכי ל-audioExtensionFromMimeType — משמש כשמשתמשים מחדש בהקלטה שמורה
 * (ראו resolveReelNarration ב-preparePost.ts): יש רק את סיומת הקובץ, וצריך
 * mimeType סביר כדי להעביר אותה חזרה ל-prepareInstagramReel. לא צריך להיות
 * מדויק ב-100% — prepareInstagramReel רק מחלץ ממנו את הסיומת בחזרה.
 */
export function guessAudioMimeTypeFromExtension(ext: string): string {
  const normalized = ext.replace(/^\./, "").toLowerCase();
  if (normalized === "m4a" || normalized === "x-m4a") return "audio/mp4";
  if (normalized === "mp3") return "audio/mpeg";
  if (normalized === "wav") return "audio/wav";
  if (normalized === "ogg") return "audio/ogg";
  return "audio/webm";
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

/** מפענחת קובץ אודיו כלשהו ל-PCM גולמי (מונו, 16kHz, 16-bit) — פורמט פשוט לניתוח עוצמה. */
async function extractPcmSamples(audioPath: string): Promise<{ samples: Int16Array; sampleRate: number }> {
  const sampleRate = 16000;
  const pcmPath = audioPath + ".pcm";
  await execFileAsync(ffmpegInstaller.path, [
    "-y",
    "-i", audioPath,
    "-f", "s16le",
    "-ar", String(sampleRate),
    "-ac", "1",
    pcmPath,
  ]);
  const buf = await fs.readFile(pcmPath);
  await fs.rm(pcmPath, { force: true });

  const sampleCount = Math.floor(buf.length / 2);
  const samples = new Int16Array(sampleCount);
  for (let i = 0; i < sampleCount; i++) {
    samples[i] = buf.readInt16LE(i * 2);
  }
  return { samples, sampleRate };
}

/** עוצמת קול ממוצעת (RMS) בכל חלון קצר — ה"פרופיל קול" שהזיהוי מבוסס עליו. */
function computeShortTimeEnergy(samples: Int16Array, sampleRate: number, windowSeconds: number): number[] {
  const windowSize = Math.max(1, Math.floor(sampleRate * windowSeconds));
  const numWindows = Math.max(1, Math.floor(samples.length / windowSize));
  const energies: number[] = new Array(numWindows);
  for (let w = 0; w < numWindows; w++) {
    let sum = 0;
    const start = w * windowSize;
    for (let i = 0; i < windowSize; i++) {
      const s = samples[start + i] ?? 0;
      sum += s * s;
    }
    energies[w] = Math.sqrt(sum / windowSize);
  }
  return energies;
}

/**
 * מחליקה את עוצמת הקול (ממוצע נע) לפני שמחפשים בה שקטים — בלי זה, עיצורים
 * חדים בתוך מילה (למשל "ת", "ק") יוצרים "שקט" רגעי בן חלון-שניים שנראה
 * לאלגוריתם כמו רווח בין מילים, גם כשבפועל אין הפסקה. ההחלקה הזו היא
 * ההבדל המרכזי בין "לא מדויק מספיק" לזיהוי סביר.
 */
function smoothEnergies(energies: number[], windowCount: number): number[] {
  if (windowCount <= 1) return energies;
  const half = Math.floor(windowCount / 2);
  const smoothed = new Array(energies.length);
  for (let i = 0; i < energies.length; i++) {
    let sum = 0;
    let count = 0;
    for (let j = Math.max(0, i - half); j <= Math.min(energies.length - 1, i + half); j++) {
      sum += energies[j];
      count++;
    }
    smoothed[i] = sum / count;
  }
  return smoothed;
}

/**
 * מזהה מתי בפועל מתחיל דיבור בהקלטה — לפי משוב מפורש שההתחלה תמיד שקטה
 * ("לוקח לי זמן להתחיל להקריא"), ובלי הזיהוי הזה המילה הראשונה של הריל
 * הייתה מוצגת מיד בזמן 0, לפני שנאמרה בפועל, מה שמפרק את הסנכרון לכל אורך
 * ההקלטה. סף רעש נמוך (8% מהעוצמה המקסימלית) + דרישת רצף קצר (לא "בליפ"
 * רגעי) — לא זיהוי דיבור מדויק, רק הבחנה גסה בין שקט לדיבור.
 */
function detectSpeechStartSeconds(energies: number[], windowSeconds: number): number {
  const maxEnergy = Math.max(...energies, 1);
  const noiseFloor = maxEnergy * 0.08;
  const sustainWindows = Math.max(1, Math.round(0.1 / windowSeconds));

  for (let i = 0; i <= energies.length - sustainWindows; i++) {
    let allAboveFloor = true;
    for (let j = 0; j < sustainWindows; j++) {
      if (energies[i + j] < noiseFloor) {
        allAboveFloor = false;
        break;
      }
    }
    if (allAboveFloor) return i * windowSeconds;
  }
  return 0; // לא זוהתה התחלה ברורה — fallback להתחלה מהאפס, כמו קודם.
}

// "משקל תזמון" גס למילה — מילים ארוכות יותר לוקח יותר זמן להקריא מקצרות,
// וסימני פיסוק שמסמנים הפסקה טבעית (נקודה/שאלה/קריאה יותר, פסיק פחות)
// מרחיבים את הזמן המשוער לפני המילה הבאה. לא ניתוח לשוני מדויק — רק קירוב
// טוב יותר מ"כל מילה אורכת אותו זמן", שהיה לא ריאלי במיוחד במשפטים ארוכים.
function wordTimingWeight(word: string): number {
  const bare = word.replace(/[.,!?;:"׳״]+$/g, "");
  let weight = Math.max(1, bare.length);
  if (/[.!?]$/.test(word)) weight += 3;
  else if (/[,;:]$/.test(word)) weight += 1.5;
  return weight;
}

/**
 * מזהה תזמון גס למילים בהקלטת הקראה, לפי רגישות לעוצמת הסאונד — לא זיהוי
 * דיבור אמיתי, לפי בקשה מפורשת "לא צריך להיות מדויק במאה אחוז" (אבל כן
 * מדויק יותר מחלוקה שווה בין מילים — ראו wordTimingWeight). מעריכה זמן
 * "צפוי" לכל גבול בין שתי מילים לפי האורך המצטבר של המילים עד כה, ואז
 * "נמשכת" מהזמן הצפוי הזה לנקודת העוצמה-הנמוכה ביותר בסביבתו הקרובה —
 * כלומר לרגע הכי דומה לרווח/שקט קצר בין מילים. תמיד מחזירה בדיוק
 * words.length נקודות התחלה (הראשונה = speechStartSeconds).
 */
function detectWordTimestamps(
  energies: number[],
  windowSeconds: number,
  totalSeconds: number,
  words: string[],
  speechStartSeconds: number
): number[] {
  if (words.length <= 1) return [speechStartSeconds];

  const activeSeconds = Math.max(0.1, totalSeconds - speechStartSeconds);
  const weights = words.map(wordTimingWeight);
  const totalWeight = weights.reduce((sum, w) => sum + w, 0);
  const averageGap = activeSeconds / words.length;
  const searchRadiusSeconds = Math.min(averageGap * 0.6, 0.4);

  const timestamps: number[] = [speechStartSeconds];
  let cumulativeWeight = 0;

  for (let k = 1; k < words.length; k++) {
    cumulativeWeight += weights[k - 1];
    const idealTime = speechStartSeconds + activeSeconds * (cumulativeWeight / totalWeight);
    const loIndex = Math.max(0, Math.floor((idealTime - searchRadiusSeconds) / windowSeconds));
    const hiIndex = Math.min(energies.length - 1, Math.ceil((idealTime + searchRadiusSeconds) / windowSeconds));

    let bestIndex = Math.round(idealTime / windowSeconds);
    let bestEnergy = Infinity;
    for (let i = loIndex; i <= hiIndex; i++) {
      if (energies[i] < bestEnergy) {
        bestEnergy = energies[i];
        bestIndex = i;
      }
    }

    const candidateTime = bestIndex * windowSeconds;
    // ביטחון נוסף למונוטוניות (בפועל כבר מובטח כי חלונות החיפוש לא חופפים).
    timestamps.push(Math.max(candidateTime, timestamps[k - 1] + 0.05));
  }

  return timestamps;
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
    // אם יש הקלטה — מזהים תזמון מילים גס לפי עוצמת הסאונד שלה (ראו
    // detectWordTimestamps). אם משהו נכשל בפענוח/ניתוח האודיו, מתעלמים
    // מההקלטה בשקט וחוזרים לקצב הקבוע — לא מפילים את כל היצירה.
    const allWords = captions.flatMap((c) => c.split(/\s+/).filter(Boolean));
    let audioPath: string | null = null;
    let narrationTotalSeconds: number | null = null;
    let wordTimestamps: number[] | null = null;

    if (params.narration && allWords.length > 0) {
      try {
        const ext = audioExtensionFromMimeType(params.narration.audioMimeType);
        const candidatePath = path.join(workDir, `narration.${ext}`);
        await fs.writeFile(candidatePath, Buffer.from(params.narration.audioBase64, "base64"));
        const durationSeconds = await probeAudioDurationSeconds(candidatePath);

        if (durationSeconds && durationSeconds > 0) {
          const windowSeconds = 0.02;
          const { samples, sampleRate } = await extractPcmSamples(candidatePath);
          const rawEnergies = computeShortTimeEnergy(samples, sampleRate, windowSeconds);
          // חלון החלקה של כ-80ms — מספיק כדי לא לתפוס עיצורים חדים בתוך מילה
          // כ"שקט", אבל לא כך שיטשטש הפסקות אמיתיות בין מילים (ראו smoothEnergies).
          const energies = smoothEnergies(rawEnergies, Math.round(0.08 / windowSeconds));
          const speechStartSeconds = detectSpeechStartSeconds(energies, windowSeconds);
          audioPath = candidatePath;
          narrationTotalSeconds = durationSeconds;
          wordTimestamps = detectWordTimestamps(energies, windowSeconds, durationSeconds, allWords, speechStartSeconds);
        }
      } catch (err) {
        console.error("Failed to analyze narration audio, falling back to fixed pacing:", err);
      }
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
      narrationTotalSeconds,
      wordTimestamps?.[0] ?? 0
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
