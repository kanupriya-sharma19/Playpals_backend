import { Request, Response } from "express";
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

export const createReview = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const { turfId, rating, comment } = req.body;
    const userId = req.user.id;

    // Check if user has a confirmed booking at this turf
    const hasBooking = await prisma.booking.findFirst({
      where: {
        userId,
        turfId,
        status: "CONFIRMED",
      },
    });

    if (!hasBooking) {
      return res.status(403).json({
        success: false,
        message: "You need to have a confirmed booking to leave a review",
      });
    }

    // Check if user already left a review for this turf
    const existingReview = await prisma.review.findFirst({
      where: { userId, turfId },
    });

    if (existingReview) {
      return res.status(400).json({
        success: false,
        message: "You have already reviewed this turf",
      });
    }

    // Create the review
    const review = await prisma.review.create({
      data: {
        userId,
        turfId,
        rating: Number(rating),
        comment,
      },
      include: {
        user: {
          select: {
            name: true,
            profilePhoto: true,
          },
        },
      },
    });

    // Update turf ratings - fixed to use turf model
    const turf = await prisma.turf.findUnique({
      where: { id: turfId },
      select: { countReviews: true, ratings: true },
    });

    if (turf) {
      const newReviewCount = turf.countReviews + 1;
      const newAverageRating =
        (turf.ratings * turf.countReviews + Number(rating)) / newReviewCount;

      await prisma.turf.update({
        where: { id: turfId },
        data: {
          countReviews: newReviewCount,
          ratings: newAverageRating,
        },
      });
    }

    res.status(201).json({
      success: true,
      message: "Review created successfully",
      review,
    });
  } catch (error: any) {
    console.error("Error creating review:", error);
    res.status(500).json({
      success: false,
      message: "Failed to create review",
      error: error.message,
    });
  }
};

export const getTurfReviews = async (req: Request, res: Response) => {
  const { turfId } = req.params;

  try {
    const reviews = await prisma.review.findMany({
      where: { turfId },
      include: { user: { select: { name: true, profilePhoto: true } } },
      orderBy: { createdAt: "desc" },
    });

    res.json({
      success: true,
      count: reviews.length,
      reviews,
    });
  } catch (error: any) {
    console.error("Error fetching reviews:", error);
    res.status(500).json({
      success: false,
      message: "Failed to fetch reviews",
      error: error.message,
    });
  }
};

export const getUserReviews = async (req: Request, res: Response) => {
  const userId = req.user.id;

  try {
    const reviews = await prisma.review.findMany({
      where: { userId },
      include: { turf: { select: { turfName: true, turfLocation: true } } },
    });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch user reviews" });
  }
};

export const updateReview = async (
  req: Request,
  res: Response,
): Promise<any> => {
  const { id } = req.params;
  const { rating, comment } = req.body;
  const userId = req.user.id;

  try {
    const review = await prisma.review.findUnique({ where: { id } });
    if (!review) return res.status(404).json({ error: "Review not found" });

    if (review.userId !== userId) {
      return res.status(403).json({ error: "Unauthorized" });
    }

    const updatedReview = await prisma.review.update({
      where: { id },
      data: { rating, comment },
    });

    res.json(updatedReview);
  } catch (error) {
    res.status(500).json({ error: "Failed to update review" });
  }
};

export const deleteReview = async (
  req: Request,
  res: Response,
): Promise<any> => {
  try {
    const { reviewId } = req.params;
    const userId = req.user.id;

    const review = await prisma.review.findUnique({
      where: { id: reviewId },
    });

    if (!review) {
      return res.status(404).json({
        success: false,
        message: "Review not found",
      });
    }

    if (review.userId !== userId) {
      return res.status(403).json({
        success: false,
        message: "You can only delete your own reviews",
      });
    }

    // Get the turf before deleting the review to update ratings
    const turf = await prisma.turf.findUnique({
      where: { id: review.turfId },
      select: { countReviews: true, ratings: true },
    });

    await prisma.review.delete({
      where: { id: reviewId },
    });

    // Update turf ratings after deleting review
    if (turf && turf.countReviews > 1) {
      const newReviewCount = turf.countReviews - 1;
      const newAverageRating =
        (turf.ratings * turf.countReviews - review.rating) / newReviewCount;

      await prisma.turf.update({
        where: { id: review.turfId },
        data: {
          countReviews: newReviewCount,
          ratings: newAverageRating,
        },
      });
    } else if (turf && turf.countReviews === 1) {
      // If this was the only review
      await prisma.turf.update({
        where: { id: review.turfId },
        data: {
          countReviews: 0,
          ratings: 0,
        },
      });
    }

    res.json({
      success: true,
      message: "Review deleted successfully",
    });
  } catch (error: any) {
    console.error("Error deleting review:", error);
    res.status(500).json({
      success: false,
      message: "Failed to delete review",
      error: error.message,
    });
  }
};
