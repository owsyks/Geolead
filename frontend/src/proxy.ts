import { clerkMiddleware } from "@clerk/nextjs/server";

// Route protection for pages/data fetched during SSR happens here at the
// edge; the client-side redirect guard in lib/auth.tsx (AuthProvider) is
// kept as well for defense in depth on purely client-rendered navigation.
// Named proxy.ts, not middleware.ts — Next.js 16 renamed the convention
// (middleware.ts still works but is deprecated).
export default clerkMiddleware();

export const config = {
  matcher: [
    // Skip Next.js internals and all static files, unless found in search params
    "/((?!_next|[^?]*\\.(?:html?|css|js(?!on)|jpe?g|webp|png|gif|svg|ttf|woff2?|ico|csv|docx?|xlsx?|zip|webmanifest)).*)",
    // Always run for API routes
    "/(api|trpc)(.*)",
    "/__clerk/:path*",
  ],
};
