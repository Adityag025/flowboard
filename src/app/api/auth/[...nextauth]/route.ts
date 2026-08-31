/**
 * Auth.js needs real HTTP endpoints for the sign-in/sign-out/session
 * round-trips it performs internally. This one file serves all of them via
 * the [...nextauth] catch-all segment -- /api/auth/session, /api/auth/callback
 * /credentials, /api/auth/csrf, and so on.
 *
 * We never call these by hand; the `signIn` / `signOut` helpers do.
 */
export { GET, POST } from "@/lib/auth/handlers";
