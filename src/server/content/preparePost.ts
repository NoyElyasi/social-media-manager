import { nanoid } from "nanoid";
import { prisma } from "../db";
import { getStorageService } from "../storage";
import { scanForIdentifyingDetails } from "./privacyScanner";
import { prepareFacebookDraft } from "./facebook";
import { prepareInstagramCarousel, stripSlideMarkers, type SplitMode } from "./instagramCarousel";
import { prepareInstagramReel, ReelCancelledError } from "./instagramReel";
import { getProfileSettings, loadProfileImageDataUri } from "../settings/profile";
import { ALWAYS_FIRST_HASHTAG, type SelectedTarget } from "@/lib/labels";

export type { SelectedTarget };

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
  /** תגיות שהמשתמשת הזינה בעצמה, במקום ההצעה האוטומטית (לכל היעדים). */
  manualHashtags?: string[] | null;
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

  const post = await prisma.post.create({
    data: {
      slug: dateSlug,
      rawText: input.rawText,
      selectedTargets: JSON.stringify(input.selectedTargets),
      hashtags: JSON.stringify(sharedHashtags),
      splitMode,
      folderPath: postFolderPath,
      privacyFlags: JSON.stringify(privacyFlags),
    },
  });

  const profileImageDataUri = await loadProfileImageDataUri(storage, profile.profileImagePath);
  const reelBackgroundImageDataUri = await loadProfileImageDataUri(storage, profile.reelBackgroundImagePath);

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
        const result = await prepareInstagramReel({
          rawText: input.rawText,
          seed: post.id,
          folderPath: subfolder,
          storage,
          splitMode,
          backgroundImageDataUri: reelBackgroundImageDataUri,
          hashtags: sharedHashtags,
          signal: input.signal,
          onProgress: input.onProgress,
        });
        await prisma.platformContent.create({
          data: {
            postId: post.id,
            type: "instagram_reel",
            folderPath: subfolder,
            text: result.altText,
            files: JSON.stringify([result.file]),
            altText: result.altText,
            hashtags: JSON.stringify(sharedHashtags),
            tags: JSON.stringify([]),
            suggestedSongs: JSON.stringify([]),
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
  options?: { signal?: AbortSignal; onProgress?: (renderedFrames: number, totalFrames: number) => void }
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

  await prisma.post.update({
    where: { id: postId },
    data: { rawText: newRawText, privacyFlags: JSON.stringify(privacyFlags) },
  });
  await storage.saveTextFile(post.folderPath, "טקסט-מקור.txt", newRawText);

  const profileImageDataUri = await loadProfileImageDataUri(storage, profile.profileImagePath);
  const reelBackgroundImageDataUri = await loadProfileImageDataUri(storage, profile.reelBackgroundImagePath);
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

    if (content.type === "instagram_carousel") {
      const result = await prepareInstagramCarousel({
        rawText: newRawText,
        splitMode,
        hashtags: sharedHashtags,
        folderPath: content.folderPath,
        displayName: profile.displayName,
        profileImageDataUri,
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
        },
      });
    }

    if (content.type === "instagram_reel") {
      const result = await prepareInstagramReel({
        rawText: newRawText,
        seed: post.id,
        folderPath: content.folderPath,
        storage,
        splitMode,
        backgroundImageDataUri: reelBackgroundImageDataUri,
        hashtags: sharedHashtags,
        signal: options?.signal,
        onProgress: options?.onProgress,
      });
      await prisma.platformContent.update({
        where: { id: content.id },
        data: {
          text: result.altText,
          files: JSON.stringify([result.file]),
          altText: result.altText,
          hashtags: JSON.stringify(sharedHashtags),
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
 * מעדכנת את התגיות המשותפות של הפוסט (קרוסלה + ריל — אותן תגיות בדיוק),
 * ומרנדרת מחדש כל תוכן קיים שמשתמש בהן. #אחתביום לא נשמרת בקלט — היא
 * מתווספת אוטומטית בכל רינדור (ראו finalizeHashtags).
 */
export async function updatePostHashtags(postId: string, hashtags: string[]) {
  const storage = getStorageService();
  const profile = await getProfileSettings();

  const post = await prisma.post.findUniqueOrThrow({
    where: { id: postId },
    include: { platformContents: true },
  });

  const sharedHashtags = normalizeSharedHashtags(hashtags);
  await prisma.post.update({
    where: { id: postId },
    data: { hashtags: JSON.stringify(sharedHashtags) },
  });

  const splitMode = post.splitMode as SplitMode;
  const profileImageDataUri = await loadProfileImageDataUri(storage, profile.profileImagePath);
  const reelBackgroundImageDataUri = await loadProfileImageDataUri(storage, profile.reelBackgroundImagePath);

  for (const content of post.platformContents) {
    if (content.type === "instagram_carousel") {
      const result = await prepareInstagramCarousel({
        rawText: post.rawText,
        splitMode,
        hashtags: sharedHashtags,
        folderPath: content.folderPath,
        displayName: profile.displayName,
        profileImageDataUri,
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
        },
      });
    }

    if (content.type === "instagram_reel") {
      // התגיות מוטבעות בפועל בסרטון (שורה נפרדת בראש) — עדכון שלהן חייב
      // רינדור מחדש, לא רק שמירה בשדה.
      const result = await prepareInstagramReel({
        rawText: post.rawText,
        seed: post.id,
        folderPath: content.folderPath,
        storage,
        splitMode,
        backgroundImageDataUri: reelBackgroundImageDataUri,
        hashtags: sharedHashtags,
      });
      await prisma.platformContent.update({
        where: { id: content.id },
        data: {
          text: result.altText,
          files: JSON.stringify([result.file]),
          altText: result.altText,
          hashtags: JSON.stringify(sharedHashtags),
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
 * מוסיפה יעד (קרוסלה/ריל) לפוסט קיים, גם אם לא נבחר בשלב היצירה הראשוני.
 * משתמשת בטקסט ובתגיות המשותפות הקיימות של הפוסט, בדיוק כמו ביצירה.
 */
export async function addTargetToPost(
  postId: string,
  target: SelectedTarget,
  options?: { signal?: AbortSignal; onProgress?: (renderedFrames: number, totalFrames: number) => void }
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
  const profileImageDataUri = await loadProfileImageDataUri(storage, profile.profileImagePath);
  const reelBackgroundImageDataUri = await loadProfileImageDataUri(storage, profile.reelBackgroundImagePath);
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
    const result = await prepareInstagramReel({
      rawText: post.rawText,
      seed: post.id,
      folderPath: subfolder,
      storage,
      splitMode,
      backgroundImageDataUri: reelBackgroundImageDataUri,
      hashtags: sharedHashtags,
      signal: options?.signal,
      onProgress: options?.onProgress,
    });
    await prisma.platformContent.create({
      data: {
        postId: post.id,
        type: "instagram_reel",
        folderPath: subfolder,
        text: result.altText,
        files: JSON.stringify([result.file]),
        altText: result.altText,
        hashtags: JSON.stringify(sharedHashtags),
        tags: JSON.stringify([]),
        suggestedSongs: JSON.stringify([]),
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
