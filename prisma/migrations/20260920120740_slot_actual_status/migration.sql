-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ScheduledSlot" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "date" DATETIME NOT NULL,
    "hour" INTEGER NOT NULL,
    "platformContentId" TEXT,
    "isManual" BOOLEAN NOT NULL DEFAULT false,
    "note" TEXT,
    "plannedFormat" TEXT,
    "actualStatus" TEXT NOT NULL DEFAULT 'pending',
    "actualAt" DATETIME,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "ScheduledSlot_platformContentId_fkey" FOREIGN KEY ("platformContentId") REFERENCES "PlatformContent" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);
INSERT INTO "new_ScheduledSlot" ("createdAt", "date", "hour", "id", "isManual", "note", "platformContentId", "updatedAt") SELECT "createdAt", "date", "hour", "id", "isManual", "note", "platformContentId", "updatedAt" FROM "ScheduledSlot";
DROP TABLE "ScheduledSlot";
ALTER TABLE "new_ScheduledSlot" RENAME TO "ScheduledSlot";
CREATE UNIQUE INDEX "ScheduledSlot_platformContentId_key" ON "ScheduledSlot"("platformContentId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;
