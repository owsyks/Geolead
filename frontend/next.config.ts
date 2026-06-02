import type { NextConfig } from "next";
import path from "node:path";

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Silence "multiple lockfiles detected" warning. Two package-lock.json files
  // exist (one at repo root for `concurrently`, one here). Pin the workspace root
  // to this directory so Next.js doesn't pick the wrong one.
  turbopack: {
    root: path.resolve(__dirname),
  },
};

export default nextConfig;
