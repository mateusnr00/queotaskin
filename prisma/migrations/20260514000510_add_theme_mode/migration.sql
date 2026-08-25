-- CreateEnum
CREATE TYPE "ThemeMode" AS ENUM ('LIGHT', 'DARK');

-- AlterTable
ALTER TABLE "SiteSettings" ADD COLUMN     "themeMode" "ThemeMode" NOT NULL DEFAULT 'LIGHT';
