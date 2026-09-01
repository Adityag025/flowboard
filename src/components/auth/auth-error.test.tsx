import { describe, expect, it } from "vitest";

import { AuthError } from "./auth-error";

/**
 * These assert on the rendered element tree directly rather than mounting into a
 * DOM: the component is a pure function of its prop, so a renderer would add a
 * dependency without adding coverage.
 *
 * What matters here is WHICH message each code gets, because the distinctions
 * are deliberate:
 *   - Configuration must not blame the user for our outage.
 *   - Configuration must not name the failing component either.
 *   - CredentialsSignin must read identically to the inline path, or the two
 *     become an account-enumeration oracle.
 */
function textOf(element: ReturnType<typeof AuthError>): string {
  if (!element) return "";
  const props = element.props as { children?: unknown };
  return String(props.children ?? "");
}

describe("AuthError", () => {
  it("renders nothing without a code, so a clean login page has no banner", () => {
    expect(AuthError({ code: undefined })).toBeNull();
    expect(AuthError({ code: "" })).toBeNull();
  });

  it("blames the server, not the user, for a Configuration failure", () => {
    const text = textOf(AuthError({ code: "Configuration" }));
    expect(text).toMatch(/temporarily unavailable/i);
    expect(text).toMatch(/on our side/i);
    // Must NOT tell the user their credentials were wrong -- they would retype a
    // correct password until they concluded they had forgotten it.
    expect(text).not.toMatch(/invalid/i);
    expect(text).not.toMatch(/password/i);
  });

  it("does not leak which component failed", () => {
    const text = textOf(AuthError({ code: "Configuration" }));
    for (const leak of ["database", "postgres", "prisma", "redis", "connection", "DATABASE_URL"]) {
      expect(text.toLowerCase()).not.toContain(leak.toLowerCase());
    }
  });

  it("gives CredentialsSignin the same wording as the inline path", () => {
    // login-form.tsx renders "Invalid email or password" for a failed sign-in.
    // If these two diverged, comparing them would reveal whether an account
    // exists.
    expect(textOf(AuthError({ code: "CredentialsSignin" }))).toBe(
      "Invalid email or password.",
    );
  });

  it("falls back for an unknown code instead of rendering it", () => {
    const text = textOf(AuthError({ code: "SomeNewAuthjsCode" }));
    expect(text).toMatch(/something went wrong/i);
    // The raw code must never be echoed into the page.
    expect(text).not.toContain("SomeNewAuthjsCode");
  });

  it("never reflects attacker-supplied text", () => {
    const hostile = "Your account is suspended, email attacker@evil.example";
    const text = textOf(AuthError({ code: hostile }));
    expect(text).not.toContain("attacker@evil.example");
    expect(text).toMatch(/something went wrong/i);
  });

  it("marks the message as an alert for assistive tech", () => {
    const element = AuthError({ code: "Configuration" });
    expect((element!.props as { role?: string }).role).toBe("alert");
  });
});
