import { Request } from "express";

declare module "express-serve-static-core" {
  interface Request {
    user?: any; // Or a more specific type for your user object
    turf?: any;
    owner?: any;
  }
}
