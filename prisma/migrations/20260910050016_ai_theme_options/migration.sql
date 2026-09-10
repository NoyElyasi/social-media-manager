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
    "highlights" TEXT NOT NULL DEFAULT '[]',
    "aiThemeOptions" TEXT NOT NULL DEFAULT '["פחד","קנאה","אהבה","כעס","געגוע","בדידות","בושה","אשמה","שמחה","תסכול","נוסטלגיה","ביקורת חברתית","אחר"]',
    "metaAccessToken" TEXT,
    "metaTokenExpiresAt" DATETIME,
    "metaPageId" TEXT,
    "metaPageName" TEXT,
    "metaInstagramBusinessAccountId" TEXT,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ProfileSettings" ("carouselBackgroundImagePaths", "coverBackgroundImagePaths", "displayName", "facebookProfileUrl", "highlights", "id", "metaAccessToken", "metaInstagramBusinessAccountId", "metaPageId", "metaPageName", "metaTokenExpiresAt", "profileImagePath", "reelBackgroundImagePaths", "updatedAt") SELECT "carouselBackgroundImagePaths", "coverBackgroundImagePaths", "displayName", "facebookProfileUrl", "highlights", "id", "metaAccessToken", "metaInstagramBusinessAccountId", "metaPageId", "metaPageName", "metaTokenExpiresAt", "profileImagePath", "reelBackgroundImagePaths", "updatedAt" FROM "ProfileSettings";
DROP TABLE "ProfileSettings";
ALTER TABLE "new_ProfileSettings" RENAME TO "ProfileSettings";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
