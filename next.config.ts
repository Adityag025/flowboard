import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /**
   * Required by the Dockerfile. `standalone` traces the modules the app actually
   * imports and emits a self-contained server, so the runtime image needs no
   * node_modules and ships no devDependencies.
   *
   * Harmless outside Docker: it only adds .next/standalone alongside the normal
   * build output.
   */
  output: "standalone",

  devIndicators: {
    // Dev-only overlay. It defaults to bottom-left, where it sits on top of
    // our "Settings" nav item and makes it unclickable during development.
    position: "bottom-right",
  },
};

export default nextConfig;
