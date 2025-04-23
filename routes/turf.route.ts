import { Router } from "express";
import { uploadFields } from "../middlewares/multer.js";
import { authenticateOwner, authenticateUser } from "../middlewares/jwt.js";
import {
  registerTurf,
  updateTurfDetails,
  getTurfsByOwner,
  getTurfDetails,
  getAllTurfs,
  getTurfBookings,
  getTurfReviews,
} from "../controllers/turf.controller.js";

const turfRoute = Router();

// Turf registration/management (owner authenticated)
turfRoute.post("/register", authenticateOwner, uploadFields, registerTurf);
turfRoute.put("/:turfId", authenticateOwner, uploadFields, updateTurfDetails);
turfRoute.get("/my-turfs", authenticateOwner, getTurfsByOwner);
turfRoute.get("/bookings/:turfId", authenticateOwner, getTurfBookings);

// Public turf endpoints
turfRoute.get("/all", getAllTurfs);
turfRoute.get("/:turfId", getTurfDetails);
turfRoute.get("/reviews/:turfId", getTurfReviews);

export default turfRoute;
