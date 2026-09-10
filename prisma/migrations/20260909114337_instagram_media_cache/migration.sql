-- CreateTable
CREATE TABLE "InstagramMedia" (
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
    "avgWatchSeconds" REAL,
    "syncedAt" DATETIME NOT NULL
);
