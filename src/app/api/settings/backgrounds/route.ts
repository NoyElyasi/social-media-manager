import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { nanoid } from "nanoid";
import { z, flattenError } from "zod";
import {
  addBackgroundImagePath,
  removeBackgroundImagePath,
  setCarouselBackgroundDark,
  setBackgroundCategory,
  setBackgroundTextPosition,
  setDefaultBackgroundPathForFormat,
  type BackgroundKind,
} from "@/server/settings/profile";
import { getStorageService } from "@/server/storage";

const FOLDER_BY_KIND: Record<BackgroundKind, string> = {
  reel: path.join("פרופיל", "רקעי-ריל"),
  carousel: path.join("פרופיל", "רקעי-קרוסלה"),
  cover: path.join("פרופיל", "רקעי-שער"),
};

const addSchema = z.object({
  kind: z.enum(["reel", "carousel", "cover"]),
  imageBase64: z.string().min(1),
  ext: z.enum(["png", "jpg", "jpeg"]),
  category: z.string().optional(),
});

/** מוסיפה תבנית רקע חדשה (ריל או קרוסלה) — שם קובץ ייחודי, כדי שהעלאות לא ידרסו זו את זו. */
export async function POST(req: NextRequest) {
  const body = await req.json();
  const parsed = addSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const storage = getStorageService();
  const fileName = `${nanoid(10)}.${parsed.data.ext}`;
  const buffer = Buffer.from(parsed.data.imageBase64, "base64");
  await storage.saveFile(FOLDER_BY_KIND[parsed.data.kind], fileName, buffer);
  const filePath = path.join(FOLDER_BY_KIND[parsed.data.kind], fileName);

  const entries = await addBackgroundImagePath(parsed.data.kind, filePath, parsed.data.category?.trim() ?? "");
  return NextResponse.json({ entries });
}

const removeSchema = z.object({
  kind: z.enum(["reel", "carousel", "cover"]),
  path: z.string().min(1),
});

/** מסירה תבנית רקע מרשימת הבחירה (הקובץ עצמו נשאר בדיסק — פוסטים קיימים שמשתמשים בה ימשיכו לעבוד). */
export async function DELETE(req: NextRequest) {
  const body = await req.json();
  const parsed = removeSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  const entries = await removeBackgroundImagePath(parsed.data.kind, parsed.data.path);
  return NextResponse.json({ entries });
}

const patchSchema = z.object({
  kind: z.enum(["reel", "carousel", "cover"]),
  path: z.string().min(1),
  isDark: z.boolean().optional(),
  category: z.string().optional(),
  textTopOffset: z.number().nullable().optional(),
  textRightInset: z.number().nullable().optional(),
  // הפורמט (רגיל/טיפ/מכתב) שמסמנים/מבטלים לתבנית הזו — עם isDefault, ראו setDefaultBackgroundPathForFormat.
  defaultFormat: z.enum(["regular", "tip", "letter"]).optional(),
  isDefault: z.boolean().optional(),
});

/** מעדכנת תבנית רקע קיימת — סימון "כהה" (קרוסלה בלבד), קטגוריה, מיקום טקסט מותאם, ו/או סימון כברירת מחדל לפורמט. */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  let darkPaths: string[] | undefined;
  let entries: Awaited<ReturnType<typeof setBackgroundCategory>> | undefined;
  let defaultPaths: Partial<Record<"regular" | "tip" | "letter", string>> | undefined;

  if (parsed.data.isDark !== undefined) {
    darkPaths = await setCarouselBackgroundDark(parsed.data.path, parsed.data.isDark);
  }
  if (parsed.data.category !== undefined) {
    entries = await setBackgroundCategory(parsed.data.kind, parsed.data.path, parsed.data.category.trim());
  }
  if (parsed.data.textTopOffset !== undefined || parsed.data.textRightInset !== undefined) {
    entries = await setBackgroundTextPosition(parsed.data.kind, parsed.data.path, {
      topOffset: parsed.data.textTopOffset ?? null,
      rightInset: parsed.data.textRightInset ?? null,
    });
  }
  if (parsed.data.defaultFormat !== undefined && parsed.data.isDefault !== undefined) {
    defaultPaths = await setDefaultBackgroundPathForFormat(parsed.data.kind, parsed.data.defaultFormat, parsed.data.isDefault ? parsed.data.path : null);
  }

  return NextResponse.json({ darkPaths, entries, defaultPaths });
}
