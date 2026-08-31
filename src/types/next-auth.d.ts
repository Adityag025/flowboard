import type { DefaultSession } from "next-auth";

/**
 * Auth.js ships a generic Session type that has no `id` on the user, because
 * not every setup has one. We put the id there in the session callback, so we
 * widen the type to match reality -- otherwise every `session.user.id` read is
 * a type error and the temptation is to cast, which hides real mistakes.
 *
 * This file is types only. It emits no JavaScript.
 */
declare module "next-auth" {
  interface Session {
    user: {
      id: string;
    } & DefaultSession["user"];
  }
}

declare module "next-auth/jwt" {
  interface JWT {
    id?: string;
  }
}
