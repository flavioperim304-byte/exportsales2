import type { NextConfig } from "next";

const nextConfig: NextConfig = {
  /* config options here */
  cacheComponents: true,
  partialPrefetching: true,
  // The dev server is bound to 0.0.0.0 so the desktop port forward can reach it.
  // The browser still opens 127.0.0.1. Without this list, Next blocks that dev channel.
  allowedDevOrigins: ["127.0.0.1", "localhost", "**.trycloudflare.com"],
  turbopack: {
    rules: {
      "*.css": {
        loaders: ["@tailwindcss/turbopack"],
        as: "*.css",
      },
    },
  },
};

export default nextConfig;
