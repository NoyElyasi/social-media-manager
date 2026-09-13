import { prisma } from "../db";
import type { StorageService } from "../storage/types";
import type { ThemeSongs } from "../content/songSuggestions";

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
    },
  });
}

export async function updateProfileSettings(input: {
  displayName?: string;
  profileImagePath?: string | null;
  facebookProfileUrl?: string | null;
  aiThemeOptions?: string[];
  themeSongs?: ThemeSongs;
}) {
  await getProfileSettings(); // מבטיח שהרשומה קיימת

  return prisma.profileSettings.update({
    where: { id: "default" },
    data: {
      ...(input.displayName !== undefined ? { displayName: input.displayName } : {}),
      ...(input.profileImagePath !== undefined ? { profileImagePath: input.profileImagePath } : {}),
      ...(input.facebookProfileUrl !== undefined ? { facebookProfileUrl: input.facebookProfileUrl } : {}),
      ...(input.aiThemeOptions !== undefined ? { aiThemeOptions: JSON.stringify(input.aiThemeOptions) } : {}),
      ...(input.themeSongs !== undefined ? { themeSongsJson: JSON.stringify(input.themeSongs) } : {}),
    },
  });
}

export type BackgroundKind = "reel" | "carousel" | "cover";

const BACKGROUND_FIELD: Record<
  BackgroundKind,
  "reelBackgroundImagePaths" | "carouselBackgroundImagePaths" | "coverBackgroundImagePaths"
> = {
  reel: "reelBackgroundImagePaths",
  carousel: "carouselBackgroundImagePaths",
  cover: "coverBackgroundImagePaths",
};

/**
 * קטגוריה/"סקין" חופשי לתבנית רקע (למשל "אחת ביום", "מכתב ביום", "טיפ
 * ביום") — מוקלד חופשי בזמן ההעלאה, לא רשימה סגורה שמנוהלת בנפרד. "" = בלי
 * קטגוריה (תבניות ישנות, מלפני הפיצ'ר הזה).
 */
export interface BackgroundEntry {
  path: string;
  category: string;
  /** מיקום טקסט מותאם לתבנית הזו (רלוונטי לקרוסלה בלבד) — override לקבועים
   * הרגילים ב-carouselSlide.ts, כדי שהטקסט לא יתנגש בעיטורים של הרקע הזה
   * בפרט. undefined/null = ברירת המחדל (לא כל תבנית צריכה כיוונון). */
  textTopOffset?: number | null;
  textRightInset?: number | null;
}

/** מפרשת את הרשימה השמורה — תומכת גם בפורמט הישן (מערך של נתיבים כמחרוזות בלבד), לפני שהתבנית קיבלה קטגוריה. */
export function parseBackgroundEntries(json: string): BackgroundEntry[] {
  let raw: unknown[];
  try {
    raw = JSON.parse(json || "[]");
  } catch {
    return [];
  }
  return raw.map((item) => (typeof item === "string" ? { path: item, category: "" } : (item as BackgroundEntry)));
}

/** מוסיפה נתיב תבנית רקע חדשה (שהועלתה) לרשימת התבניות הזמינות לבחירה, לפי סוג (ריל/קרוסלה/שער) וקטגוריה. */
export async function addBackgroundImagePath(
  kind: BackgroundKind,
  filePath: string,
  category: string
): Promise<BackgroundEntry[]> {
  const profile = await getProfileSettings();
  const field = BACKGROUND_FIELD[kind];
  const entries = parseBackgroundEntries(profile[field]);
  entries.push({ path: filePath, category });
  await prisma.profileSettings.update({ where: { id: "default" }, data: { [field]: JSON.stringify(entries) } });
  return entries;
}

/** מסירה נתיב תבנית רקע מרשימת הבחירה (לא מוחקת את הקובץ מהדיסק — פוסטים קיימים שכבר משתמשים בה ימשיכו לעבוד). */
export async function removeBackgroundImagePath(kind: BackgroundKind, filePath: string): Promise<BackgroundEntry[]> {
  const profile = await getProfileSettings();
  const field = BACKGROUND_FIELD[kind];
  const entries = parseBackgroundEntries(profile[field]).filter((e) => e.path !== filePath);
  const data: Record<string, string> = { [field]: JSON.stringify(entries) };

  // גם מנקים סימון "כהה" ישן אם היה — כדי שלא יישאר נתיב-רפאים ברשימה הזו.
  if (kind === "carousel") {
    const darkPaths: string[] = JSON.parse(profile.darkCarouselBackgroundPaths || "[]").filter(
      (p: string) => p !== filePath
    );
    data.darkCarouselBackgroundPaths = JSON.stringify(darkPaths);
  }

  await prisma.profileSettings.update({ where: { id: "default" }, data });
  return entries;
}

/** משנה את הקטגוריה של תבנית רקע קיימת (למשל אם טעו בהקלדה בהעלאה, או רוצים לשייך מחדש). */
export async function setBackgroundCategory(
  kind: BackgroundKind,
  filePath: string,
  category: string
): Promise<BackgroundEntry[]> {
  const profile = await getProfileSettings();
  const field = BACKGROUND_FIELD[kind];
  const entries = parseBackgroundEntries(profile[field]).map((e) => (e.path === filePath ? { ...e, category } : e));
  await prisma.profileSettings.update({ where: { id: "default" }, data: { [field]: JSON.stringify(entries) } });
  return entries;
}

/** משנה מיקום טקסט מותאם לתבנית רקע קיימת (ראו BackgroundEntry) — null מנקה חזרה לברירת המחדל. */
export async function setBackgroundTextPosition(
  kind: BackgroundKind,
  filePath: string,
  position: { topOffset: number | null; rightInset: number | null }
): Promise<BackgroundEntry[]> {
  const profile = await getProfileSettings();
  const field = BACKGROUND_FIELD[kind];
  const entries = parseBackgroundEntries(profile[field]).map((e) =>
    e.path === filePath ? { ...e, textTopOffset: position.topOffset, textRightInset: position.rightInset } : e
  );
  await prisma.profileSettings.update({ where: { id: "default" }, data: { [field]: JSON.stringify(entries) } });
  return entries;
}

/** מסמנת/מבטלת סימון תבנית רקע קרוסלה כ"כהה" — קובע את גוון פס ההתקדמות/מספור העמודים בתחתית העמוד. */
export async function setCarouselBackgroundDark(filePath: string, isDark: boolean): Promise<string[]> {
  const profile = await getProfileSettings();
  const current: string[] = JSON.parse(profile.darkCarouselBackgroundPaths || "[]");
  const next = isDark ? [...new Set([...current, filePath])] : current.filter((p) => p !== filePath);
  await prisma.profileSettings.update({
    where: { id: "default" },
    data: { darkCarouselBackgroundPaths: JSON.stringify(next) },
  });
  return next;
}
