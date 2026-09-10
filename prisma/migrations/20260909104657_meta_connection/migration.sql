-- AlterTable
ALTER TABLE "ProfileSettings" ADD COLUMN "metaAccessToken" TEXT;
ALTER TABLE "ProfileSettings" ADD COLUMN "metaInstagramBusinessAccountId" TEXT;
ALTER TABLE "ProfileSettings" ADD COLUMN "metaPageId" TEXT;
ALTER TABLE "ProfileSettings" ADD COLUMN "metaPageName" TEXT;
ALTER TABLE "ProfileSettings" ADD COLUMN "metaTokenExpiresAt" DATETIME;
