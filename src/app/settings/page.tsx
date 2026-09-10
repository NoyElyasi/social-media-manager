import { getProfileSettings } from "@/server/settings/profile";
import { getMetaConnectionStatus } from "@/server/settings/meta";
import { prisma } from "@/server/db";
import { buildFileUrlFromPath } from "@/lib/files";
import ProfileSettingsForm from "@/components/ProfileSettingsForm";
import BackgroundGallery from "@/components/BackgroundGallery";
import MetaConnectionForm from "@/components/MetaConnectionForm";
import AiThemeOptionsForm from "@/components/AiThemeOptionsForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getProfileSettings();
  const reelBackgroundPaths: string[] = JSON.parse(profile.reelBackgroundImagePaths || "[]");
  const carouselBackgroundPaths: string[] = JSON.parse(profile.carouselBackgroundImagePaths || "[]");
  const coverBackgroundPaths: string[] = JSON.parse(profile.coverBackgroundImagePaths || "[]");
  const aiThemeOptions: string[] = JSON.parse(profile.aiThemeOptions || "[]");
  const metaStatus = await getMetaConnectionStatus();
  const latestSyncedPost = await prisma.instagramMedia.findFirst({ orderBy: { timestamp: "desc" }, select: { timestamp: true } });

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-brand-maroon">הגדרות</h1>
      <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5">
        <h2 className="mb-3 font-bold text-brand-maroon">חיבור לאינסטגרם/פייסבוק</h2>
        <MetaConnectionForm
          initial={metaStatus}
          lastDashboardSyncAt={profile.lastDashboardSyncAt ? profile.lastDashboardSyncAt.toISOString() : null}
          latestSyncedPostAt={latestSyncedPost ? latestSyncedPost.timestamp.toISOString() : null}
        />
      </div>
      <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5">
        <ProfileSettingsForm
          initial={{
            displayName: profile.displayName,
            profileImageUrl: profile.profileImagePath
              ? buildFileUrlFromPath(profile.profileImagePath)
              : null,
            facebookProfileUrl: profile.facebookProfileUrl,
          }}
        />
      </div>
      <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5">
        <h2 className="mb-3 font-bold text-brand-maroon">נושאי תיוג (לסיווג ידני של פוסטים)</h2>
        <AiThemeOptionsForm initial={aiThemeOptions} />
      </div>
      <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5">
        <BackgroundGallery
          kind="carousel"
          title="תבניות רקע לפוסט הקרוסלה"
          hint="אפשר להעלות כמה תבניות ולבחור מבינהן בזמן יצירת פוסט. בלי בחירה — נשאר הרקע הלבן הרגיל."
          initial={carouselBackgroundPaths.map((path) => ({ path, url: buildFileUrlFromPath(path) }))}
        />
      </div>
      <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5">
        <BackgroundGallery
          kind="reel"
          title="תבניות רקע לריל"
          hint="אפשר להעלות כמה תבניות ולבחור מבינהן בזמן יצירת פוסט. בלי בחירה — נבחר צבע רקע אוטומטי."
          initial={reelBackgroundPaths.map((path) => ({ path, url: buildFileUrlFromPath(path) }))}
        />
      </div>
      <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5">
        <BackgroundGallery
          kind="cover"
          title="תבניות רקע לעמוד שער (בקרוסלה)"
          hint="אם בוחרים תבנית כזו ביצירת פוסט, מתווסף עמוד ראשון נוסף עם הרקע הזה והתיוג הראשי של הפוסט מוצג עליו גדול, במרכז."
          initial={coverBackgroundPaths.map((path) => ({ path, url: buildFileUrlFromPath(path) }))}
        />
      </div>
    </div>
  );
}
