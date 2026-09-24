-- Replace single default-background-path columns with per-format (regular/tip/letter) JSON maps.
ALTER TABLE "ProfileSettings" ADD COLUMN "defaultCarouselBackgroundPathsJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ProfileSettings" ADD COLUMN "defaultReelBackgroundPathsJson" TEXT NOT NULL DEFAULT '{}';
ALTER TABLE "ProfileSettings" ADD COLUMN "defaultCoverBackgroundPathsJson" TEXT NOT NULL DEFAULT '{}';

ALTER TABLE "ProfileSettings" DROP COLUMN "defaultCarouselBackgroundPath";
ALTER TABLE "ProfileSettings" DROP COLUMN "defaultReelBackgroundPath";
ALTER TABLE "ProfileSettings" DROP COLUMN "defaultCoverBackgroundPath";
