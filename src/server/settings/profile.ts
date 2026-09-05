import { prisma } from "../db";
import type { StorageService } from "../storage/types";

/** ממפה סיומת קובץ ל-MIME תקין (jpg הוא לא MIME תקני — image/jpeg הוא). */
function extensionToMime(ext: string): string {
  const normalized = ext.toLowerCase();
  if (normalized === "jpg") return "image/jpeg";
  if (normalized === "jpeg") return "image/jpeg";
  if (normalized === "png") return "image/png";
  return `image/${normalized}`;
}

/**
 * טוענת את תמונת הפרופיל השמורה כ-data URI, להטמעה בתמונות שנוצרות.
 * לא נכשלת בשקט אבל לא זורקת חוצה — אם משהו לא תקין בקובץ השמור, מחזירה
 * null כדי שהרינדור ימשיך עם ראשי תיבות במקום להיתקע/לקרוס.
 */
export async function loadProfileImageDataUri(
  storage: StorageService,
  profileImagePath: string | null | undefined
): Promise<string | null> {
  if (!profileImagePath) return null;
  try {
    const buf = await storage.readFile(".", profileImagePath);
    const ext = profileImagePath.split(".").pop() || "png";
    return `data:${extensionToMime(ext)};base64,${buf.toString("base64")}`;
  } catch {
    return null;
  }
}

export async function getProfileSettings() {
  const existing = await prisma.profileSettings.findUnique({ where: { id: "default" } });
  if (existing) return existing;

  return prisma.profileSettings.create({
    data: {
      id: "default",
      displayName: process.env.DEFAULT_DISPLAY_NAME ?? "שם לדוגמה",
      highlights: "[]",
    },
  });
}

export async function updateProfileSettings(input: {
  displayName?: string;
  profileImagePath?: string | null;
  reelBackgroundImagePath?: string | null;
  highlights?: string[];
}) {
  await getProfileSettings(); // מבטיח שהרשומה קיימת

  return prisma.profileSettings.update({
    where: { id: "default" },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.profileImagePath !== undefined ? { profileImagePath: input.profileImagePath } : {}),
      ...(input.reelBackgroundImagePath !== undefined
        ? { reelBackgroundImagePath: input.reelBackgroundImagePath }
        : {}),
      ...(input.highlights !== undefined ? { highlights: JSON.stringify(input.highlights) } : {}),
    },
  });
}
