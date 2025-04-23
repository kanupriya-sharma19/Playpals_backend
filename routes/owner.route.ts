import { Router } from "express";
import { uploadSingle, uploadFields } from "../middlewares/multer.js";
import { authenticateOwner } from "../middlewares/jwt.js";
import {
  signupOwner,
  loginOwner,
  logoutOwner,
  getOwnerProfile,
  updateOwnerProfile,
  resetPassword,
  generateResetLink,
  changePassword,
  getAllOwners,
} from "../controllers/owner.controller.js";

const ownerRoute = Router();

// Public routes
ownerRoute.post("/signup", uploadSingle, signupOwner);
ownerRoute.post("/login", loginOwner);
ownerRoute.post("/logout", logoutOwner);
ownerRoute.get("/all", getAllOwners);
ownerRoute.post("/reset-password", resetPassword);
ownerRoute.post("/resetLink", generateResetLink);

// Protected routes
ownerRoute.get("/profile", authenticateOwner, getOwnerProfile);
ownerRoute.put(
  "/update-profile",
  authenticateOwner,
  uploadFields,
  updateOwnerProfile,
);
ownerRoute.post("/change-password", authenticateOwner, changePassword);

export default ownerRoute;
