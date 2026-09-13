import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { nanoid } from "nanoid";
import { z, flattenError } from "zod";
import {
  addBackgroundImagePath,
  removeBackgroundImagePath,
  setCarouselBackgroundDark,
  setBackgroundCategory,
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
});

/** מעדכנת תבנית רקע קיימת — סימון "כהה" (קרוסלה בלבד, ראו setCarouselBackgroundDark) ו/או קטגוריה. */
export async function PATCH(req: NextRequest) {
  const body = await req.json();
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  let darkPaths: string[] | undefined;
  let entries: Awaited<ReturnType<typeof setBackgroundCategory>> | undefined;

  if (parsed.data.isDark !== undefined) {
    darkPaths = await setCarouselBackgroundDark(parsed.data.path, parsed.data.isDark);
  }
  if (parsed.data.category !== undefined) {
    entries = await setBackgroundCategory(parsed.data.kind, parsed.data.path, parsed.data.category.trim());
  }

  return NextResponse.json({ darkPaths, entries });
}
