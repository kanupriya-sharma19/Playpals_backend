import { Router } from "express";
import {
  signupUser,
  getUser,
  getUsers,
  updateProfile,
  loginUser,
  logoutUser,
  changePassword,
  resetPassword,
  generateResetLink,
  bookRental,
  bookTurf,
  getBookings,
  getOtherUserProfile,
  getUserProfile,
  googleAuth,
  googleCallback,
} from "../controllers/user.controller.js";
import { uploadSingle } from "../middlewares/multer.js";
import { authenticateUser } from "../middlewares/jwt.js";

const userRoute = Router();
userRoute.post("/signup", uploadSingle, signupUser);
userRoute.get("", getUsers);

userRoute.post("/login", loginUser);
userRoute.put("/update", authenticateUser, uploadSingle, updateProfile);
userRoute.post("/reset-password", resetPassword);
userRoute.post("/resetLink", generateResetLink);
userRoute.post("/change-password", authenticateUser, changePassword);
userRoute.post("/logout", logoutUser);
userRoute.get("/getOtherUser/:userId", authenticateUser, getOtherUserProfile);

userRoute.get("/profile", authenticateUser, getUserProfile);
userRoute.post("/bookTurf", authenticateUser, bookTurf);
userRoute.get("/getBookings", authenticateUser, getBookings); //Gives both upcoming and past

userRoute.post("/rent", authenticateUser, bookRental);
userRoute.get("/:userid", getUser);
userRoute.get("/auth/google", googleAuth);
userRoute.get("/auth/google/callback", googleCallback);

export default userRoute;
