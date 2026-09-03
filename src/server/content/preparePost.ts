import { nanoid } from "nanoid";
import { prisma } from "../db";
import { getStorageService } from "../storage";
import { scanForIdentifyingDetails } from "./privacyScanner";
import { prepareFacebookDraft } from "./facebook";
import { prepareInstagramCarousel, MANUAL_SLIDE_BREAK, stripSlideMarkers, type SplitMode } from "./instagramCarousel";
import { prepareInstagramStory } from "./instagramStory";
import { getProfileSettings, loadProfileImageDataUri } from "../settings/profile";
import type { SelectedTarget } from "@/lib/labels";

export type { SelectedTarget };

const SUBFOLDER_NAMES: Record<SelectedTarget, string> = {
  facebook_post: "פייסבוק",
  instagram_carousel: "אינסטגרם-פוסט",
  instagram_story: "אינסטגרם-סטורי",
};

const NON_SLUG_CHARS = new RegExp("[^\\u0590-\\u05FFa-zA-Z0-9\\s]", "g");

function slugify(text: string): string {
  const words = text
    .replace(NON_SLUG_CHARS, "")
    .trim()
    .split(/\s+/)
    .slice(0, 4);
  const base = words.join("-");
  return base || nanoid(6);
}

export interface CreatePostInput {
  rawText: string;
  selectedTargets: SelectedTarget[];
  storyLink?: string | null;
  /** אופן חילוק העמודים בקרוסלה: "auto" (לפי אורך) או "manual" (לפי סימוני /// שהמשתמשת הוסיפה). */
  carouselSplitMode?: SplitMode;
  /** תגיות שהמשתמשת הזינה בעצמה, במקום ההצעה האוטומטית (לכל היעדים). */
  manualHashtags?: string[] | null;
}

export async function createAndPreparePost(input: CreatePostInput) {
  const storage = getStorageService();
  const profile = await getProfileSettings();
  const highlights: string[] = JSON.parse(profile.highlights || "[]");

  // טקסט "נקי" בלי סימוני חילוק ידני — משמש לכל מה שאינו הקרוסלה עצמה (הגהה, סקאנר פרטיות, סטורי)
  const cleanText = stripSlideMarkers(input.rawText);

  const privacyFlags = scanForIdentifyingDetails(cleanText);

  const dateStr = new Date().toISOString().slice(0, 10);
  const dateSlug = `${dateStr}_${slugify(input.rawText)}`;
  const postFolderPath = await storage.createPostFolder(dateSlug);

  await storage.saveTextFile(postFolderPath, "טקסט-מקור.txt", input.rawText);

  const post = await prisma.post.create({
    data: {
      slug: dateSlug,
      rawText: input.rawText,
      selectedTargets: JSON.stringify(input.selectedTargets),
      folderPath: postFolderPath,
      privacyFlags: JSON.stringify(privacyFlags),
    },
  });

  const profileImageDataUri = await loadProfileImageDataUri(storage, profile.profileImagePath);

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
        splitMode: input.carouselSplitMode ?? "auto",
        hashtags: input.manualHashtags ?? undefined,
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

    if (target === "instagram_story") {
      const result = await prepareInstagramStory({
        rawText: cleanText,
        seed: post.id,
        folderPath: subfolder,
        existingHighlights: highlights,
        link: input.storyLink,
        storage,
      });
      await prisma.platformContent.create({
        data: {
          postId: post.id,
          type: "instagram_story",
          folderPath: subfolder,
          text: result.marketingLine,
          files: JSON.stringify(result.files),
          altText: result.altTexts.join("\n\n"),
          hashtags: JSON.stringify([]),
          tags: JSON.stringify([]),
          suggestedSongs: JSON.stringify([]),
          suggestedHighlight: result.suggestedHighlight,
        },
      });
    }
  }

  return prisma.post.findUniqueOrThrow({
    where: { id: post.id },
    include: { platformContents: true },
  });
}

/**
 * מעדכנת את הטקסט הגולמי של פוסט קיים, ומרנדרת מחדש את כל התכנים שכבר
 * נוצרו לו (טקסט, תמונות) — כדי שלא יישארו לא מסונכרנים עם הטקסט החדש.
 * שומרת על התגיות שנבחרו לכל תוכן (לא חוזרת להצעה האוטומטית).
 */
export async function updatePostRawText(postId: string, newRawText: string) {
  const storage = getStorageService();
  const profile = await getProfileSettings();
  const highlights: string[] = JSON.parse(profile.highlights || "[]");

  const post = await prisma.post.findUniqueOrThrow({
    where: { id: postId },
    include: { platformContents: true },
  });

  const cleanText = stripSlideMarkers(newRawText);
  const privacyFlags = scanForIdentifyingDetails(cleanText);
  const inferredSplitMode = newRawText.includes(MANUAL_SLIDE_BREAK) ? "manual" : "auto";

  await prisma.post.update({
    where: { id: postId },
    data: { rawText: newRawText, privacyFlags: JSON.stringify(privacyFlags) },
  });
  await storage.saveTextFile(post.folderPath, "טקסט-מקור.txt", newRawText);

  const profileImageDataUri = await loadProfileImageDataUri(storage, profile.profileImagePath);

  for (const content of post.platformContents) {
    if (content.type === "facebook_post") {
      const existingHashtags: string[] = JSON.parse(content.hashtags || "[]");
      const draft = prepareFacebookDraft(cleanText, existingHashtags);
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
      const existingHashtags: string[] = JSON.parse(content.hashtags || "[]");
      const result = await prepareInstagramCarousel({
        rawText: newRawText,
        splitMode: inferredSplitMode,
        hashtags: existingHashtags,
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

    if (content.type === "instagram_story") {
      const result = await prepareInstagramStory({
        rawText: cleanText,
        seed: post.id,
        folderPath: content.folderPath,
        existingHighlights: highlights,
        link: null,
        storage,
      });
      await prisma.platformContent.update({
        where: { id: content.id },
        data: {
          text: result.marketingLine,
          files: JSON.stringify(result.files),
          altText: result.altTexts.join("\n\n"),
          suggestedHighlight: result.suggestedHighlight,
        },
      });
    }
  }

  return prisma.post.findUniqueOrThrow({
    where: { id: postId },
    include: { platformContents: true },
  });
}
