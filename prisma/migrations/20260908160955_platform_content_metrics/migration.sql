-- AlterTable: PlatformContent gets auto-computed length data and manually-entered performance metrics
ALTER TABLE "PlatformContent" ADD COLUMN "durationSeconds" REAL;
ALTER TABLE "PlatformContent" ADD COLUMN "likesCount" INTEGER;
ALTER TABLE "PlatformContent" ADD COLUMN "commentsCount" INTEGER;
ALTER TABLE "PlatformContent" ADD COLUMN "viewsCount" INTEGER;
ALTER TABLE "PlatformContent" ADD COLUMN "avgWatchSeconds" REAL;
ALTER TABLE "PlatformContent" ADD COLUMN "followersReachPercent" REAL;
ALTER TABLE "PlatformContent" ADD COLUMN "metricsUpdatedAt" DATETIME;
