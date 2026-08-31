import bcrypt from "bcryptjs";
import NextAuth from "next-auth";
import Credentials from "next-auth/providers/credentials";

import { db } from "@/lib/db";
import { signInSchema } from "@/lib/validations/auth";

import { authConfig } from "./config";

/**
 * A bcrypt hash of a value nobody can supply. See the timing note in
 * `authorize` below for why this exists.
 */
const DUMMY_HASH = "$2b$10$N9qo8uLOickgx2ZMRZoMyeIjZAgcfl7p92ldGxad68LJZdL17lhWy";

export const { handlers, auth, signIn, signOut } = NextAuth({
  ...authConfig,
  providers: [
    Credentials({
      credentials: {
        email: { label: "Email", type: "email" },
        password: { label: "Password", type: "password" },
      },

      /**
       * Returning a user object means "signed in". Returning null means
       * "rejected". Throwing means "something broke".
       *
       * Every rejection path returns exactly the same null, and takes roughly
       * the same amount of time. Both matter:
       *
       *   - A distinct "no such account" error would let an attacker harvest
       *     which email addresses are registered.
       *   - Returning early when the user does not exist would skip bcrypt,
       *     making the no-such-user path measurably FASTER. That timing
       *     difference leaks the same information the error message would.
       *     Hashing against DUMMY_HASH keeps both paths comparably slow.
       */
      async authorize(rawCredentials) {
        const parsed = signInSchema.safeParse(rawCredentials);
        if (!parsed.success) {
          return null;
        }

        const { email, password } = parsed.data;

        const user = await db.user.findUnique({
          where: { email },
          select: {
            id: true,
            name: true,
            email: true,
            image: true,
            passwordHash: true,
          },
        });

        const passwordMatches = await bcrypt.compare(
          password,
          user?.passwordHash ?? DUMMY_HASH,
        );

        if (!user || !user.passwordHash || !passwordMatches) {
          return null;
        }

        // Note what is NOT returned: passwordHash. Anything returned here ends
        // up in the session token, which the browser holds.
        return {
          id: user.id,
          name: user.name,
          email: user.email,
          image: user.image,
        };
      },
    }),
  ],
});
