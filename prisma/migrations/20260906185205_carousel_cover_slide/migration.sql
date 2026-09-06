-- AlterTable: PlatformContent gets a per-content chosen cover-slide background path
ALTER TABLE "PlatformContent" ADD COLUMN "coverImagePath" TEXT;

-- AlterTable: ProfileSettings gets an uploaded-backgrounds list for the cover slide
ALTER TABLE "ProfileSettings" ADD COLUMN "coverBackgroundImagePaths" TEXT NOT NULL DEFAULT '[]';
