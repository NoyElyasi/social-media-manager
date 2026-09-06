import { getProfileSettings } from "@/server/settings/profile";
import { buildFileUrlFromPath } from "@/lib/files";
import ProfileSettingsForm from "@/components/ProfileSettingsForm";
import BackgroundGallery from "@/components/BackgroundGallery";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getProfileSettings();
  const highlights: string[] = JSON.parse(profile.highlights || "[]");
  const reelBackgroundPaths: string[] = JSON.parse(profile.reelBackgroundImagePaths || "[]");
  const carouselBackgroundPaths: string[] = JSON.parse(profile.carouselBackgroundImagePaths || "[]");

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
        }}
      />
      <BackgroundGallery
        kind="carousel"
        title="תבניות רקע לפוסט הקרוסלה"
        hint="אפשר להעלות כמה תבניות ולבחור מבינהן בזמן יצירת פוסט. בלי בחירה — נשאר הרקע הלבן הרגיל."
        initial={carouselBackgroundPaths.map((path) => ({ path, url: buildFileUrlFromPath(path) }))}
      />
      <BackgroundGallery
        kind="reel"
        title="תבניות רקע לריל"
        hint="אפשר להעלות כמה תבניות ולבחור מבינהן בזמן יצירת פוסט. בלי בחירה — נבחר צבע רקע אוטומטי."
        initial={reelBackgroundPaths.map((path) => ({ path, url: buildFileUrlFromPath(path) }))}
      />
    </div>
  );
}
