-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_Post" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "slug" TEXT NOT NULL,
    "rawText" TEXT NOT NULL,
    "selectedTargets" TEXT NOT NULL,
    "hashtags" TEXT NOT NULL DEFAULT '[]',
    "splitMode" TEXT NOT NULL DEFAULT 'auto',
    "revealMode" TEXT NOT NULL DEFAULT 'word',
    "folderPath" TEXT NOT NULL,
    "privacyFlags" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_Post" ("createdAt", "folderPath", "hashtags", "id", "privacyFlags", "rawText", "selectedTargets", "slug", "splitMode", "updatedAt") SELECT "createdAt", "folderPath", "hashtags", "id", "privacyFlags", "rawText", "selectedTargets", "slug", "splitMode", "updatedAt" FROM "Post";
DROP TABLE "Post";
ALTER TABLE "new_Post" RENAME TO "Post";
CREATE UNIQUE INDEX "Post_slug_key" ON "Post"("slug");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
