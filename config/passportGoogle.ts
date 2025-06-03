import passport from "passport";
import { Strategy as GoogleStrategy, Profile, VerifyCallback } from "passport-google-oauth20";
import { PrismaClient } from "@prisma/client";
import { googleAuthConfig } from "./googleOAuth.js";

const prisma = new PrismaClient();

passport.use(
  new GoogleStrategy(
    googleAuthConfig,
    async (
      accessToken: string,
      refreshToken: string,
      profile: Profile,
      done: VerifyCallback
    ) => {
      try {
        const email = profile.emails?.[0]?.value;
        if (!email) return done(new Error("No email from Google"), undefined);

        let user = await prisma.user.findUnique({ where: { email } });
        if (!user) {
          user = await prisma.user.create({
            data: {
              name: profile.displayName || "Google User",
              email,
              password: "", // No password for Google users
              isEmailVerified: true,
              profilePhoto: profile.photos?.[0]?.value,
            },
          });
        }
        return done(null, user);
      } catch (err) {
        return done(err as Error, undefined);
      }
    }
  )
);

export default passport;