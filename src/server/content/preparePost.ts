import path from "path";
import { nanoid } from "nanoid";
import { prisma } from "../db";
import { getStorageService } from "../storage";
import { scanForIdentifyingDetails } from "./privacyScanner";
import { prepareFacebookDraft } from "./facebook";
import { prepareInstagramCarousel, stripSlideMarkers, type SplitMode } from "./instagramCarousel";
import { detectThemeFromText } from "./songSuggestions";
import {
  prepareInstagramReel,
  ReelCancelledError,
  guessAudioMimeTypeFromExtension,
  type RevealMode,
  type ReelNarration,
} from "./instagramReel";
import { getProfileSettings, loadProfileImageDataUri, parseBackgroundEntries } from "../settings/profile";
import { ALWAYS_FIRST_HASHTAG, type SelectedTarget } from "@/lib/labels";
import type { StorageService } from "../storage/types";

export type { SelectedTarget };

/** בודקת אם תבנית רקע קרוסלה נבחרת מסומנת "כהה" בהגדרות (ראו setCarouselBackgroundDark). */
function isDarkCarouselBackground(darkCarouselBackgroundPathsJson: string, backgroundPath: string | null): boolean {
  if (!backgroundPath) return false;
  try {
    const darkPaths: string[] = JSON.parse(darkCarouselBackgroundPathsJson || "[]");
    return darkPaths.includes(backgroundPath);
  } catch {
    return false;
  }
}

/** מיקום טקסט מותאם לתבנית הרקע הנבחרת (ראו setBackgroundTextPosition) — {null,null} אם אין תבנית/כיוונון. */
function getCarouselTextPosition(
  carouselBackgroundImagePathsJson: string,
  backgroundPath: string | null
): { textTopOffset: number | null; textRightInset: number | null } {
  if (!backgroundPath) return { textTopOffset: null, textRightInset: null };
  const entry = parseBackgroundEntries(carouselBackgroundImagePathsJson).find((e) => e.path === backgroundPath);
  return { textTopOffset: entry?.textTopOffset ?? null, textRightInset: entry?.textRightInset ?? null };
}

/**
 * מחזירה את ההקלטה שיש להעביר ל-prepareInstagramReel ברינדור הזה — לפי
 * משוב מפורש שרינדור מחדש (שינוי רקע/תגיות) לא צריך למחוק הקלטה קיימת.
 * undefined (לא סופקה הקלטה חדשה בבקשה) = משתמשים מחדש בהקלטה השמורה אם
 * יש כזו; null (מפורש) = המשתמשת הסירה את ההקלטה בכוונה; אחרת — הקלטה חדשה.
 */
async function resolveReelNarration(
  storage: StorageService,
  existingNarrationAudioPath: string | null,
  providedNarration: ReelNarration | null | undefined
): Promise<ReelNarration | null | undefined> {
  if (providedNarration !== undefined) return providedNarration;
  if (!existingNarrationAudioPath) return undefined;

  try {
    const audioBase64 = (await storage.readFile(".", existingNarrationAudioPath)).toString("base64");
    const ext = path.extname(existingNarrationAudioPath);
    return { audioBase64, audioMimeType: guessAudioMimeTypeFromExtension(ext) };
  } catch {
    return undefined; // הקובץ לא נמצא (למשל נמחק חיצונית) — מתעלמים בשקט, לא מפילים את הרינדור.
  }
}

/** מנקה תגיות משותפות: מסירה כפילויות ואת התגית הקבועה (שמתווספת אוטומטית בזמן רינדור, לא נשמרת בקלט). */
function normalizeSharedHashtags(hashtags: string[] | undefined | null): string[] {
  if (!hashtags) return [];
  const trimmed = hashtags.map((t) => t.trim()).filter(Boolean);
  return [...new Set(trimmed)].filter((t) => t !== ALWAYS_FIRST_HASHTAG);
}

const SUBFOLDER_NAMES: Record<SelectedTarget, string> = {
  facebook_post: "פייסבוק",
  instagram_carousel: "אינסטגרם-פוסט",
  instagram_story: "אינסטגרם-סטורי",
  instagram_reel: "אינסטגרם-ריל",
};

const NON_SLUG_CHARS = new RegExp("[^\\u0590-\\u05FFa-zA-Z0-9\\s]", "g");

function slugify(text: string): string {
  const words = text
    .replace(NON_SLUG_CHARS, "")
    .trim()
    .split(/\s+/)
    .slice(0, 4);
  const base = words.join("-");
  // מוסיפים סיומת אקראית קצרה תמיד (לא רק כשאין מילים) — כדי שפוסטים ששני
  // המשפטים הראשונים שלהם זהים (למשל ניסוח שחוזר על עצמו, או ניסיון חוזר
  // אחרי שגיאה) לא יתנגשו על ה-slug הייחודי ויגרמו לכשלון ביצירת הפוסט.
  return `${base || nanoid(6)}-${nanoid(4)}`;
}

export interface CreatePostInput {
  rawText: string;
  selectedTargets: SelectedTarget[];
  /**
   * אופן החילוק לעמודי קרוסלה / כתוביות ריל: "auto" (לפי אורך, עם ///
   * כגבול חילוק נוסף שנכבד) או "manual" (רק /// קובע חילוק). משפיע על שני
   * היעדים כאחד.
   */
  splitMode?: SplitMode;
  /** אנימציית החשיפה בריל: "word" (מילה-מילה, ברירת מחדל) או "letter" (אות-אות). */
  revealMode?: RevealMode;
  /** תבנית רקע לקרוסלה, נבחרת מתוך הרקעים שהועלו בהגדרות — null/לא סופק = רקע לבן. */
  carouselBackgroundPath?: string | null;
  /** תבנית רקע לריל, נבחרת מתוך הרקעים שהועלו בהגדרות — null/לא סופק = צבע רקע אוטומטי. */
  reelBackgroundPath?: string | null;
  /** תבנית רקע לעמוד שער בקרוסלה — null/לא סופק = בלי עמוד שער. */
  coverBackgroundPath?: string | null;
  /** תגיות שהמשתמשת הזינה בעצמה, במקום ההצעה האוטומטית (לכל היעדים). */
  manualHashtags?: string[] | null;
  /** נושא הפוסט (מתוך aiThemeOptions), נבחר ידנית ביצירה — קובע את הצעת השיר (ראו suggestSongs). */
  aiTheme?: string | null;
  /** סוג הפוסט, נבחר ידנית ביצירה — "regular" (ברירת מחדל) נשמר כ-null, כדי שהתנהגות הסינון הקיימת (aiFormat !== "letter" = רגיל) תמשיך לעבוד בלי שינוי. */
  aiFormat?: "regular" | "letter" | "tip";
  /** הקלטת הקראה מסונכרנת לריל (ראו ReelNarration) — רק אם instagram_reel נבחר. */
  reelNarration?: ReelNarration | null;
  /** לינק לעמוד המקור ב-Notion, אם הטקסט יובא משם (ראו NotionImportCard ביצירת פוסט). */
  notionUrl?: string | null;
  /** התגית שממנה יובא הטקסט מנושיין, אם ככה — מאפשרת למשוך מחדש טקסט מעודכן בלחיצה (ראו refresh-from-notion). */
  notionTag?: string | null;
  /** מאפשר עצירה מבוקשת (כפתור "עצור") באמצע יצירת ריל. */
  signal?: AbortSignal;
  /** התקדמות רינדור מסגרות הריל, לצורך אינדיקציית זמן משוער בממשק. */
  onProgress?: (renderedFrames: number, totalFrames: number) => void;
}

export async function createAndPreparePost(input: CreatePostInput) {
  const storage = getStorageService();
  const profile = await getProfileSettings();

  // טקסט "נקי" בלי סימוני חילוק ידני — משמש לכל מה שאינו הקרוסלה עצמה (הגהה, סקאנר פרטיות, ריל)
  const cleanText = stripSlideMarkers(input.rawText);

  const privacyFlags = scanForIdentifyingDetails(cleanText);

  const dateStr = new Date().toISOString().slice(0, 10);
  const dateSlug = `${dateStr}_${slugify(input.rawText)}`;
  const postFolderPath = await storage.createPostFolder(dateSlug);

  await storage.saveTextFile(postFolderPath, "טקסט-מקור.txt", input.rawText);

  // תגיות משותפות לכל היעדים של הפוסט הזה (קרוסלה + סטורי יציגו בדיוק
  // אותן תגיות) — נשמר פעם אחת ב-Post, לא בנפרד לכל PlatformContent.
  const sharedHashtags = normalizeSharedHashtags(input.manualHashtags);

  const splitMode: SplitMode = input.splitMode ?? "auto";
  const revealMode: RevealMode = input.revealMode ?? "word";

  // בחירה ידנית (אם יש) גוברת; בלעדיה, מזהות נושא אוטומטית מהטקסט (ראו detectThemeFromText).
  const themeOptions: string[] = JSON.parse(profile.aiThemeOptions || "[]");
  const effectiveTheme = input.aiTheme ?? detectThemeFromText(cleanText, themeOptions);

  const post = await prisma.post.create({
    data: {
      slug: dateSlug,
      rawText: input.rawText,
      selectedTargets: JSON.stringify(input.selectedTargets),
      hashtags: JSON.stringify(sharedHashtags),
      splitMode,
      revealMode,
      aiTheme: effectiveTheme,
      aiFormat: input.aiFormat && input.aiFormat !== "regular" ? input.aiFormat : null,
      folderPath: postFolderPath,
      privacyFlags: JSON.stringify(privacyFlags),
      notionUrl: input.notionUrl ?? null,
      notionTag: input.notionTag ?? null,
    },
  });

  const profileImageDataUri = await loadProfileImageDataUri(storage, profile.profileImagePath);
  const carouselBackgroundImageDataUri = await loadProfileImageDataUri(storage, input.carouselBackgroundPath);
  const reelBackgroundImageDataUri = await loadProfileImageDataUri(storage, input.reelBackgroundPath);
  const coverBackgroundImageDataUri = await loadProfileImageDataUri(storage, input.coverBackgroundPath);

  try {
    for (const target of input.selectedTargets) {
      const subfolder = await storage.createSubfolder(postFolderPath, SUBFOLDER_NAMES[target]);

      if (target === "facebook_post") {
        const draft = prepareFacebookDraft(cleanText, input.manualHashtags);
        await storage.saveTextFile(
          subfolder,
          "טקסט-מוכן.txt",
          [`תגיות: ${draft.hashtags.join(" ")}`, draft.text, `תיוגים: ${draft.tags.join(", ")}`].join(
            "\n\n"
          )
        );
        await prisma.platformContent.create({
          data: {
            postId: post.id,
            type: "facebook_post",
            folderPath: subfolder,
            text: draft.text,
            files: JSON.stringify([]),
            hashtags: JSON.stringify(draft.hashtags),
            tags: JSON.stringify(draft.tags),
            suggestedSongs: JSON.stringify([]),
          },
        });
      }

      if (target === "instagram_carousel") {
        const result = await prepareInstagramCarousel({
          rawText: input.rawText,
          splitMode,
          hashtags: sharedHashtags,
          folderPath: subfolder,
          displayName: profile.displayName,
          profileImageDataUri,
          backgroundImageDataUri: carouselBackgroundImageDataUri,
          isDarkBackground: isDarkCarouselBackground(profile.darkCarouselBackgroundPaths, input.carouselBackgroundPath ?? null),
          ...getCarouselTextPosition(profile.carouselBackgroundImagePaths, input.carouselBackgroundPath ?? null),
          coverBackgroundImageDataUri,
          storage,
        });
        await prisma.platformContent.create({
          data: {
            postId: post.id,
            type: "instagram_carousel",
            folderPath: subfolder,
            text: result.text,
            files: JSON.stringify(result.files),
            altText: result.altTexts.join("\n\n"),
            hashtags: JSON.stringify(result.hashtags),
            tags: JSON.stringify(result.tags),
            suggestedSongs: JSON.stringify(result.suggestedSongs),
            backgroundImagePath: input.carouselBackgroundPath ?? null,
            coverImagePath: input.coverBackgroundPath ?? null,
          },
        });
      }

      if (target === "instagram_reel") {
        const result = await prepareInstagramReel({
          rawText: input.rawText,
          seed: post.id,
          folderPath: subfolder,
          storage,
          splitMode,
          revealMode,
          backgroundImageDataUri: reelBackgroundImageDataUri,
          hashtags: sharedHashtags,
          signal: input.signal,
          onProgress: input.onProgress,
          narration: input.reelNarration,
        });
        await prisma.platformContent.create({
          data: {
            postId: post.id,
            type: "instagram_reel",
            folderPath: subfolder,
            text: result.altText,
            files: JSON.stringify([result.file]),
            altText: result.altText,
            durationSeconds: result.durationSeconds,
            hashtags: JSON.stringify(sharedHashtags),
            tags: JSON.stringify([]),
            suggestedSongs: JSON.stringify([]),
            backgroundImagePath: input.reelBackgroundPath ?? null,
            narrationAudioPath: result.narrationAudioFileName
              ? path.join(subfolder, result.narrationAudioFileName)
              : null,
          },
        });
      }
    }
  } catch (err) {
    if (err instanceof ReelCancelledError) {
      // יצירה שבוטלה באמצע לא צריכה להשאיר פוסט חצי-מוכן — מבטלים הכול,
      // כאילו הבקשה הזו לא קרתה (גם ברשומות וגם בקבצים שנוצרו על הדיסק).
      await prisma.platformContent.deleteMany({ where: { postId: post.id } });
      await prisma.post.delete({ where: { id: post.id } });
      await storage.deleteFolder(postFolderPath);
    }
    throw err;
  }

  return prisma.post.findUniqueOrThrow({
    where: { id: post.id },
    include: { platformContents: true },
  });
}

/**
 * מעדכנת את הטקסט הגולמי של פוסט קיים, ומרנדרת מחדש את כל התכנים שכבר
 * נוצרו לו (טקסט, תמונות) — כדי שלא יישארו לא מסונכרנים עם הטקסט החדש.
 * משתמשת בתגיות המשותפות הקיימות של הפוסט (לא חוזרת להצעה האוטומטית).
 * signal/onProgress מאפשרים עצירה מבוקשת ואינדיקציית זמן משוער, כמו ביצירת
 * פוסט חדש — רלוונטי כשיש בין התכנים ריל (השלב היחיד שאיטי).
 */
export async function updatePostRawText(
  postId: string,
  newRawText: string,
  options?: {
    signal?: AbortSignal;
    onProgress?: (renderedFrames: number, totalFrames: number) => void;
    /** undefined = לא לשנות (משאירים את התבנית הקיימת); null = בלי תבנית; string = תבנית חדשה. */
    carouselBackgroundPath?: string | null;
    reelBackgroundPath?: string | null;
    coverBackgroundPath?: string | null;
    /** מאפשר לעדכן רק את הקרוסלה או רק את הריל בלי לרנדר מחדש את השני. ברירת מחדל: שניהם. */
    regenerateCarousel?: boolean;
    regenerateReel?: boolean;
    /** הקלטת הקראה מסונכרנת חדשה — לא סופק/null = בלי הקראה (גם אם הייתה קודם, ראו ReelNarration). */
    reelNarration?: ReelNarration | null;
  }
) {
  const storage = getStorageService();
  const profile = await getProfileSettings();

  const post = await prisma.post.findUniqueOrThrow({
    where: { id: postId },
    include: { platformContents: true },
  });

  const cleanText = stripSlideMarkers(newRawText);
  const privacyFlags = scanForIdentifyingDetails(cleanText);
  const splitMode = post.splitMode as SplitMode;
  const revealMode = post.revealMode as RevealMode;

  await prisma.post.update({
    where: { id: postId },
    data: { rawText: newRawText, privacyFlags: JSON.stringify(privacyFlags) },
  });
  await storage.saveTextFile(post.folderPath, "טקסט-מקור.txt", newRawText);

  const profileImageDataUri = await loadProfileImageDataUri(storage, profile.profileImagePath);
  const sharedHashtags: string[] = JSON.parse(post.hashtags || "[]");

  for (const content of post.platformContents) {
    if (content.type === "facebook_post") {
      const draft = prepareFacebookDraft(cleanText, sharedHashtags);
      await storage.saveTextFile(
        content.folderPath,
        "טקסט-מוכן.txt",
        [`תגיות: ${draft.hashtags.join(" ")}`, draft.text, `תיוגים: ${draft.tags.join(", ")}`].join(
          "\n\n"
        )
      );
      await prisma.platformContent.update({
        where: { id: content.id },
        data: {
          text: draft.text,
          hashtags: JSON.stringify(draft.hashtags),
          tags: JSON.stringify(draft.tags),
        },
      });
    }

    if (content.type === "instagram_carousel" && options?.regenerateCarousel !== false) {
      const backgroundPath =
        options?.carouselBackgroundPath !== undefined ? options.carouselBackgroundPath : content.backgroundImagePath;
      const coverPath = options?.coverBackgroundPath !== undefined ? options.coverBackgroundPath : content.coverImagePath;
      const backgroundImageDataUri = await loadProfileImageDataUri(storage, backgroundPath);
      const coverBackgroundImageDataUri = await loadProfileImageDataUri(storage, coverPath);
      const result = await prepareInstagramCarousel({
        rawText: newRawText,
        splitMode,
        hashtags: sharedHashtags,
        folderPath: content.folderPath,
        displayName: profile.displayName,
        profileImageDataUri,
        backgroundImageDataUri,
        isDarkBackground: isDarkCarouselBackground(profile.darkCarouselBackgroundPaths, backgroundPath),
        ...getCarouselTextPosition(profile.carouselBackgroundImagePaths, backgroundPath),
        coverBackgroundImageDataUri,
        storage,
      });
      await prisma.platformContent.update({
        where: { id: content.id },
        data: {
          text: result.text,
          files: JSON.stringify(result.files),
          altText: result.altTexts.join("\n\n"),
          hashtags: JSON.stringify(result.hashtags),
          tags: JSON.stringify(result.tags),
          suggestedSongs: JSON.stringify(result.suggestedSongs),
          backgroundImagePath: backgroundPath,
          coverImagePath: coverPath,
        },
      });
    }

    if (content.type === "instagram_reel" && options?.regenerateReel !== false) {
      const backgroundPath =
        options?.reelBackgroundPath !== undefined ? options.reelBackgroundPath : content.backgroundImagePath;
      const backgroundImageDataUri = await loadProfileImageDataUri(storage, backgroundPath);
      const narration = await resolveReelNarration(storage, content.narrationAudioPath, options?.reelNarration);
      const result = await prepareInstagramReel({
        rawText: newRawText,
        seed: post.id,
        folderPath: content.folderPath,
        storage,
        splitMode,
        revealMode,
        backgroundImageDataUri,
        hashtags: sharedHashtags,
        signal: options?.signal,
        onProgress: options?.onProgress,
        narration,
      });
      await prisma.platformContent.update({
        where: { id: content.id },
        data: {
          text: result.altText,
          files: JSON.stringify([result.file]),
          altText: result.altText,
          durationSeconds: result.durationSeconds,
          hashtags: JSON.stringify(sharedHashtags),
          backgroundImagePath: backgroundPath,
          narrationAudioPath: result.narrationAudioFileName
            ? path.join(content.folderPath, result.narrationAudioFileName)
            : null,
        },
      });
    }
  }

  return prisma.post.findUniqueOrThrow({
    where: { id: postId },
    include: { platformContents: true },
  });
}

/**
 * מעדכנת רק את השדה המשותף של התגיות (בלי רינדור מחדש של קרוסלה/ריל) —
 * לפי בקשתה, הכפתור היחיד שמתחיל יצירה/רינדור בפועל הוא "שמור טקסט"
 * (updatePostRawText/EditablePostText). התגיות המוטבעות בתוכן שכבר קיים
 * (PlatformContent.hashtags/tags, בפועל בתוך התמונה/הסרטון) לא משתנות עד
 * שהיא בעצמה תלחץ על "שמור טקסט" — הוא קורא את post.hashtags העדכני
 * ומרנדר לפיו. #אחתביום לא נשמרת בקלט — מתווספת אוטומטית ברינדור.
 */
export async function updatePostHashtags(postId: string, hashtags: string[]) {
  const sharedHashtags = normalizeSharedHashtags(hashtags);
  await prisma.post.update({
    where: { id: postId },
    data: { hashtags: JSON.stringify(sharedHashtags) },
  });

  return prisma.post.findUniqueOrThrow({
    where: { id: postId },
    include: { platformContents: true },
  });
}

/**
 * מוסיפה יעד (קרוסלה/ריל) לפוסט קיים, גם אם לא נבחר בשלב היצירה הראשוני.
 * משתמשת בטקסט ובתגיות המשותפות הקיימות של הפוסט, בדיוק כמו ביצירה.
 */
export async function addTargetToPost(
  postId: string,
  target: SelectedTarget,
  options?: {
    signal?: AbortSignal;
    onProgress?: (renderedFrames: number, totalFrames: number) => void;
    reelBackgroundPath?: string | null;
    reelNarration?: ReelNarration | null;
  }
) {
  const storage = getStorageService();
  const profile = await getProfileSettings();

  const post = await prisma.post.findUniqueOrThrow({
    where: { id: postId },
    include: { platformContents: true },
  });

  if (post.platformContents.some((pc) => pc.type === target)) {
    throw new Error("היעד הזה כבר קיים לפוסט הזה");
  }

  const sharedHashtags: string[] = JSON.parse(post.hashtags || "[]");
  const splitMode = post.splitMode as SplitMode;
  const revealMode = post.revealMode as RevealMode;
  const profileImageDataUri = await loadProfileImageDataUri(storage, profile.profileImagePath);
  const subfolder = await storage.createSubfolder(post.folderPath, SUBFOLDER_NAMES[target]);

  if (target === "instagram_carousel") {
    const result = await prepareInstagramCarousel({
      rawText: post.rawText,
      splitMode,
      hashtags: sharedHashtags,
      folderPath: subfolder,
      displayName: profile.displayName,
      profileImageDataUri,
      storage,
    });
    await prisma.platformContent.create({
      data: {
        postId: post.id,
        type: "instagram_carousel",
        folderPath: subfolder,
        text: result.text,
        files: JSON.stringify(result.files),
        altText: result.altTexts.join("\n\n"),
        hashtags: JSON.stringify(result.hashtags),
        tags: JSON.stringify(result.tags),
        suggestedSongs: JSON.stringify(result.suggestedSongs),
      },
    });
  }

  if (target === "instagram_reel") {
    const backgroundImageDataUri = await loadProfileImageDataUri(storage, options?.reelBackgroundPath);
    const result = await prepareInstagramReel({
      rawText: post.rawText,
      seed: post.id,
      folderPath: subfolder,
      storage,
      splitMode,
      revealMode,
      backgroundImageDataUri,
      hashtags: sharedHashtags,
      signal: options?.signal,
      onProgress: options?.onProgress,
      narration: options?.reelNarration,
    });
    await prisma.platformContent.create({
      data: {
        postId: post.id,
        type: "instagram_reel",
        folderPath: subfolder,
        text: result.altText,
        files: JSON.stringify([result.file]),
        altText: result.altText,
        durationSeconds: result.durationSeconds,
        hashtags: JSON.stringify(sharedHashtags),
        tags: JSON.stringify([]),
        suggestedSongs: JSON.stringify([]),
        backgroundImagePath: options?.reelBackgroundPath ?? null,
        narrationAudioPath: result.narrationAudioFileName
          ? path.join(subfolder, result.narrationAudioFileName)
          : null,
      },
    });
  }

  const existingTargets: SelectedTarget[] = JSON.parse(post.selectedTargets || "[]");
  await prisma.post.update({
    where: { id: postId },
    data: { selectedTargets: JSON.stringify([...new Set([...existingTargets, target])]) },
  });

  return prisma.post.findUniqueOrThrow({
    where: { id: postId },
    include: { platformContents: true },
  });
}
