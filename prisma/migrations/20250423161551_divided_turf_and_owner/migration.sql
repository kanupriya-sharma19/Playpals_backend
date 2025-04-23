/*
  Warnings:

  - You are about to drop the `TurfOwner` table. If the table is not empty, all the data it contains will be lost.

*/
-- DropForeignKey
ALTER TABLE "Booking" DROP CONSTRAINT "Booking_turfId_fkey";

-- DropForeignKey
ALTER TABLE "Review" DROP CONSTRAINT "Review_turfId_fkey";

-- DropForeignKey
ALTER TABLE "SportsAmenity" DROP CONSTRAINT "SportsAmenity_TurfOwner_fkey";

-- AlterTable
ALTER TABLE "SportsAmenity" ADD COLUMN     "turfId" TEXT;

-- DropTable
DROP TABLE "TurfOwner";

-- CreateTable
CREATE TABLE "Owner" (
    "id" TEXT NOT NULL,
    "name" TEXT,
    "email" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "profilePhoto" TEXT,
    "phoneNumber" TEXT NOT NULL,
    "ownerType" "TurfOwnerType" NOT NULL,
    "organizationName" TEXT,
    "registrationNumber" TEXT,
    "contactPersonName" TEXT,
    "contactPersonPhone" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "resetToken" TEXT,
    "resetTokenExpiration" TIMESTAMP(3),

    CONSTRAINT "Owner_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Turf" (
    "id" TEXT NOT NULL,
    "turfName" TEXT NOT NULL,
    "turfDescription" TEXT,
    "turfLocation" TEXT NOT NULL,
    "turfSize" TEXT,
    "turfGames" TEXT[],
    "amenities" TEXT[],
    "ratings" DOUBLE PRECISION NOT NULL DEFAULT 0.0,
    "countReviews" INTEGER NOT NULL DEFAULT 0,
    "pricePerPerson" DOUBLE PRECISION,
    "totalSeats" INTEGER,
    "availableSeats" INTEGER NOT NULL DEFAULT 0,
    "available" BOOLEAN NOT NULL DEFAULT true,
    "availabilitySlots" JSONB,
    "turfPhoto" TEXT[],
    "ownerId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Turf_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "Owner_email_key" ON "Owner"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Owner_resetToken_key" ON "Owner"("resetToken");

-- AddForeignKey
ALTER TABLE "Review" ADD CONSTRAINT "Review_turfId_fkey" FOREIGN KEY ("turfId") REFERENCES "Turf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Booking" ADD CONSTRAINT "Booking_turfId_fkey" FOREIGN KEY ("turfId") REFERENCES "Turf"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportsAmenity" ADD CONSTRAINT "SportsAmenity_TurfOwner_fkey" FOREIGN KEY ("turfOwnerId") REFERENCES "Turf"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SportsAmenity" ADD CONSTRAINT "SportsAmenity_turfId_fkey" FOREIGN KEY ("turfId") REFERENCES "Turf"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Turf" ADD CONSTRAINT "Turf_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
