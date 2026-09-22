import { getProfileSettings, parseBackgroundEntries } from "@/server/settings/profile";
import { getMetaConnectionStatus } from "@/server/settings/meta";
import { prisma } from "@/server/db";
import { buildFileUrlFromPath } from "@/lib/files";
import ProfileSettingsForm from "@/components/ProfileSettingsForm";
import BackgroundGallery from "@/components/BackgroundGallery";
import MetaConnectionForm from "@/components/MetaConnectionForm";
import AiThemeOptionsForm from "@/components/AiThemeOptionsForm";
import SyncCodeButton from "@/components/SyncCodeButton";
import SettingsTabs from "@/components/SettingsTabs";
import NotionConnectionForm from "@/components/NotionConnectionForm";

export const dynamic = "force-dynamic";

export default async function SettingsPage() {
  const profile = await getProfileSettings();
  const reelBackgroundEntries = parseBackgroundEntries(profile.reelBackgroundImagePaths);
  const carouselBackgroundEntries = parseBackgroundEntries(profile.carouselBackgroundImagePaths);
  const darkCarouselBackgroundPaths: string[] = JSON.parse(profile.darkCarouselBackgroundPaths || "[]");
  const coverBackgroundEntries = parseBackgroundEntries(profile.coverBackgroundImagePaths);
  const aiThemeOptions: string[] = JSON.parse(profile.aiThemeOptions || "[]");
  const metaStatus = await getMetaConnectionStatus();
  const latestSyncedPost = await prisma.instagramMedia.findFirst({ orderBy: { timestamp: "desc" }, select: { timestamp: true } });

  const tabs = [
    {
      id: "connection",
      label: "חיבור לאינסטגרם/פייסבוק",
      content: (
        <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5">
          <h2 className="mb-3 font-bold text-brand-maroon">חיבור לאינסטגרם/פייסבוק</h2>
          <MetaConnectionForm
            initial={metaStatus}
            lastDashboardSyncAt={profile.lastDashboardSyncAt ? profile.lastDashboardSyncAt.toISOString() : null}
            latestSyncedPostAt={latestSyncedPost ? latestSyncedPost.timestamp.toISOString() : null}
          />
        </div>
      ),
    },
    {
      id: "profile",
      label: "פרופיל",
      content: (
        <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5">
          <ProfileSettingsForm
            initial={{
              displayName: profile.displayName,
              profileImageUrl: profile.profileImagePath ? buildFileUrlFromPath(profile.profileImagePath) : null,
              facebookProfileUrl: profile.facebookProfileUrl,
            }}
          />
        </div>
      ),
    },
    {
      id: "backgrounds",
      label: "רקעים",
      content: (
        <>
          <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5">
            <BackgroundGallery
              kind="carousel"
              title="תבניות רקע לפוסט הקרוסלה"
              hint="אפשר להעלות כמה תבניות ולבחור מבינהן בזמן יצירת פוסט. בלי בחירה — נשאר הרקע הלבן הרגיל."
              initial={carouselBackgroundEntries.map((e) => ({
                path: e.path,
                url: buildFileUrlFromPath(e.path),
                category: e.category,
                textTopOffset: e.textTopOffset,
                textRightInset: e.textRightInset,
              }))}
              initialDarkPaths={darkCarouselBackgroundPaths}
            />
          </div>
          <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5">
            <BackgroundGallery
              kind="reel"
              title="תבניות רקע לריל"
              hint="אפשר להעלות כמה תבניות ולבחור מבינהן בזמן יצירת פוסט. בלי בחירה — נבחר צבע רקע אוטומטי."
              initial={reelBackgroundEntries.map((e) => ({ path: e.path, url: buildFileUrlFromPath(e.path), category: e.category }))}
            />
          </div>
          <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5">
            <BackgroundGallery
              kind="cover"
              title="תבניות רקע לעמוד שער (בקרוסלה)"
              hint="אם בוחרים תבנית כזו ביצירת פוסט, מתווסף עמוד ראשון נוסף עם הרקע הזה והתיוג הראשי של הפוסט מוצג עליו גדול, במרכז."
              initial={coverBackgroundEntries.map((e) => ({ path: e.path, url: buildFileUrlFromPath(e.path), category: e.category }))}
            />
          </div>
        </>
      ),
    },
    {
      id: "ai",
      label: "תיוג",
      content: (
        <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5">
          <h2 className="mb-3 font-bold text-brand-maroon">נושאי תיוג (לסיווג ידני של פוסטים)</h2>
          <AiThemeOptionsForm initial={aiThemeOptions} />
        </div>
      ),
    },
    {
      id: "notion",
      label: "Notion",
      content: (
        <div className="rounded-xl border border-brand-pink/30 bg-brand-card p-5">
          <h2 className="mb-3 font-bold text-brand-maroon">חיבור לטבלת הקטעים ב-Notion</h2>
          <NotionConnectionForm
            apiKeyConfigured={!!process.env.NOTION_API_KEY?.trim()}
            initialDatabaseUrl={profile.notionDatabaseUrl}
            initialPropertyMap={profile.notionPropertyMap ? JSON.parse(profile.notionPropertyMap) : null}
          />
        </div>
      ),
    },
    {
      id: "sync",
      label: "עדכוני קוד",
      content: <SyncCodeButton />,
    },
  ];

  return (
    <div className="flex flex-col gap-6">
      <h1 className="text-2xl font-bold text-brand-maroon">הגדרות</h1>
      <SettingsTabs tabs={tabs} />
    </div>
  );
}
