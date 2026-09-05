import { NextRequest, NextResponse } from "next/server";
import path from "path";
import { z, flattenError } from "zod";
import { getProfileSettings, updateProfileSettings } from "@/server/settings/profile";
import { getStorageService } from "@/server/storage";

export async function GET() {
  const profile = await getProfileSettings();
  return NextResponse.json({
    profile: { ...profile, highlights: JSON.parse(profile.highlights || "[]") },
  });
}

const updateSchema = z.object({
  displayName: z.string().min(1).optional(),
  highlights: z.array(z.string()).optional(),
  // תמונת פרופיל כ-base64 (סעיף 6) — אופציונלי
  profileImageBase64: z.string().optional(),
  profileImageExt: z.enum(["png", "jpg", "jpeg"]).optional(),
  // תבנית רקע קבועה לריל — אופציונלי
  reelBackgroundImageBase64: z.string().optional(),
  reelBackgroundImageExt: z.enum(["png", "jpg", "jpeg"]).optional(),
});

export async function PUT(req: NextRequest) {
  const body = await req.json();
  const parsed = updateSchema.safeParse(body);

  if (!parsed.success) {
    return NextResponse.json({ error: flattenError(parsed.error) }, { status: 400 });
  }

  let profileImagePath: string | undefined;
  let reelBackgroundImagePath: string | undefined;
  const storage = getStorageService();

  if (parsed.data.profileImageBase64 && parsed.data.profileImageExt) {
    const fileName = `avatar.${parsed.data.profileImageExt}`;
    const buffer = Buffer.from(parsed.data.profileImageBase64, "base64");
    await storage.saveFile("פרופיל", fileName, buffer);
    profileImagePath = path.join("פרופיל", fileName);
  }

  if (parsed.data.reelBackgroundImageBase64 && parsed.data.reelBackgroundImageExt) {
    const fileName = `רקע-ריל.${parsed.data.reelBackgroundImageExt}`;
    const buffer = Buffer.from(parsed.data.reelBackgroundImageBase64, "base64");
    await storage.saveFile("פרופיל", fileName, buffer);
    reelBackgroundImagePath = path.join("פרופיל", fileName);
  }

  const updated = await updateProfileSettings({
    displayName: parsed.data.displayName,
    highlights: parsed.data.highlights,
    profileImagePath,
    reelBackgroundImagePath,
  });

  return NextResponse.json({ profile: updated });
}
