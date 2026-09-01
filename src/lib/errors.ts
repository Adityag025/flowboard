import { Prisma } from "@/generated/prisma/client";

import { logger } from "@/lib/logger";

/**
 * Turns an unexpected server error into something safe to show a user.
 *
 * WHY THIS EXISTS
 * A Server Action that throws returns a 500, and the client sees an opaque
 * failure -- in React's case a minified error with no useful text. Every action
 * that touches the database therefore needs a terminal catch, or an
 * infrastructure problem becomes an unexplained dead end for the user.
 *
 * TWO CATEGORIES, and the distinction is the point:
 *
 *   UNAVAILABLE -- the datastore is unreachable. OUR problem. The message must
 *                  say so, because a message implying user error ("invalid
 *                  password", "please check your details") makes people retype
 *                  correct information until they give up.
 *   UNEXPECTED  -- a genuine bug. Generic message, full detail to the logs.
 *
 * Neither message names a component. "The database is unreachable" is useful to
 * us and reconnaissance to everyone else; that goes to the logger.
 */

/** Prisma codes that mean "could not reach or talk to the database". */
const CONNECTIVITY_CODES = new Set([
  "P1000", // authentication failed against the database
  "P1001", // can't reach database server
  "P1002", // database server timed out
  "P1008", // operation timed out
  "P1017", // server has closed the connection
]);

/** Raw driver failures, which the adapter can surface before Prisma classifies them. */
const CONNECTIVITY_PATTERNS =
  /ECONNREFUSED|ENOTFOUND|ETIMEDOUT|EAI_AGAIN|connection.*(refused|closed|terminated)|could not connect|Can't reach database/i;

export function isDatastoreUnavailable(error: unknown): boolean {
  // Thrown when the client cannot establish a connection at all -- the exact
  // shape when DATABASE_URL is missing or points nowhere.
  if (error instanceof Prisma.PrismaClientInitializationError) return true;

  if (
    error instanceof Prisma.PrismaClientKnownRequestError &&
    CONNECTIVITY_CODES.has(error.code)
  ) {
    return true;
  }

  // PrismaClientUnknownRequestError and raw adapter errors carry the driver's
  // message rather than a code, so fall back to matching it.
  if (error instanceof Error && CONNECTIVITY_PATTERNS.test(error.message)) {
    return true;
  }

  return false;
}

export const UNAVAILABLE_MESSAGE =
  "This service is temporarily unavailable. It's a problem on our side, not with your details — please try again shortly.";

export const UNEXPECTED_MESSAGE =
  "Something went wrong. Please try again.";

/**
 * Logs the real error and returns a message safe to render.
 *
 * `context` should identify the action, so a spike in the logs points at a
 * specific code path rather than just "an error happened somewhere".
 */
export function toUserMessage(
  error: unknown,
  context: { action: string; [key: string]: string | number | boolean | undefined },
): string {
  if (isDatastoreUnavailable(error)) {
    // warn, not error: the app is behaving correctly in the face of a broken
    // dependency. Alerting on this points at infrastructure, not at a bug.
    logger.warn("datastore unavailable", { ...context, kind: "unavailable" });
    return UNAVAILABLE_MESSAGE;
  }

  // A real bug. Full detail, including the stack outside production.
  logger.error("unexpected action failure", error, { ...context, kind: "unexpected" });
  return UNEXPECTED_MESSAGE;
}
