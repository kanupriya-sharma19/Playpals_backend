-- First, create the Owner table with data from TurfOwner
CREATE TABLE IF NOT EXISTS "Owner" (
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
  
  CONSTRAINT "Owner_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Owner_email_key" UNIQUE ("email"),
  CONSTRAINT "Owner_resetToken_key" UNIQUE ("resetToken")
);

-- Copy data from TurfOwner to Owner
INSERT INTO "Owner" (
  "id", "name", "email", "password", "profilePhoto", "phoneNumber", 
  "ownerType", "organizationName", "registrationNumber", 
  "contactPersonName", "contactPersonPhone", "createdAt", "updatedAt",
  "resetToken", "resetTokenExpiration"
)
SELECT 
  "id", "name", "email", "password", "profilePhoto", "phoneNumber", 
  "ownerType", "organizationName", "registrationNumber", 
  "contactPersonName", "contactPersonPhone", "createdAt", "updatedAt",
  "resetToken", "resetTokenExpiration"
FROM "TurfOwner";

-- Create Turf table with data from TurfOwner
CREATE TABLE IF NOT EXISTS "Turf" (
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
  
  CONSTRAINT "Turf_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "Turf_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "Owner"("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

-- Copy data from TurfOwner to Turf
INSERT INTO "Turf" (
  "id", "turfName", "turfDescription", "turfLocation", "turfSize", 
  "turfGames", "amenities", "ratings", "countReviews", "pricePerPerson", 
  "totalSeats", "availableSeats", "available", "availabilitySlots", 
  "turfPhoto", "ownerId", "createdAt", "updatedAt"
)
SELECT 
  "id", "turfName", "turfDescription", "turfLocation", "turfSize", 
  "turfGames", "amenities", "ratings", "countReviews", "pricePerPerson", 
  "totalSeats", "availableSeats", "available", "availabilitySlots", 
  "turfPhoto", "id", "createdAt", "updatedAt" 
FROM "TurfOwner";

-- Update all tables that reference TurfOwner to point to the appropriate tables
-- Update Reviews to point to the new Turf table
UPDATE "Review"
SET "turfId" = "turfId"
WHERE EXISTS (SELECT 1 FROM "Turf" WHERE "Turf"."id" = "Review"."turfId");

-- Update Bookings to point to the new Turf table
UPDATE "Booking"
SET "turfId" = "turfId"
WHERE EXISTS (SELECT 1 FROM "Turf" WHERE "Turf"."id" = "Booking"."turfId");