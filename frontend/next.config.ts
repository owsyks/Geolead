import type { NextConfig } from "next";
import path from "node:path";

const apiBase = (process.env.BACKEND_SERVER_URL || process.env.NEXT_PUBLIC_OUTBOUND_API_BASE || "http://bore.pub:25192").trim().replace(/\/+$/, "");
const wsBase = apiBase.replace(/^http/, "ws");
const csp = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline' 'unsafe-eval'",
  "style-src 'self' 'unsafe-inline'",
  "img-src 'self' data: blob: https:",
  "font-src 'self' data: https:",
  "connect-src 'self' * ws: wss: http: https:",
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
  async rewrites() {
    return [
      {
        source: "/api/:path*",
        destination: `${apiBase}/api/:path*`,
      },
    ];
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
      ],
    }];
  },
};

export default nextConfig;
