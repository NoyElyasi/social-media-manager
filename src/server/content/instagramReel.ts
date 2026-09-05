import { promises as fs } from "fs";
import os from "os";
import path from "path";
import { execFile } from "child_process";
import { promisify } from "util";
import ffmpegInstaller from "@ffmpeg-installer/ffmpeg";
import type { StorageService } from "../storage/types";
import { splitIntoSlides, stripSlideMarkers } from "./instagramCarousel";
import { buildReelFrameNode, REEL_WIDTH, REEL_HEIGHT } from "./render/reelFrame";
import { renderNodeToPng } from "./render/renderImage";
import { pickBackgroundColor } from "./render/palette";

const execFileAsync = promisify(execFile);

// כתוביות קצרות לריל — מסך אחד קטן וקריא, לא פסקה שלמה (סעיף 4.4).
const MAX_CHARS_PER_CAPTION = 50;

// קצב "כתיבה בלייב" של מילה חדשה על המסך — לא קצב קריאה, רק אפקט חזותי.
const WORD_REVEAL_SECONDS = 0.28;
// כמה זמן לוקח לאדם ממוצע לקרוא מילה אחת בנוחות (לא ממהר) — קובע כמה זמן
// כל כתובית *נשארת* על המסך אחרי שנכתבה במלואה, לפי בקשה מפורשת "לא בקצב
// מהיר כדי שאנשים יספיקו לקרוא".
const READ_SECONDS_PER_WORD = 0.5;
const MIN_CAPTION_SECONDS = 1.4;

export interface InstagramReelResult {
  file: string;
  durationSeconds: number;
  captions: string[];
  altText: string;
}

export interface PrepareReelParams {
  rawText: string;
  seed: string;
  folderPath: string;
  storage: StorageService;
}

async function renderCaptionFrames(
  captions: string[],
  backgroundHex: string,
  framesDir: string
): Promise<{ framePaths: string[]; durations: number[] }> {
  const framePaths: string[] = [];
  const durations: number[] = [];
  let frameIndex = 0;

  for (const caption of captions) {
    const words = caption.split(/\s+/).filter(Boolean);
    if (words.length === 0) continue;

    const targetCaptionSeconds = Math.max(MIN_CAPTION_SECONDS, words.length * READ_SECONDS_PER_WORD);
    const revealSeconds = words.length * WORD_REVEAL_SECONDS;
    const holdExtraSeconds = Math.max(0, targetCaptionSeconds - revealSeconds);

    for (let i = 0; i < words.length; i++) {
      const visibleText = words.slice(0, i + 1).join(" ");
      const png = await renderNodeToPng(buildReelFrameNode({ visibleText, backgroundHex }), REEL_WIDTH, REEL_HEIGHT);
      const fileName = `frame-${String(frameIndex).padStart(5, "0")}.png`;
      const filePath = path.join(framesDir, fileName);
      await fs.writeFile(filePath, png);

      const isLastWord = i === words.length - 1;
      framePaths.push(filePath);
      durations.push(isLastWord ? WORD_REVEAL_SECONDS + holdExtraSeconds : WORD_REVEAL_SECONDS);
      frameIndex++;
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
    "-movflags", "+faststart",
    outputPath,
  ]);
}

export async function prepareInstagramReel(params: PrepareReelParams): Promise<InstagramReelResult> {
  const cleanText = stripSlideMarkers(params.rawText);
  const captions = splitIntoSlides(cleanText, "auto", MAX_CHARS_PER_CAPTION);
  const backgroundHex = pickBackgroundColor(params.seed + "-reel");

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "reel-"));
  try {
    const { framePaths, durations } = await renderCaptionFrames(captions, backgroundHex, workDir);
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
        `אורך כולל: ${durationSeconds.toFixed(1)} שניות`,
      ].join("\n\n")
    );
    await params.storage.saveTextFile(params.folderPath, "alt-text.txt", `${fileName}:\n${altText}`);

    return { file: fileName, durationSeconds, captions, altText };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}
