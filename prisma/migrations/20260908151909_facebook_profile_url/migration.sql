-- Data migration: the old column held a bare username (e.g. "noy.elyasi") — turn it
-- into a full profile URL before renaming, so the existing saved value keeps working.
UPDATE "ProfileSettings"
SET "facebookProfileId" = 'https://www.facebook.com/' || "facebookProfileId"
WHERE "facebookProfileId" IS NOT NULL AND "facebookProfileId" NOT LIKE 'http%';

-- RenameColumn: the old profile-scoped search URL scheme is gone — the field now
-- just links to the profile page itself (see schema.prisma comment).
ALTER TABLE "ProfileSettings" RENAME COLUMN "facebookProfileId" TO "facebookProfileUrl";
