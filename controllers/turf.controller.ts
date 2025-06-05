import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";
import { z } from "zod";

const prisma = new PrismaClient();

const availabilitySchema = z.array(
  z.object({
    day: z.string(),
    date: z
      .string()
      .regex(/^\d{2}-\d{2}-\d{4}$/, "Invalid date format (dd-MM-yyyy)")
      .optional(),
    slots: z.array(
      z.object({
        start: z
          .string()
          .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)"),
        end: z
          .string()
          .regex(/^([01]\d|2[0-3]):([0-5]\d)$/, "Invalid time format (HH:MM)"),
        availableSeats: z.number().min(0), // Make it required instead of optional
      })
    ),
  })
);

type AvailabilitySlot = z.infer<typeof availabilitySchema>;

export const registerTurf = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const ownerId = req.owner.id;
    const {
      turfName,
      turfDescription,
      turfLocation,
      turfSize,
      pricePerPerson,
      totalSeats,
      availableSeats,
      available,
    } = req.body;

    // Handle file uploads
    const turfPhotos =
      req.files && "turfPhoto" in req.files
        ? (req.files["turfPhoto"] as Express.Multer.File[]).map(
            (file) => file.path
          )
        : [];

    // Process turfGames array
    let turfGames;
    try {
      turfGames = req.body.turfGames ? JSON.parse(req.body.turfGames) : [];
    } catch {
      turfGames = [];
    }
    turfGames = Array.isArray(turfGames) ? turfGames : [turfGames];

    // Process amenities array
    let amenities;
    try {
      amenities = req.body.amenities ? JSON.parse(req.body.amenities) : [];
    } catch {
      amenities = [];
    }
    amenities = Array.isArray(amenities) ? amenities : [amenities];

    // Process availability slots with explicit typing
    let validatedAvailability: AvailabilitySlot = [];
    if (req.body.availabilitySlots) {
      try {
        const parsedAvailability = JSON.parse(req.body.availabilitySlots);

        // Add availableSeats to each slot if not present
        const slotsWithSeats = parsedAvailability.map((daySlot: any) => ({
          ...daySlot,
          slots: daySlot.slots.map((slot: any) => ({
            ...slot,
            availableSeats:
              slot.availableSeats !== undefined
                ? slot.availableSeats
                : parseInt(availableSeats, 10) || 0,
          })),
        }));

        validatedAvailability = availabilitySchema.parse(slotsWithSeats);
      } catch (err) {
        res.status(400).json({
          success: false,
          message: "Invalid availability slots format",
          error: err,
        });
      }
    }

    // Create the turf
    const turf = await prisma.turf.create({
      data: {
        turfName,
        turfDescription,
        turfLocation,
        turfSize,
        turfGames,
        amenities,
        pricePerPerson: pricePerPerson ? parseFloat(pricePerPerson) : null,
        totalSeats: totalSeats ? parseInt(totalSeats, 10) : null,
        availableSeats: availableSeats ? parseInt(availableSeats, 10) : 0,
        available: available === "true" || available === true,
        availabilitySlots: validatedAvailability,
        turfPhoto: turfPhotos,
        owner: {
          connect: { id: ownerId },
        },
      },
    });

    res.status(201).json({
      success: true,
      message: "Turf registered successfully",
      data: turf,
    });
  } catch (err: any) {
    console.error("Error registering turf:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

export const updateTurfDetails = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const turfId = req.params.turfId;
    const ownerId = req.owner.id;

    // First verify that this turf belongs to the owner
    const existingTurf = await prisma.turf.findFirst({
      where: {
        id: turfId,
        ownerId: ownerId,
      },
    });

    if (!existingTurf) {
      res.status(404).json({
        success: false,
        message: "Turf not found or you don't have permission to edit it",
      });
      return;
    }

    const {
      turfName,
      turfDescription,
      turfLocation,
      turfSize,
      pricePerPerson,
      totalSeats,
      availableSeats,
      available,
    } = req.body;

    // Handle file uploads
    const turfPhotos =
      req.files && "turfPhoto" in req.files
        ? (req.files["turfPhoto"] as Express.Multer.File[]).map(
            (file) => file.path
          )
        : undefined;

    // Process turfGames array
    let turfGames;
    try {
      turfGames = req.body.turfGames
        ? JSON.parse(req.body.turfGames)
        : undefined;
    } catch {
      turfGames = undefined;
    }
    if (turfGames)
      turfGames = Array.isArray(turfGames) ? turfGames : [turfGames];

    // Process amenities array
    let amenities;
    try {
      amenities = req.body.amenities
        ? JSON.parse(req.body.amenities)
        : undefined;
    } catch {
      amenities = undefined;
    }
    if (amenities)
      amenities = Array.isArray(amenities) ? amenities : [amenities];

    let validatedAvailability: AvailabilitySlot | undefined = undefined;
    if (req.body.availabilitySlots) {
      try {
        const parsedAvailability =
          typeof req.body.availabilitySlots === "string"
            ? JSON.parse(req.body.availabilitySlots)
            : req.body.availabilitySlots;

        // Add availableSeats to each slot if not present
        const slotsWithSeats = parsedAvailability.map((daySlot: any) => ({
          ...daySlot,
          slots: daySlot.slots.map((slot: any) => ({
            ...slot,
            availableSeats:
              slot.availableSeats !== undefined
                ? slot.availableSeats
                : parseInt(availableSeats, 10) || 0,
          })),
        }));

        validatedAvailability = availabilitySchema.parse(slotsWithSeats);
      } catch (err) {
        res.status(400).json({
          success: false,
          message: "Invalid availability slots format",
          error: err,
        });
        return;
      }
    }

    // Update the turf
    const updatedTurf = await prisma.turf.update({
      where: { id: turfId },
      data: {
        ...(turfName && { turfName }),
        ...(turfDescription !== undefined && { turfDescription }),
        ...(turfLocation && { turfLocation }),
        ...(turfSize !== undefined && { turfSize }),
        ...(turfGames && { turfGames }),
        ...(amenities && { amenities }),
        ...(pricePerPerson && { pricePerPerson: parseFloat(pricePerPerson) }),
        ...(totalSeats !== undefined && {
          totalSeats: parseInt(totalSeats, 10),
        }),
        ...(availableSeats !== undefined && {
          availableSeats: parseInt(availableSeats, 10),
        }),
        ...(available !== undefined && {
          available: available === "true" || available === true,
        }),
        ...(validatedAvailability && {
          availabilitySlots: validatedAvailability,
        }),
        ...(turfPhotos && { turfPhoto: turfPhotos }),
      },
    });

    res.status(200).json({
      success: true,
      message: "Turf updated successfully",
      data: updatedTurf,
    });
  } catch (err: any) {
    console.error("Error updating turf:", err);
    res.status(500).json({
      success: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
};

export const getTurfsByOwner = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const ownerId = req.owner.id;

    const turfs = await prisma.turf.findMany({
      where: {
        ownerId: ownerId,
      },
    });

    res.status(200).json({
      success: true,
      turfs,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Error fetching turfs",
      error: err.message,
    });
  }
};

export const getTurfDetails = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { turfId } = req.params;

    const turf = await prisma.turf.findUnique({
      where: { id: turfId },
      include: {
        owner: {
          select: {
            id: true,
            name: true,
            email: true,
            phoneNumber: true,
            ownerType: true,
            organizationName: true,
            contactPersonName: true,
            contactPersonPhone: true,
          },
        },
      },
    });

    if (!turf) {
      res.status(404).json({ success: false, message: "Turf not found" });
      return;
    }

    res.json({
      success: true,
      turf,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: "Error fetching turf details",
      error: err.message,
    });
  }
};

export const getAllTurfs = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const turfs = await prisma.turf.findMany({
      where: { available: true },
      include: {
        owner: {
          select: {
            name: true,
            ownerType: true,
            organizationName: true,
          },
        },
      },
    });

    res.status(200).json(turfs);
  } catch (err: any) {
    res.status(500).json({
      message: "Error fetching turfs",
      error: err.message,
    });
  }
};

export const getTurfBookings = async (
  req: Request,
  res: Response
): Promise<any> => {
  try {
    const { turfId } = req.params;
    const ownerId = req.owner.id;

    // Verify the turf belongs to this owner
    const turf = await prisma.turf.findFirst({
      where: {
        id: turfId,
        ownerId: ownerId,
      },
    });

    if (!turf) {
      return res.status(404).json({
        success: false,
        message:
          "Turf not found or you don't have permission to access its bookings",
      });
    }

    const bookings = await prisma.booking.findMany({
      where: { turfId: turfId },
      include: {
        user: { select: { name: true, email: true, phoneNumber: true } },
      },
    });

    const now = new Date();
    const pastBookings = bookings
      .filter((b) => new Date(b.bookedTo) < now)
      .sort(
        (a, b) =>
          new Date(b.bookedTo).getTime() - new Date(a.bookedTo).getTime()
      );

    const upcomingBookings = bookings
      .filter((b) => new Date(b.bookedFrom) >= now)
      .sort(
        (a, b) =>
          new Date(a.bookedFrom).getTime() - new Date(b.bookedFrom).getTime()
      );

    return res.status(200).json({
      success: true,
      pastBookings,
      upcomingBookings,
    });
  } catch (err: any) {
    res.status(500).json({
      success: false,
      message: err.message || "Server error",
    });
  }
};

export const getTurfReviews = async (
  req: Request,
  res: Response
): Promise<void> => {
  try {
    const { turfId } = req.params;

    const reviews = await prisma.review.findMany({
      where: { turfId },
      include: { user: { select: { name: true, profilePhoto: true } } },
    });

    res.json({
      success: true,
      reviews,
    });
  } catch (error: any) {
    res.status(500).json({
      success: false,
      error: "Failed to fetch reviews",
      message: error.message,
    });
  }
};
