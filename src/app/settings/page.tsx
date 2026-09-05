import { getProfileSettings } from "@/server/settings/profile";
import { buildFileUrlFromPath } from "@/lib/files";
import ProfileSettingsForm from "@/components/ProfileSettingsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getProfileSettings();
  const highlights: string[] = JSON.parse(profile.highlights || "[]");

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold">הגדרות</h1>
      <ProfileSettingsForm
        initial={{
          displayName: profile.displayName,
          highlights,
          profileImageUrl: profile.profileImagePath
            ? buildFileUrlFromPath(profile.profileImagePath)
            : null,
          reelBackgroundImageUrl: profile.reelBackgroundImagePath
            ? buildFileUrlFromPath(profile.reelBackgroundImagePath)
            : null,
        }}
      />
    </div>
  );
}
