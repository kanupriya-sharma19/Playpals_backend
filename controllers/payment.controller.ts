import { Request, Response } from "express";
import { razorpay } from "../config/razorpay.js";
import { PrismaClient } from "@prisma/client";
import crypto from "crypto";
import { parse, isBefore, isAfter } from "date-fns";

const prisma = new PrismaClient();

export const createOrder = async (
  req: Request,
  res: Response,
): Promise<any> => {
  const userId = req.user.id;
  const { turfId, amount, numberOfSeats, bookedFrom, bookedTo, day } = req.body;

  try {
    const bookedFromFormatted = parse(
      bookedFrom,
      "dd-MM-yyyy HH:mm",
      new Date(),
    );
    const bookedToFormatted = parse(bookedTo, "dd-MM-yyyy HH:mm", new Date());

    if (!isBefore(bookedFromFormatted, bookedToFormatted)) {
      return res
        .status(400)
        .json({ success: false, message: "Invalid booking time range" });
    }

    // Updated: Find Turf instead of TurfOwner
    const turf = await prisma.turf.findUnique({
      where: { id: turfId },
      include: { owner: true }, // Include owner details
    });

    if (!turf) {
      return res
        .status(404)
        .json({ success: false, message: "Turf not found" });
    }

    if (numberOfSeats > turf.availableSeats) {
      return res.status(400).json({
        success: false,
        message: `Only ${turf.availableSeats} seats are available`,
      });
    }

    const expectedAmount =
      Math.round((turf.pricePerPerson ?? 0) * numberOfSeats * 100) / 100;
    if (expectedAmount !== amount) {
      return res.status(400).json({
        success: false,
        message: `Invalid amount. Expected ${expectedAmount}`,
      });
    }

    if (turf.availabilitySlots) {
      const slotsData: {
        day: string;
        date?: string;
        slots: { start: string; end: string; availableSeats?: number }[];
      }[] =
        typeof turf.availabilitySlots === "string"
          ? JSON.parse(turf.availabilitySlots)
          : turf.availabilitySlots;

      const matchingDay = slotsData.find(
        (slotDay) => slotDay.day.toLowerCase() === day.toLowerCase(),
      );

      if (!matchingDay) {
        return res.status(400).json({
          success: false,
          message: `No slots available on ${day}`,
        });
      }

      const isValidSlot = matchingDay.slots.some((slot) => {
        const slotStart = parse(slot.start, "HH:mm", bookedFromFormatted);
        const slotEnd = parse(slot.end, "HH:mm", bookedToFormatted);

        return (
          !isBefore(bookedFromFormatted, slotStart) &&
          !isAfter(bookedToFormatted, slotEnd) &&
          (!slot.availableSeats || slot.availableSeats >= numberOfSeats)
        );
      });

      if (!isValidSlot) {
        return res.status(400).json({
          success: false,
          message: "Selected time is not within available slots",
        });
      }
    }

    const booking = await prisma.booking.create({
      data: {
        userId,
        turfId,
        numberOfSeats: Number(numberOfSeats),
        bookedFrom: bookedFromFormatted,
        bookedTo: bookedToFormatted,
        day,
      },
    });

    const order = await razorpay.orders.create({
      amount: amount * 100,
      currency: "INR",
      receipt: booking.id,
      notes: {
        userId,
        turfId,
      },
    });

    res.json({
      success: true,
      orderId: order.id,
      amount: order.amount,
      bookingId: booking.id,
      currency: order.currency,
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ success: false, message: "Order creation failed" });
  }
};

export const verifyPayment = async (
  req: Request,
  res: Response,
): Promise<any> => {
  const {
    razorpay_order_id,
    razorpay_payment_id,
    razorpay_signature,
    bookingId,
  } = req.body;

  const body = razorpay_order_id + "|" + razorpay_payment_id;
  const expectedSignature = crypto
    .createHmac("sha256", process.env.RAZORPAY_KEY_SECRET!)
    .update(body.toString())
    .digest("hex");

  if (expectedSignature === razorpay_signature) {
    // Payment verified, update booking status
    await prisma.booking.update({
      where: { id: bookingId },
      data: { status: "CONFIRMED" },
    });

    // Fetch booking and turf
    const booking = await prisma.booking.findUnique({
      where: { id: bookingId },
    });

    if (booking) {
      // NOW we decrease availableSeats and update availabilitySlots for the turf
      const turf = await prisma.turf.findUnique({
        where: { id: booking.turfId },
      });

      if (turf) {
        // Get current availability slots
        let availabilitySlots = turf.availabilitySlots
          ? typeof turf.availabilitySlots === "string"
            ? JSON.parse(turf.availabilitySlots)
            : turf.availabilitySlots
          : [];

        // Find the day in the slots
        const dayIndex = availabilitySlots.findIndex(
          (slot: any) => slot.day === booking.day,
        );

        if (dayIndex !== -1) {
          const bookedFromTime = new Date(booking.bookedFrom)
            .toTimeString()
            .substring(0, 5);
          const bookedToTime = new Date(booking.bookedTo)
            .toTimeString()
            .substring(0, 5);

          // Update the specific slot
          availabilitySlots[dayIndex].slots = availabilitySlots[dayIndex].slots
            .map((slot: any) => {
              if (slot.start <= bookedFromTime && slot.end >= bookedToTime) {
                return {
                  ...slot,
                  availableSeats:
                    (slot.availableSeats || turf.availableSeats) -
                    booking.numberOfSeats,
                };
              }
              return slot;
            })
            .filter((slot: any) => slot.availableSeats > 0);
        }

        // Update the turf with new availability
        await prisma.turf.update({
          where: { id: turf.id },
          data: {
            availableSeats: { decrement: booking.numberOfSeats },
            availabilitySlots,
          },
        });
      }
    }

    return res.json({
      success: true,
      message: "Payment verified & booking confirmed",
    });
  } else {
    return res
      .status(400)
      .json({ success: false, message: "Invalid signature" });
  }
};
