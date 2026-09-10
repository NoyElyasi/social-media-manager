-- AlterTable
ALTER TABLE "InstagramMedia" ADD COLUMN "aiFormat" TEXT;
ALTER TABLE "InstagramMedia" ADD COLUMN "aiTheme" TEXT;
ALTER TABLE "InstagramMedia" ADD COLUMN "aiTone" TEXT;

-- AlterTable
ALTER TABLE "Post" ADD COLUMN "aiClassifiedAt" DATETIME;
ALTER TABLE "Post" ADD COLUMN "aiFormat" TEXT;
ALTER TABLE "Post" ADD COLUMN "aiTheme" TEXT;
ALTER TABLE "Post" ADD COLUMN "aiTone" TEXT;
