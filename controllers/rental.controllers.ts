import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const createRental = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { name, description, category, pricePerHour, quantity, ownerType } =
      req.body;

    const photos =
      req.files && "photos" in req.files
        ? (req.files["photos"] as Express.Multer.File[]).map(
            (file) => file.path,
          )
        : [];

    let userId: string | undefined;
    let turfId: string | undefined;

    if (!ownerType || !["USER", "TURFOWNER"].includes(ownerType)) {
      res
        .status(400)
        .json({ error: "Invalid ownerType. Must be 'USER' or 'TURFOWNER'." });
      return;
    }

    if (ownerType === "USER" && req.user?.id) {
      userId = req.user.id;
    } else if (ownerType === "TURFOWNER" && req.user?.id) {
      // Need to get the turf ID if available
      const owner = await prisma.owner.findUnique({
        where: { id: req.user.id },
        include: { turfs: true },
      });

      if (owner?.turfs.length) {
        turfId = owner.turfs[0].id; // Default to first turf
      } else {
        res.status(400).json({ error: "No turfs found for this owner." });
        return;
      }
    }

    if (!userId && !turfId) {
      res.status(400).json({ error: "Owner ID is required." });
      return;
    }

    const newRental = await prisma.sportsAmenity.create({
      data: {
        name,
        description,
        category,
        pricePerHour: parseFloat(pricePerHour),
        quantity: parseInt(quantity, 10),
        photos,
        isAvailable: true,
        ownerType,
        userId,
        turfId,
      },
    });

    res.status(201).json(newRental);
  } catch (error) {
    console.error("Error creating rental:", error);
    res.status(500).json({ error: "Failed to create rental", details: error });
  }
};

export const getAllRentals = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const rentals = await prisma.sportsAmenity.findMany({
      where: {
        isAvailable: true,
      },

      orderBy: {
        name: "asc",
      },
    });
    res.status(200).json(rentals);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch rentals", details: error });
  }
};

export const getRentalById = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const rental = await prisma.sportsAmenity.findUnique({ where: { id } });

    if (!rental) {
      res.status(404).json({ error: "Rental not found" });
      return;
    }

    res.status(200).json(rental);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch rental", details: error });
  }
};

export const updateRental = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;
    const { name, description, category, pricePerHour, quantity, isAvailable } =
      req.body;

    const photos =
      req.files && "photos" in req.files
        ? (req.files["photos"] as Express.Multer.File[]).map(
            (file) => file.path,
          )
        : undefined;

    const updatedRental = await prisma.sportsAmenity.update({
      where: { id },
      data: {
        name,
        description,
        category,
        pricePerHour: pricePerHour ? parseFloat(pricePerHour) : undefined,
        quantity: quantity ? parseInt(quantity, 10) : undefined,
        photos: photos !== undefined ? photos : undefined, // Update only if new photos are uploaded
        isAvailable:
          isAvailable === "true" || isAvailable === true ? true : undefined,
      },
    });

    res.status(200).json(updatedRental);
  } catch (error) {
    res.status(500).json({ error: "Failed to update rental", details: error });
  }
};

export const deleteRental = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { id } = req.params;

    const existingRental = await prisma.sportsAmenity.findUnique({
      where: { id },
    });

    if (!existingRental) {
      res.status(404).json({ error: "Rental not found" });
      return;
    }

    await prisma.sportsAmenity.delete({ where: { id } });

    res.status(200).json({ message: "Rental deleted successfully" });
  } catch (error) {
    res.status(500).json({ error: "Failed to delete rental", details: error });
  }
};
