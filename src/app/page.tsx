import { redirect } from "next/navigation";

/**
 * "/" has no content of its own yet. Stage 3 turns this into a marketing page
 * that routes signed-in users to the dashboard and everyone else to /login.
 * Until auth exists, an unconditional redirect keeps one obvious entry point.
 */
export default function RootPage() {
  redirect("/dashboard");
}
