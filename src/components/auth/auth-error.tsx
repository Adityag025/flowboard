/**
 * Renders the ?error=<code> that Auth.js appends when it redirects a failure to
 * our error page.
 *
 * The distinction that matters here: a CONFIGURATION failure is OUR fault, and
 * saying "invalid email or password" would blame the user for our outage --
 * they would retype a correct password repeatedly and conclude they had
 * forgotten it. But the message must also not leak which component broke;
 * "the database is unreachable" tells an attacker about our infrastructure.
 *
 * So: honest about whose problem it is, silent about the mechanism. The
 * mechanism goes to the logs.
 */
const MESSAGES: Record<string, string> = {
  // Thrown when a provider or the server setup is broken -- including the
  // database being unreachable inside authorize().
  Configuration: "Sign-in is temporarily unavailable. This is a problem on our side, not with your details. Please try again shortly.",
  AccessDenied: "You do not have access to this application.",
  Verification: "That sign-in link has expired or was already used.",
  // Auth.js can route a bad credential here rather than returning it inline.
  // Same wording as the inline path, so the two cannot be distinguished -- which
  // is what stops this being an account-enumeration oracle.
  CredentialsSignin: "Invalid email or password.",
};

const FALLBACK = "Something went wrong signing you in. Please try again.";

export function AuthError({ code }: { code?: string }) {
  if (!code) return null;

  return (
    <p
      role="alert"
      className="rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-sm text-destructive"
    >
      {MESSAGES[code] ?? FALLBACK}
    </p>
  );
}
