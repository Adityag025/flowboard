import { describe, expect, it } from "vitest";

import { Prisma } from "@/generated/prisma/client";

import {
  UNAVAILABLE_MESSAGE,
  UNEXPECTED_MESSAGE,
  isDatastoreUnavailable,
  toUserMessage,
} from "./errors";

/**
 * The classification here decides what a user is told when something breaks, and
 * getting it backwards has real cost:
 *
 *   An outage reported as user error  -> people retype correct credentials until
 *                                        they conclude they are locked out.
 *   A bug reported as an outage       -> nobody investigates; it looks like
 *                                        infrastructure and gets waited out.
 */
describe("isDatastoreUnavailable", () => {
  it("recognises a client that could not initialise", () => {
    // The exact shape when DATABASE_URL is missing or points nowhere -- the
    // production failure that started this.
    const error = new Prisma.PrismaClientInitializationError(
      "Can't reach database server",
      "7.10.0",
    );
    expect(isDatastoreUnavailable(error)).toBe(true);
  });

  it.each(["P1000", "P1001", "P1002", "P1008", "P1017"])(
    "recognises connectivity code %s",
    (code) => {
      const error = new Prisma.PrismaClientKnownRequestError("nope", {
        code,
        clientVersion: "7.10.0",
      });
      expect(isDatastoreUnavailable(error)).toBe(true);
    },
  );

  it("does NOT treat a unique-constraint violation as unavailability", () => {
    // P2002 is a legitimate business outcome ("that email is taken"), not an
    // outage. Misclassifying it would replace a precise field error with a
    // vague "try again later".
    const error = new Prisma.PrismaClientKnownRequestError("duplicate", {
      code: "P2002",
      clientVersion: "7.10.0",
      meta: { target: ["email"] },
    });
    expect(isDatastoreUnavailable(error)).toBe(false);
  });

  it.each([
    "connect ECONNREFUSED 127.0.0.1:5434",
    "getaddrinfo ENOTFOUND db.example.com",
    "connect ETIMEDOUT",
    "Connection terminated unexpectedly",
    "Can't reach database server at localhost:5434",
  ])("recognises raw driver failure: %s", (message) => {
    // The adapter can surface the driver's error before Prisma classifies it,
    // so there is no code to match on -- only the message.
    expect(isDatastoreUnavailable(new Error(message))).toBe(true);
  });

  it("does not misclassify an ordinary application error", () => {
    expect(isDatastoreUnavailable(new Error("Cannot read properties of undefined"))).toBe(false);
    expect(isDatastoreUnavailable(new TypeError("x is not a function"))).toBe(false);
  });

  it("handles non-Error throwables without crashing", () => {
    for (const thrown of [null, undefined, "a string", 42, { weird: true }]) {
      expect(() => isDatastoreUnavailable(thrown)).not.toThrow();
      expect(isDatastoreUnavailable(thrown)).toBe(false);
    }
  });
});

describe("toUserMessage", () => {
  it("blames the server for an outage, and says so explicitly", () => {
    const message = toUserMessage(
      new Prisma.PrismaClientInitializationError("down", "7.10.0"),
      { action: "signUpAction" },
    );
    expect(message).toBe(UNAVAILABLE_MESSAGE);
    expect(message).toMatch(/on our side/i);
    expect(message).toMatch(/not with your details/i);
  });

  it("gives a generic message for a genuine bug", () => {
    expect(toUserMessage(new TypeError("boom"), { action: "x" })).toBe(UNEXPECTED_MESSAGE);
  });

  it("never leaks the failing component to the user", () => {
    const messages = [
      toUserMessage(new Prisma.PrismaClientInitializationError("down", "7.10.0"), { action: "x" }),
      toUserMessage(new Error("connect ECONNREFUSED 127.0.0.1:5434"), { action: "x" }),
      toUserMessage(new TypeError("prisma.user.findUnique is not a function"), { action: "x" }),
    ];

    for (const message of messages) {
      for (const leak of ["prisma", "postgres", "database", "ECONNREFUSED", "5434", "127.0.0.1"]) {
        expect(message.toLowerCase(), `leaked "${leak}"`).not.toContain(leak.toLowerCase());
      }
    }
  });

  it("never implies the user's input was wrong during an outage", () => {
    const message = toUserMessage(new Error("ECONNREFUSED"), { action: "x" });
    for (const blame of ["invalid", "incorrect", "check your", "password"]) {
      expect(message.toLowerCase()).not.toContain(blame);
    }
  });
});
