import { redirect } from "next/navigation";

import { logger } from "@/lib/logger";

/**
 * Turns Auth.js's error redirect into something a user can act on.
 *
 * WHY THIS FILE EXISTS
 * When authorize() throws -- a database outage, a bad AUTH_SECRET, any provider
 * misconfiguration -- Auth.js redirects the browser to /api/auth/error. Its
 * built-in page for that is disabled once `pages` is customised, so the request
 * falls through to the [...nextauth] catch-all, which reports
 * "UnknownAction: Cannot handle action: error" and returns a 500.
 *
 * The user sees a blank "A server error occurred" page. Found in production
 * with no database configured, but it fires identically for a transient
 * database blip -- i.e. exactly when a legible error matters most.
 *
 * Setting `pages.error` in the auth config does NOT fix it: Auth.js still
 * redirects here first. A route file is the reliable interception point, and a
 * specific segment takes precedence over the catch-all sibling.
 */

/**
 * Only Auth.js's own error codes are passed through.
 *
 * `error` arrives in a query string, so it is attacker-controlled. Reflecting it
 * into the next URL unchecked would let anyone craft a link that puts arbitrary
 * text in front of a user on our login page -- a small but real phishing
 * primitive ("Your account was suspended, email attacker@..."). Anything
 * unrecognised collapses to a generic code.
 */
const KNOWN_CODES = new Set([
  "Configuration",
  "AccessDenied",
  "Verification",
  "CredentialsSignin",
  "Default",
]);

export async function GET(request: Request) {
  const raw = new URL(request.url).searchParams.get("error");
  const code = raw && KNOWN_CODES.has(raw) ? raw : "Default";

  // The detail belongs in logs, not in the response: which component failed is
  // useful to us and reconnaissance to everyone else.
  logger.warn("auth error redirect", {
    route: "/api/auth/error",
    code,
    // Recorded so an unexpected code shows up in logs rather than vanishing
    // silently into the Default bucket.
    ...(raw && raw !== code ? { unrecognisedCode: raw.slice(0, 40) } : {}),
  });

  redirect(`/login?error=${code}`);
}
