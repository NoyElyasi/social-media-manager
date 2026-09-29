-- AlterTable
ALTER TABLE "ProfileSettings" ADD COLUMN "lastDashboardSyncType" TEXT;
ALTER TABLE "ProfileSettings" ADD COLUMN "dashboardSyncRunningType" TEXT;
ALTER TABLE "ProfileSettings" ADD COLUMN "dashboardSyncRunningSince" DATETIME;
