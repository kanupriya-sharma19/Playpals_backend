import { Request, Response, NextFunction } from "express";
import { PrismaClient } from "@prisma/client";
import bcrypt from "bcryptjs";
import { Prisma } from "@prisma/client";
import jwt from "jsonwebtoken";
import nodemailer from "nodemailer";
import crypto from "crypto";
import passport from "../config/passportGoogle.js";
import dotenv from "dotenv";
dotenv.config();
import { BitlyClient } from 'bitly';
const bitly = new BitlyClient(process.env.BITLY_ACCESS_TOKEN as string);

const prisma = new PrismaClient();

export async function getUsers(req: Request, res: Response) {
  const users = await prisma.user.findMany();
  res.json({
    status: true,
    message: "Users Successfully fetched",
    data: users,
  });
}

export async function getUser(req: Request, res: Response) {
  const { userid } = req.params;
  const user = await prisma.user.findFirst({ where: { id: userid } });
  res.json({ status: true, message: "User Successfully fetched", data: user });
}

export const signupUser = async (
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> => {
  try {
    const { name, email, password, dob, gender, city } = req.body;
    const existingUser = await prisma.user.findUnique({ where: { email } });
    if (existingUser)
      return res
        .status(400)
        .json({ status: false, message: "User already exists" });
    const profilePhoto = req.file ? (req.file as any).path : null;
    const hashedPassword = await bcrypt.hash(password, 10);
    let gamePreferences;
    try {
      gamePreferences = req.body.gamePreferences
        ? JSON.parse(req.body.gamePreferences)
        : [];
    } catch {
      gamePreferences = [];
    }

    gamePreferences = Array.isArray(gamePreferences)
      ? gamePreferences
      : [gamePreferences];
    const user = await prisma.user.create({
      data: {
        name,
        email,
        password: hashedPassword,
        dob: dob ? new Date(dob) : null,
        gender,
        city,
        profilePhoto,
      } as Prisma.UserUncheckedCreateInput,
    });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET as string, {
      expiresIn: "1h",
    });
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 3600000,
    });

    res.status(201).json({
      status: true,
      message: "User successfully signed up",
      data: { user, token },
    });
  } catch (error) {
    console.error("Error during signup:", error);
    next(error);
  }
};

export async function loginUser(
  req: Request,
  res: Response,
  next: NextFunction,
): Promise<any> {
  try {
    const { email, password } = req.body;
    const user = await prisma.user.findUnique({ where: { email } });
    if (!user)
      return res
        .status(401)
        .json({ status: false, message: "Invalid credentials" });

    const isMatch = await bcrypt.compare(password, user.password);
    if (!isMatch)
      return res
        .status(401)
        .json({ status: false, message: "Invalid credentials" });

    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET as string, {
      expiresIn: "1h",
    });
    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 3600000,
    });

    return res.status(200).json({
      status: true,
      message: "Login successful",
      data: { user, token },
    });
  } catch (error: any) {
    next(error);
  }
}

export async function updateProfile(req: Request, res: Response): Promise<any> {
  try {
    const { dob, gender, city, phoneNumber } = req.body;
    let gamePreferences = [];

    try {
      gamePreferences = req.body.gamePreferences
        ? JSON.parse(req.body.gamePreferences)
        : [];
    } catch {
      gamePreferences = [];
    }
    const profilePhoto =
      req.files && (req.files as any)["profilePhoto"]
        ? (req.files as any)["profilePhoto"][0].path
        : undefined;
    const updatedUser = await prisma.user.update({
      where: { id: req.user.id },
      data: {
        dob: dob ? new Date(dob) : undefined,
        gender,
        city,
        phoneNumber,
        gamePreferences,
        ...(profilePhoto && { profilePhoto }),
      },
    });

    res.json({
      status: true,
      message: "Profile updated successfully",
      data: updatedUser,
    });
  } catch (error: any) {
    res
      .status(500)
      .json({ status: false, message: error.message || "Server error" });
  }
}

export async function generateResetLink(
  req: Request,
  res: Response,
): Promise<any> {
  const { email } = req.body;
  const user = await prisma.user.findUnique({ where: { email } });
  if (!user) {
    return res.status(404).json({ status: false, message: "User not found" });
  }
  const resetToken = crypto.randomBytes(32).toString("hex");
  await prisma.user.update({
    where: { email },
    data: { resetToken, resetTokenExpiration: new Date(Date.now() + 3600000) }, // 1 hour expiration
  });

  const longResetLink = `${process.env.USER_URL}/reset-password?token=${resetToken}`;
    let shortResetLink = longResetLink;
  
    try {
      const result = await bitly.shorten(longResetLink);
      shortResetLink = result.link;
    } catch (err) {
      console.warn("Bitly shortening failed. Sending long URL instead.");
    }
  
    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.EMAIL_USER,
        pass: process.env.EMAIL_PASS,
      },
    });
  
    const mailOptions = {
      from: process.env.EMAIL_USER,
      to: email,
      subject: "Password Reset Request",
      text: `Click on the link to reset your password: ${shortResetLink}`,
    };
  
  try {
    await transporter.sendMail(mailOptions);
    res
      .status(200)
      .json({ status: true, message: "Password reset email sent" });
  } catch (error) {
    console.error("Error sending email:", error);
    res.status(500).json({ status: false, message: "Error sending email" });
  }
}

export async function resetPassword(req: Request, res: Response): Promise<any> {
  const { token, newPassword } = req.body;

  const user = await prisma.user.findUnique({
    where: { resetToken: token },
  });

  console.log("User found:", user);

  if (!user) {
    return res
      .status(400)
      .json({ status: false, message: "Invalid or expired token" });
  }

  const isTokenExpired =
    user.resetTokenExpiration && user.resetTokenExpiration < new Date();
  if (isTokenExpired) {
    return res
      .status(400)
      .json({ status: false, message: "Token has expired" });
  }

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { resetToken: token },
    data: {
      password: hashedPassword,
      resetToken: null,
      resetTokenExpiration: null,
    },
  });

  res
    .status(200)
    .json({ status: true, message: "Password updated successfully" });
}

export async function logoutUser(req: Request, res: Response) {
  try {
    const isLocal = process.env.NODE_ENV !== "production";
    res.clearCookie("token", {
      httpOnly: true,
      secure: !isLocal,
      sameSite: "strict",
    });

    res.status(200).json({ status: true, message: "Logout successful" });
  } catch (error: any) {
    res
      .status(500)
      .json({ status: false, message: error.message || "Server error" });
  }
}

export async function changePassword(
  req: Request,
  res: Response,
): Promise<any> {
  try {
    if (!req.user) {
      return res
        .status(401)
        .json({ status: false, message: "Unauthorized: No user ID found" });
    }

    const { oldPassword, newPassword } = req.body;
    const userId = req.user as string;

    const user = await prisma.user.findUnique({ where: { id: userId } });

    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    const isOldPasswordValid = await bcrypt.compare(oldPassword, user.password);
    if (!isOldPasswordValid) {
      return res
        .status(400)
        .json({ status: false, message: "Incorrect old password" });
    }

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: userId },
      data: { password: hashedPassword },
    });

    return res
      .status(200)
      .json({ status: true, message: "Password changed successfully" });
  } catch (err: any) {
    console.error("Error changing password:", err);
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
}

export async function bookTurf(req: Request, res: Response): Promise<any> {
  try {
    const userId = req.user.id;
    const { turfId, numberOfSeats, bookedFrom, bookedTo, day } = req.body;
    const bookedFromTime = bookedFrom.split("T")[1]?.substring(0, 5); // Extract "HH:MM"
    const bookedToTime = bookedTo.split("T")[1]?.substring(0, 5); // Extract "HH:MM"

    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      return res.status(404).json({ status: false, message: "User not found" });
    }

    // Updated: Find Turf instead of TurfOwner
    const turf = await prisma.turf.findUnique({
      where: { id: turfId },
      include: { owner: true }, // Include owner details
    });

    if (!turf) {
      return res.status(404).json({ status: false, message: "Turf not found" });
    }

    let availabilitySlots = (turf.availabilitySlots as any[]) || [];
    const dayAvailabilityIndex = availabilitySlots.findIndex(
      (slot: any) => slot.day === day,
    );

    if (dayAvailabilityIndex === -1) {
      return res.status(400).json({
        status: "false",
        message: "Turf at this day is not available",
      });
    }

    const dayAvailability = availabilitySlots[dayAvailabilityIndex];
    const slotAvailability = dayAvailability.slots.some((slot: any) => {
      return (
        bookedFromTime >= slot.start &&
        bookedToTime <= slot.end &&
        slot.availableSeats >= numberOfSeats
      );
    });

    if (!slotAvailability) {
      return res.status(400).json({
        status: "false",
        message: "Turf at this slot is not available",
      });
    }

    if (turf.availableSeats < numberOfSeats) {
      return res
        .status(404)
        .json({ status: false, message: "Not enough seats available" });
    }

    // Calculate booking dates
    const selectedDate = new Date();
    const dayOfWeek = [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ];

    const targetDayIndex = dayOfWeek.indexOf(day);
    const todayIndex = selectedDate.getDay();
    const daysToAdd =
      targetDayIndex >= todayIndex
        ? targetDayIndex - todayIndex
        : 7 - todayIndex + targetDayIndex;

    selectedDate.setDate(selectedDate.getDate() + daysToAdd);

    const bookedFromDateTime = new Date(
      `${selectedDate.toISOString().split("T")[0]}T${bookedFrom}:00Z`,
    );

    const bookedToDateTime = new Date(
      `${selectedDate.toISOString().split("T")[0]}T${bookedTo}:00Z`,
    );

    // Create booking but REMOVED: Do not decrease slots/seats here
    const booking = await prisma.booking.create({
      data: {
        userId,
        turfId,
        numberOfSeats: parseInt(numberOfSeats),
        day,
        bookedFrom: bookedFromDateTime,
        bookedTo: bookedToDateTime,
        status: "PENDING",
      },
    });

    // REMOVED: The update to decrease availability - now happens in payment verification

    return res.status(201).json({
      status: true,
      message: "Turf booking created, waiting for payment confirmation",
      data: booking,
    });
  } catch (err: any) {
    console.error("Error booking turf ", err);
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
}

export const bookRental = async (
  req: Request,
  res: Response,
): Promise<void> => {
  try {
    const { amenityId, bookedFrom, bookedTo, quantity } = req.body;

    if (!req.user?.id) {
      res.status(401).json({ error: "User authentication required." });
      return;
    }

    const fromDate = new Date(bookedFrom);
    const toDate = new Date(bookedTo);

    if (fromDate >= toDate) {
      res.status(400).json({ error: "Invalid booking dates." });
      return;
    }

    const amenity = await prisma.sportsAmenity.findUnique({
      where: { id: amenityId },
    });

    if (!amenity) {
      res.status(404).json({ error: "Amenity not found." });
      return;
    }

    if (quantity > amenity.quantity) {
      res.status(400).json({ error: "Not enough quantity available." });
      return;
    }

    const hours = (toDate.getTime() - fromDate.getTime()) / (1000 * 60 * 60);
    const totalPrice = hours * amenity.pricePerHour * quantity;

    const newBooking = await prisma.sportsAmenityBooking.create({
      data: {
        userId: req.user.id,
        amenityId,
        bookedFrom: fromDate,
        bookedTo: toDate,
        quantity,
        totalPrice,
        status: "PENDING",
      },
    });
    await prisma.sportsAmenity.update({
      where: { id: amenityId },
      data: {
        quantity: {
          decrement: quantity,
        },
      },
    });

    res.status(201).json(newBooking);
  } catch (error) {
    res.status(500).json({ error: "Failed to book rental", details: error });
  }
};

export async function getBookings(req: Request, res: Response): Promise<any> {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      include: { bookings: true },
    });
    if (!user) {
      return res
        .status(404)
        .json({ status: false, message: "User not found. Please Login first" });
    }
    const now = new Date();
    const pastBookings = user.bookings
      .filter((b) => new Date(b.bookedTo) < now)
      .sort(
        (a, b) =>
          new Date(b.bookedTo).getTime() - new Date(a.bookedTo).getTime(),
      );
    const upcomingBookings = user.bookings
      .filter((b) => new Date(b.bookedFrom) >= now)
      .sort(
        (a, b) =>
          new Date(a.bookedFrom).getTime() - new Date(b.bookedFrom).getTime(),
      );
    return res.status(200).json({
      status: true,
      pastBookings,
      upcomingBookings,
    });
  } catch (err: any) {
    res
      .status(500)
      .json({ status: false, message: err.message || "Server error" });
  }
}

export async function getUserProfile(
  req: Request,
  res: Response,
): Promise<any> {
  try {
    console.log("User from request:", req.user);

    const user = await prisma.user.findUnique({
      where: { id: req.user.id },
      select: {
        id: true,
        name: true,
        email: true,
        dob: true,
        gender: true,
        city: true,
        profilePhoto: true,
        gamePreferences: true,
        bookings: {
          select: { id: true, bookedFrom: true, bookedTo: true, status: true },
        },
        amenityBookings: {
          select: {
            id: true,
            bookedFrom: true,
            bookedTo: true,
            status: true,
            amenity: { select: { name: true } }, // Amenity details
          },
        },
        ownedAmenities: {
          select: {
            id: true,
            name: true,
            quantity: true,
            pricePerHour: true,
            description: true,
            category: true,
            isAvailable: true,
            photos: true,
          },
        },
        reviews: {
          select: { id: true, rating: true, comment: true, createdAt: true },
        },
      },
    });

    if (!user) {
      return res
        .status(404)
        .json({ status: false, message: "User not found. Please login first" });
    }
    return res.status(200).json({
      status: true,
      message: "User profile retrieved successfully",
      user,
    });
  } catch (err: any) {
    res
      .status(500)
      .json({ status: false, message: err.message || "Server error" });
  }
}

export async function getOtherUserProfile(
  req: Request,
  res: Response,
): Promise<any> {
  try {
    const user = await prisma.user.findUnique({ where: { id: req.user.id } });
    if (!user) {
      return res
        .status(404)
        .json({ status: false, message: "User not found. Please login first" });
    }
    const userToGetId = req.params.userId;
    const userToGet = await prisma.user.findUnique({
      where: { id: userToGetId },
      select: {
        name: true,
        dob: true,
        gender: true,
        city: true,
        gamePreferences: true,
        profilePhoto: true,
        bookings: { select: { id: true } },
        amenityBookings: { select: { id: true } },
        reviews: { select: { rating: true } },
      },
    });
    return res.status(200).json({
      status: true,
      message: "Other User successfully retrieved",
      userToGet,
    });
  } catch (err: any) {
    res
      .status(500)
      .json({ status: false, message: err.message || "Server error" });
  }
}

export const googleAuth = passport.authenticate("google", {
  scope: ["profile", "email"],
});

export const googleCallback = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  passport.authenticate("google", { session: false }, async (err, user) => {
    if (err || !user) return res.redirect("/login?error=google_auth_failed");

    // Issue JWT
    const token = jwt.sign({ id: user.id }, process.env.JWT_SECRET as string, {
      expiresIn: "1h",
    });

    // Optionally update lastLogin
    await prisma.user.update({
      where: { id: user.id },
      data: {},
    });

    // Redirect to frontend with token (or set cookie)
    res.redirect(`${process.env.CLIENT_URL}/auth/success?token=${token}`);
  })(req, res, next);
};
