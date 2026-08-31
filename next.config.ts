import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  devIndicators: {
    // Dev-only overlay. It defaults to bottom-left, where it sits on top of
    // our "Settings" nav item and makes it unclickable during development.
    position: "bottom-right",
  },
};

export default nextConfig;
