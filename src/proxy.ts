import NextAuth from "next-auth";

import { authConfig } from "@/lib/auth/config";

/**
 * Route protection.
 *
 * This file used to be called middleware.ts. Next.js 16 renamed the convention
 * to `proxy.ts` -- identical behaviour, clearer name. Keeping the old filename
 * still works but logs a deprecation warning on every boot.
 *
 * Note the import: `authConfig`, NOT the full auth instance from @/lib/auth.
 * Proxy runs on the Edge runtime, which cannot load Prisma or bcrypt.
 * Importing the full setup here would break the build. This is the entire
 * reason the config is split across two files.
 *
 * Proxy is a GATE, not the security boundary. Next's own docs are blunt about
 * it: proxy "should not be used as a full session management or authorization
 * solution". It runs before the request reaches a page and is cheap, but it
 * only inspects the session cookie, and a matcher pattern is one typo away
 * from silently not covering a route. Every page and action that touches real
 * data checks `auth()` itself.
 */
const { auth } = NextAuth(authConfig);

/** Routes that require a signed-in user. */
const PROTECTED_PREFIXES = [
  "/dashboard",
  "/projects",
  "/issues",
  "/analytics",
  "/settings",
];

/** Routes that a signed-in user has no reason to see. */
const AUTH_ROUTES = ["/login", "/signup"];

export default auth((request) => {
  const { nextUrl } = request;
  const isSignedIn = Boolean(request.auth);
  const { pathname } = nextUrl;

  const isProtected = PROTECTED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
  const isAuthRoute = AUTH_ROUTES.includes(pathname);

  if (isProtected && !isSignedIn) {
    // Remember where they were headed so we can send them back after login.
    // Only the path -- never echo a full user-supplied URL into a redirect, or
    // the login page becomes an open redirect to any site an attacker names.
    const loginUrl = new URL("/login", nextUrl.origin);
    loginUrl.searchParams.set("next", pathname);
    return Response.redirect(loginUrl);
  }

  if (isAuthRoute && isSignedIn) {
    /**
     * Honour `next` when it is there.
     *
     * This branch used to send everyone to /dashboard unconditionally, which
     * silently threw away where they were going: follow a link to
     * /projects/FLOW while signed out, get bounced to /login?next=/projects/FLOW,
     * and then -- because the session was still valid -- land on the dashboard
     * instead of the page you asked for.
     *
     * Same open-redirect rule as the login action: only same-site absolute
     * paths, never a protocol-relative "//evil.com".
     */
    const requested = nextUrl.searchParams.get("next");
    const destination =
      requested && requested.startsWith("/") && !requested.startsWith("//")
        ? requested
        : "/dashboard";
    return Response.redirect(new URL(destination, nextUrl.origin));
  }

  return undefined;
});

export const config = {
  /**
   * Skip middleware for anything that is not a page navigation. Running auth
   * on every image and JS chunk is wasted work, and /api/auth/* MUST be
   * excluded or Auth.js's own endpoints get caught by our redirect logic.
   */
  matcher: [
    "/((?!api|_next/static|_next/image|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico)$).*)",
  ],
};
