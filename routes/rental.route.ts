import { Router } from "express";
import { authenticateUser, authenticateOwner } from "../middlewares/jwt.js";
import { uploadFields } from "../middlewares/multer.js";

import {
  createRental,
  getAllRentals,
  getRentalById,
  updateRental,
  deleteRental,
} from "../controllers/rental.controllers.js";

const rentalRoute = Router();
rentalRoute.post(
  "/",
  [authenticateUser, authenticateOwner],
  uploadFields,
  createRental,
);

rentalRoute.get("/", getAllRentals);

rentalRoute.get("/:id", getRentalById);

rentalRoute.put("/:id", [authenticateUser, authenticateOwner], updateRental);

rentalRoute.delete("/:id", [authenticateUser, authenticateOwner], deleteRental);

export default rentalRoute;
