import type { NextAuthConfig } from "next-auth";

/**
 * The EDGE-SAFE half of the Auth.js configuration.
 *
 * Why the config is split in two:
 *
 * Next.js middleware runs on the Edge runtime, which has no Node APIs -- no
 * filesystem, no native modules, no TCP sockets. Prisma needs all three. So if
 * middleware imported the full auth setup, the build would fail (or worse,
 * bloat the middleware bundle with a database client it cannot use).
 *
 * This file therefore contains only what middleware needs to answer "is this
 * request signed in?" -- session strategy, page routes, and token callbacks.
 * The Credentials provider, which touches bcrypt and the database, lives in
 * ./index.ts and is only ever imported from Node contexts.
 *
 * `providers: []` looks wrong but is correct: middleware only needs to READ
 * and verify the session cookie, never to issue one.
 */
export const authConfig = {
  // We are not on Vercel, and the dev port moves. Without this, Auth.js
  // rejects requests whose Host header it cannot verify.
  trustHost: true,

  // JWT, not database sessions -- this is forced on us, not chosen. Auth.js's
  // Credentials provider cannot use database sessions, because it deliberately
  // avoids persisting anything it did not create. The session lives entirely
  // in a signed, encrypted cookie.
  session: { strategy: "jwt" },

  pages: {
    signIn: "/login",

    /**
     * WITHOUT THIS, EVERY AUTH FAILURE IS AN OPAQUE 500.
     *
     * Auth.js redirects failures it cannot express inline to /api/auth/error.
     * Once `pages` is customised at all, its built-in error page is disabled --
     * so that route hits the catch-all handler, which reports
     * "UnknownAction: Cannot handle action: error" and returns a 500. The user
     * sees a blank "A server error occurred" page with no way forward.
     *
     * Found in production when the database was unreachable: authorize() threw,
     * Auth.js redirected to /api/auth/error, and that 500'd. The missing
     * database was the trigger, but this would fire the same way for a
     * transient database blip, a bad AUTH_SECRET, or any provider
     * misconfiguration -- i.e. exactly the moments you most need a legible
     * error.
     *
     * Pointing it back at /login means failures land on the form the user was
     * already using, with ?error=<code> for it to explain.
     */
    error: "/login",
  },

  callbacks: {
    /**
     * Runs whenever a token is created or updated. The default token carries
     * `sub`, `name`, `email` -- but not our own user id under a name we
     * control, so we copy it across on first sign-in (`user` is only present
     * then).
     */
    jwt({ token, user }) {
      if (user?.id) {
        token.id = user.id;
      }
      return token;
    },

    /**
     * Shapes what `auth()` returns to our components. Whatever we omit here
     * is simply not available to the app -- so never expose passwordHash.
     */
    session({ session, token }) {
      if (typeof token.id === "string") {
        session.user.id = token.id;
      }
      return session;
    },
  },

  providers: [],
} satisfies NextAuthConfig;
