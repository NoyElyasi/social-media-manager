-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_InstagramMedia" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "caption" TEXT,
    "timestamp" DATETIME NOT NULL,
    "permalink" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "mediaProductType" TEXT,
    "thumbnailUrl" TEXT,
    "captionWordCount" INTEGER NOT NULL,
    "hashtagCount" INTEGER NOT NULL,
    "likesCount" INTEGER,
    "commentsCount" INTEGER,
    "viewsCount" INTEGER,
    "reachCount" INTEGER,
    "savedCount" INTEGER,
    "sharesCount" INTEGER,
    "avgWatchSeconds" REAL,
    "durationSeconds" REAL,
    "aiTheme" TEXT,
    "aiFormat" TEXT,
    "aiTone" TEXT,
    "excludedFromReelSuggestions" BOOLEAN NOT NULL DEFAULT false,
    "syncedAt" DATETIME NOT NULL
);
INSERT INTO "new_InstagramMedia" ("aiFormat", "aiTheme", "aiTone", "avgWatchSeconds", "caption", "captionWordCount", "commentsCount", "durationSeconds", "hashtagCount", "id", "likesCount", "mediaProductType", "mediaType", "permalink", "reachCount", "savedCount", "sharesCount", "syncedAt", "thumbnailUrl", "timestamp", "viewsCount") SELECT "aiFormat", "aiTheme", "aiTone", "avgWatchSeconds", "caption", "captionWordCount", "commentsCount", "durationSeconds", "hashtagCount", "id", "likesCount", "mediaProductType", "mediaType", "permalink", "reachCount", "savedCount", "sharesCount", "syncedAt", "thumbnailUrl", "timestamp", "viewsCount" FROM "InstagramMedia";
DROP TABLE "InstagramMedia";
ALTER TABLE "new_InstagramMedia" RENAME TO "InstagramMedia";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
