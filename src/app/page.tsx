import { redirect } from "next/navigation";

import { auth } from "@/lib/auth";

/**
 * "/" is a router, not a page. Signed-in users go to their work; everyone else
 * goes to sign in. A marketing landing page can take this slot later.
 *
 * Calling auth() reads cookies, which makes this route dynamic -- it can never
 * be prerendered at build time, which is correct for a per-user decision.
 */
export default async function RootPage() {
  const session = await auth();
  redirect(session?.user ? "/dashboard" : "/login");
}
