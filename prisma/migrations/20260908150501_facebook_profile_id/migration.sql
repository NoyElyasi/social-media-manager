-- AlterTable: ProfileSettings gets the Facebook profile identifier used to scope hashtag search to her own profile
ALTER TABLE "ProfileSettings" ADD COLUMN "facebookProfileId" TEXT;
