import type { NextConfig } from "next";
import path from "node:path";

const apiBase = process.env.NEXT_PUBLIC_OUTBOUND_API_BASE || "http://localhost:5000";
const wsBase = apiBase.replace(/^http/, "ws");
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob:",
  "font-src 'self' data:",
  `connect-src 'self' ${apiBase} ${wsBase}`,
  "object-src 'none'",
  "base-uri 'self'",
  "frame-ancestors 'none'",
  "form-action 'self'",
].join("; ");

const nextConfig: NextConfig = {
  output: "standalone",
  poweredByHeader: false,
  // Silence "multiple lockfiles detected" warning. Two package-lock.json files
  // exist (one at repo root for `concurrently`, one here). Pin the workspace root
  // to this directory so Next.js doesn't pick the wrong one.
  turbopack: {
    root: path.resolve(__dirname),
  },
  async headers() {
    return [{
      source: "/(.*)",
      headers: [
        { key: "Content-Security-Policy", value: csp },
        { key: "Referrer-Policy", value: "strict-origin-when-cross-origin" },
        { key: "X-Content-Type-Options", value: "nosniff" },
        { key: "X-Frame-Options", value: "DENY" },
        { key: "Permissions-Policy", value: "camera=(), microphone=(), geolocation=(), payment=()" },
        ...(process.env.NODE_ENV === "production"
          ? [{ key: "Strict-Transport-Security", value: "max-age=31536000" }]
          : []),
      ],
    }];
  },
};

export default nextConfig;
