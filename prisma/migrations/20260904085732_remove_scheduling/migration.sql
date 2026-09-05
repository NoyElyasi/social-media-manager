/*
  Warnings:

  - You are about to drop the column `scheduleMode` on the `PlatformContent` table. All the data in the column will be lost.
  - You are about to drop the column `scheduledAt` on the `PlatformContent` table. All the data in the column will be lost.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_PlatformContent" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "postId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "folderPath" TEXT NOT NULL,
    "text" TEXT,
    "files" TEXT NOT NULL,
    "altText" TEXT,
    "hashtags" TEXT NOT NULL,
    "tags" TEXT NOT NULL,
    "suggestedSongs" TEXT NOT NULL,
    "suggestedHighlight" TEXT,
    "backgroundColor" TEXT,
    "publishedAt" DATETIME,
    "status" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "PlatformContent_postId_fkey" FOREIGN KEY ("postId") REFERENCES "Post" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_PlatformContent" ("altText", "backgroundColor", "createdAt", "files", "folderPath", "hashtags", "id", "postId", "publishedAt", "status", "suggestedHighlight", "suggestedSongs", "tags", "text", "type", "updatedAt") SELECT "altText", "backgroundColor", "createdAt", "files", "folderPath", "hashtags", "id", "postId", "publishedAt", "status", "suggestedHighlight", "suggestedSongs", "tags", "text", "type", "updatedAt" FROM "PlatformContent";
DROP TABLE "PlatformContent";
ALTER TABLE "new_PlatformContent" RENAME TO "PlatformContent";
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
