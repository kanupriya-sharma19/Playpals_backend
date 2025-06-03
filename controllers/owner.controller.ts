import { Prisma, TurfOwnerType } from "@prisma/client";
import { PrismaClient } from "@prisma/client";
import { Request, Response, NextFunction } from "express";
import bcrypt from "bcryptjs";
import jwt from "jsonwebtoken";
import { any, z } from "zod";
import nodemailer from "nodemailer";
import crypto from "crypto";
import { BitlyClient } from 'bitly';

const prisma = new PrismaClient();
const bitly = new BitlyClient(process.env.BITLY_ACCESS_TOKEN as string);

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
      }),
    ),
  }),
);

export async function signupOwner(req: Request, res: Response): Promise<void> {
  try {
    const {
      name,
      email,
      password,
      phoneNumber,
      ownerType,
      organizationName,
      registrationNumber,
      contactPersonName,
      contactPersonPhone,
    } = req.body;

    if (!Object.values(TurfOwnerType).includes(ownerType)) {
      res.status(400).json({
        status: false,
        message:
          "Invalid owner type. Must be either 'INDIVIDUAL' or 'ORGANIZATION'.",
      });
      return;
    }

    const existingOwner = await prisma.owner.findUnique({
      where: { email },
    });

    if (existingOwner) {
      res.status(400).json({
        status: false,
        message: "Owner already exists. Please Login",
      });
      return;
    }

    const hashedPassword = await bcrypt.hash(password, 10);
    const owner = await prisma.owner.create({
      data: {
        name: ownerType === "INDIVIDUAL" ? name : null,
        email,
        password: hashedPassword,
        phoneNumber,
        ownerType: ownerType as TurfOwnerType,
        organizationName:
          ownerType === "ORGANIZATION" ? organizationName : null,
        registrationNumber:
          ownerType === "ORGANIZATION" ? registrationNumber : null,
        contactPersonName:
          ownerType === "ORGANIZATION" ? contactPersonName : null,
        contactPersonPhone:
          ownerType === "ORGANIZATION" ? contactPersonPhone : null,
      },
    });

    const token = jwt.sign({ id: owner.id }, process.env.JWT_SECRET as string, {
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
      message: "Owner successfully signed up",
      data: { owner, token },
    });
  } catch (err: any) {
    console.error("Error signing up Owner:", err);
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
}

export async function getAllOwners(req: Request, res: Response): Promise<any> {
  try {
    const owners = await prisma.owner.findMany({
      include: {
        turfs: {
          where: { available: true },
        },
      },
      orderBy: {
        name: "asc",
      },
    });

    res.status(200).json(owners);
  } catch (err) {
    res.status(500).json({ message: "Error fetching owners", error: err });
  }
}

export async function updateOwnerProfile(
  req: Request,
  res: Response,
): Promise<void> {
  try {
    const ownerId = req.owner.id;
    const {
      name,
      phoneNumber,
      organizationName,
      registrationNumber,
      contactPersonName,
      contactPersonPhone,
    } = req.body;

    const profilePhoto =
      req.files && "profilePhoto" in req.files
        ? (req.files["profilePhoto"] as Express.Multer.File[])[0].path
        : undefined;

    const updatedOwner = await prisma.owner.update({
      where: { id: ownerId },
      data: {
        name,
        phoneNumber,
        organizationName,
        registrationNumber,
        contactPersonName,
        contactPersonPhone,
        ...(profilePhoto && { profilePhoto }),
      },
    });

    res.status(200).json({
      status: true,
      message: "Owner profile updated successfully",
      data: updatedOwner,
    });
  } catch (err: any) {
    console.error("Error updating owner profile", err);
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
}

export async function loginOwner(req: Request, res: Response): Promise<void> {
  try {
    const { email, password } = req.body;
    const owner = await prisma.owner.findUnique({ where: { email } });
    if (!owner) {
      res.status(401).json({ status: false, message: "Invalid credentials" });
      return;
    }

    const isMatch = await bcrypt.compare(password, owner.password);
    if (!isMatch) {
      res.status(401).json({ status: false, message: "Invalid credentials" });
      return;
    }

    const token = jwt.sign({ id: owner.id }, process.env.JWT_SECRET as string, {
      expiresIn: "1h",
    });

    res.cookie("token", token, {
      httpOnly: true,
      secure: true,
      sameSite: "strict",
      maxAge: 3600000,
    });

    res.status(200).json({
      status: true,
      message: "Login successful",
      data: { owner, token },
    });
  } catch (err: any) {
    console.error("Error login ", err);
    res.status(500).json({
      status: false,
      message: "Internal Server Error",
      error: err.message,
    });
  }
}

export async function logoutOwner(req: Request, res: Response): Promise<any> {
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

export async function getAvailableSlots(
  req: Request,
  res: Response,
): Promise<any> {
  try {
    // Get all turfs owned by this owner
    const turfs = await prisma.turf.findMany({
      where: { ownerId: req.owner.id },
      select: {
        id: true,
        turfName: true,
        availabilitySlots: true,
      },
    });

    if (!turfs.length) {
      return res
        .status(404)
        .json({ status: false, message: "No turfs found for this owner" });
    }

    // Return availability slots for all turfs
    return res.status(200).json({
      status: true,
      message: "Availability slots successfully retrieved",
      turfs: turfs.map((turf) => ({
        id: turf.id,
        turfName: turf.turfName,
        availabilitySlots: turf.availabilitySlots,
      })),
    });
  } catch (err: any) {
    res
      .status(500)
      .json({ status: false, message: err.message || "Server error" });
  }
}

export async function getBookings(req: Request, res: Response): Promise<any> {
  try {
    const turfs = await prisma.turf.findMany({
      where: { ownerId: req.owner.id },
      include: {
        bookings: {
          include: {
            user: {
              select: {
                name: true,
                email: true,
                phoneNumber: true,
              },
            },
          },
        },
      },
    });

    if (!turfs.length) {
      return res
        .status(404)
        .json({ status: false, message: "No turfs found for this owner" });
    }

    const now = new Date();

    // Process bookings for all turfs
    const allBookings = turfs.flatMap((turf) =>
      turf.bookings.map((booking) => ({
        ...booking,
        turfName: turf.turfName,
        turfId: turf.id,
      })),
    );

    const pastBookings = allBookings
      .filter((b) => new Date(b.bookedTo) < now)
      .sort(
        (a, b) =>
          new Date(b.bookedTo).getTime() - new Date(a.bookedTo).getTime(),
      );

    const upcomingBookings = allBookings
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

export const getTurfReviews = async (req: Request, res: Response) => {
  const { turfId } = req.owner.id;

  try {
    const reviews = await prisma.review.findMany({
      where: { turfId },
      include: { user: { select: { name: true, profilePhoto: true } } },
    });

    res.json(reviews);
  } catch (error) {
    res.status(500).json({ error: "Failed to fetch reviews" });
  }
};

export async function generateResetLink(
  req: Request,
  res: Response,
): Promise<any> {
  const { email } = req.body;
  const turfOwner = await prisma.owner.findUnique({ where: { email } });
  if (!turfOwner) {
    return res.status(404).json({ status: false, message: "User not found" });
  }
  const resetToken = crypto.randomBytes(32).toString("hex");
  await prisma.owner.update({
    where: { email },
    data: { resetToken, resetTokenExpiration: new Date(Date.now() + 3600000) }, // 1 hour expiration
  });
 const longResetLink = `${process.env.TURF_URL}/reset-password?token=${resetToken}`;
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
  const { newPassword } = req.body;
  if (!newPassword) {
    return res.status(400).json({ message: "New password is required" });
  }
  const token = req.query.token as string;
  const user = await prisma.owner.findUnique({
    where: { resetToken: token },
  });

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
  await prisma.owner.update({
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
export async function changePassword(req: Request, res: Response): Promise<any> {
  try {
    if (!req.owner) {
      return res
        .status(401)
        .json({ status: false, message: "Unauthorized: No user ID found" });
    }

    const { oldPassword, newPassword } = req.body;
    const userId = req.owner.id;  // Use req.owner.id to get the user's ID

    const user = await prisma.owner.findUnique({ where: { id: userId } });

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
    await prisma.owner.update({
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


export async function getOwnerProfile(
  req: Request,
  res: Response,
): Promise<any> {
  try {
    const owner = await prisma.owner.findUnique({
      where: { id: req.owner.id },
      include: { turfs: true },
    });

    if (!owner) {
      return res.status(404).json({
        status: false,
        message: "Owner not found. Please login first",
      });
    }

    return res.status(200).json({
      status: true,
      message: "Owner profile retrieved successfully",
      owner,
    });
  } catch (err: any) {
    res
      .status(500)
      .json({ status: false, message: err.message || "Server error" });
  }
}
