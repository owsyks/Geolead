import { clerkMiddleware } from "@clerk/nextjs/server";
import { NextResponse } from "next/server";

// Route protection for pages/data fetched during SSR happens here at the
// edge; the client-side redirect guard in lib/auth.tsx (AuthProvider) is
// kept as well for defense in depth on purely client-rendered navigation.
// Named proxy.ts, not middleware.ts — Next.js 16 renamed the convention
// (middleware.ts still works but is deprecated).
//
// This project has 4 domains pointed at the same deployment (geolead.tech,
// www.geolead.tech, geolead.ai, the *.vercel.app URL). Clerk sessions are
// scoped per-domain — signing in on one doesn't carry over to another, which
// reads as "my account doesn't exist" when bouncing between them. Rather
// than configure Clerk's satellite-domain feature for true cross-domain
// session sharing, redirect every non-canonical domain to the one canonical
// domain, so there's only ever one place a session can exist.
const CANONICAL_HOST = "geolead.tech";

export default clerkMiddleware((_auth, request) => {
  // Only enforce in the real production deployment — never in local dev
  // (host would be localhost) or Vercel preview deployments (each preview
  // has its own unique *.vercel.app host by design; redirecting those away
  // would make previews untestable).
  const host = request.headers.get("host") || "";
  if (process.env.VERCEL_ENV === "production" && host && host !== CANONICAL_HOST) {
    const url = new URL(request.url);
    url.protocol = "https";
    url.host = CANONICAL_HOST;
    url.port = "";
    return NextResponse.redirect(url, 308);
  }
  return NextResponse.next();
});

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
