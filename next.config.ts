import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * `standalone` is a DOCKER-ONLY concern, and it must not be on by default.
   *
   * It traces the modules the app imports and emits a self-contained server, so
   * the container image needs no node_modules. But it changes what Next writes
   * to .next, and Vercel's own build pipeline expects the default layout --
   * `next build` on Vercel dies with:
   *
   *   ENOENT: no such file or directory, open '.next/next-server.js.nft.json'
   *
   * ...during Vercel's onBuildComplete step. Vercel does its own module tracing
   * and does not want standalone output.
   *
   * This was not caught initially because the first deployment used
   * `vercel deploy --prebuilt` with a locally produced build. Only a
   * Vercel-side build -- which is what every git push triggers -- hits it.
   *
   * So it is opt-in via the env var the Dockerfile sets.
   */
  ...(process.env.DOCKER_BUILD === "1" ? { output: "standalone" as const } : {}),

  devIndicators: {
    // Dev-only overlay. It defaults to bottom-left, where it sits on top of
    // our "Settings" nav item and makes it unclickable during development.
    position: "bottom-right",
  },
};

export default nextConfig;
