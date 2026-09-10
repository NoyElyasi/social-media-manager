import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { z, flattenError } from "zod";
import { getProfileSettings, updateProfileSettings } from "@/server/settings/profile";
import { getStorageService } from "@/server/storage";

export async function GET() {
  const profile = await getProfileSettings();
  return NextResponse.json({
    profile: {
      ...profile,
      reelBackgroundImagePaths: JSON.parse(profile.reelBackgroundImagePaths || "[]"),
      carouselBackgroundImagePaths: JSON.parse(profile.carouselBackgroundImagePaths || "[]"),
      coverBackgroundImagePaths: JSON.parse(profile.coverBackgroundImagePaths || "[]"),
      aiThemeOptions: JSON.parse(profile.aiThemeOptions || "[]"),
    },
  });
}

const updateSchema = z.object({
  displayName: z.string().min(1).optional(),
  // תמונת פרופיל כ-base64 (סעיף 6) — אופציונלי
  profileImageBase64: z.string().optional(),
  profileImageExt: z.enum(["png", "jpg", "jpeg"]).optional(),
  // לינק מלא לפרופיל שלה בפייסבוק — פייסבוק הסירו את החיפוש-בתוך-פרופיל בקישור ישיר.
  facebookProfileUrl: z.string().optional(),
  aiThemeOptions: z.array(z.string()).optional(),
});

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  let profileImagePath: string | undefined;
  const storage = getStorageService();

  if (parsed.data.profileImageBase64 && parsed.data.profileImageExt) {
    const fileName = `avatar.${parsed.data.profileImageExt}`;
    const buffer = Buffer.from(parsed.data.profileImageBase64, "base64");
    await storage.saveFile("פרופיל", fileName, buffer);
    profileImagePath = path.join("פרופיל", fileName);
  }

  const updated = await updateProfileSettings({
    displayName: parsed.data.displayName,
    profileImagePath,
    facebookProfileUrl: parsed.data.facebookProfileUrl,
    aiThemeOptions: parsed.data.aiThemeOptions,
  });

  return NextResponse.json({ profile: updated });
}
