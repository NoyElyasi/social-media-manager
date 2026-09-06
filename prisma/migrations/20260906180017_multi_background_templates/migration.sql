-- AlterTable: PlatformContent gets a per-content chosen background path
ALTER TABLE "PlatformContent" ADD COLUMN "backgroundImagePath" TEXT;

-- AlterTable: ProfileSettings moves from a single reel background path to
-- two arrays (reel + carousel) of uploaded background paths to choose from.
ALTER TABLE "ProfileSettings" ADD COLUMN "reelBackgroundImagePaths" TEXT NOT NULL DEFAULT '[]';
ALTER TABLE "ProfileSettings" ADD COLUMN "carouselBackgroundImagePaths" TEXT NOT NULL DEFAULT '[]';

-- Data migration: preserve any existing single reel background path by
-- moving it into the new reelBackgroundImagePaths array before dropping
-- the old column.
UPDATE "ProfileSettings"
SET "reelBackgroundImagePaths" = json_array("reelBackgroundImagePath")
WHERE "reelBackgroundImagePath" IS NOT NULL;

ALTER TABLE "ProfileSettings" DROP COLUMN "reelBackgroundImagePath";
