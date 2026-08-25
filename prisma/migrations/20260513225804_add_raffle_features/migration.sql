-- CreateEnum
CREATE TYPE "DescriptionMode" AS ENUM ('EXPANDED', 'COLLAPSED');

-- AlterTable
ALTER TABLE "Raffle" ADD COLUMN     "descriptionMode" "DescriptionMode" NOT NULL DEFAULT 'COLLAPSED',
ADD COLUMN     "feeAmount" DECIMAL(10,2),
ADD COLUMN     "hasFee" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "initialQuantity" INTEGER,
ADD COLUMN     "isFree" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "maxPerBuyer" INTEGER,
ADD COLUMN     "showDailyRanking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showOnHome" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showOverallRanking" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showParticipantName" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "showProgressBar" BOOLEAN NOT NULL DEFAULT true,
ALTER COLUMN "requiredFields" SET DEFAULT '{"name":true,"phone":true,"cpf":true,"email":false,"socialName":false,"birthDate":false}';

-- AlterTable
ALTER TABLE "Reservation" ADD COLUMN     "participantBirthDate" TIMESTAMP(3),
ADD COLUMN     "participantSocialName" TEXT;
