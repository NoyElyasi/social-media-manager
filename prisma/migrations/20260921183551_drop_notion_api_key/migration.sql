/*
  Warnings:

  - You are about to drop the column `notionApiKey` on the `ProfileSettings` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProfileSettings" (
    "id" TEXT NOT NULL PRIMARY KEY DEFAULT 'default',
    "displayName" TEXT NOT NULL DEFAULT '',
    "profileImagePath" TEXT,
    "facebookProfileUrl" TEXT,
    "reelBackgroundImagePaths" TEXT NOT NULL DEFAULT '[]',
    "carouselBackgroundImagePaths" TEXT NOT NULL DEFAULT '[]',
    "coverBackgroundImagePaths" TEXT NOT NULL DEFAULT '[]',
    "darkCarouselBackgroundPaths" TEXT NOT NULL DEFAULT '[]',
    "highlights" TEXT NOT NULL DEFAULT '[]',
    "aiThemeOptions" TEXT NOT NULL DEFAULT '["פחד","קנאה","אהבה","כעס","געגוע","בדידות","בושה","אשמה","שמחה","תסכול","נוסטלגיה","ביקורת חברתית","אחר"]',
    "themeSongsJson" TEXT NOT NULL DEFAULT '{"פחד":[{"title":"אל תפחד","artist":"אריק איינשטיין"}],"אהבה":[{"title":"אהבה בשבילנו","artist":"עברי לידר"},{"title":"תגידי","artist":"אייל גולן"}],"געגוע":[{"title":"געגוע","artist":"שלמה ארצי"},{"title":"הלוואי","artist":"יהודית רביץ"}],"שמחה":[{"title":"עוד יהיה טוב","artist":"עידן רייכל"},{"title":"שמח","artist":"אושר כהן"}],"נוסטלגיה":[{"title":"אביב","artist":"אריק איינשטיין"}],"ביקורת חברתית":[{"title":"שיר לשלום","artist":"מירי אלוני"}],"אחר":[{"title":"כאן ביחד","artist":"שרית חדד"},{"title":"יום יבוא","artist":"עידן רייכל"}]}',
    "metaAccessToken" TEXT,
    "metaTokenExpiresAt" DATETIME,
    "metaPageId" TEXT,
    "metaPageName" TEXT,
    "metaInstagramBusinessAccountId" TEXT,
    "lastDashboardSyncAt" DATETIME,
    "audienceGenderJson" TEXT,
    "audienceAgeJson" TEXT,
    "audienceCountryJson" TEXT,
    "audienceReachByFollowJson" TEXT,
    "notionDatabaseUrl" TEXT,
    "notionPropertyMap" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ProfileSettings" ("aiThemeOptions", "audienceAgeJson", "audienceCountryJson", "audienceGenderJson", "audienceReachByFollowJson", "carouselBackgroundImagePaths", "coverBackgroundImagePaths", "darkCarouselBackgroundPaths", "displayName", "facebookProfileUrl", "highlights", "id", "lastDashboardSyncAt", "metaAccessToken", "metaInstagramBusinessAccountId", "metaPageId", "metaPageName", "metaTokenExpiresAt", "notionDatabaseUrl", "notionPropertyMap", "profileImagePath", "reelBackgroundImagePaths", "themeSongsJson", "updatedAt") SELECT "aiThemeOptions", "audienceAgeJson", "audienceCountryJson", "audienceGenderJson", "audienceReachByFollowJson", "carouselBackgroundImagePaths", "coverBackgroundImagePaths", "darkCarouselBackgroundPaths", "displayName", "facebookProfileUrl", "highlights", "id", "lastDashboardSyncAt", "metaAccessToken", "metaInstagramBusinessAccountId", "metaPageId", "metaPageName", "metaTokenExpiresAt", "notionDatabaseUrl", "notionPropertyMap", "profileImagePath", "reelBackgroundImagePaths", "themeSongsJson", "updatedAt" FROM "ProfileSettings";
DROP TABLE "ProfileSettings";
ALTER TABLE "new_ProfileSettings" RENAME TO "ProfileSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
