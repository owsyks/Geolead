"use client";

import CommandCenter from "@/components/CommandCenter";

// Authenticated "Overview" / command-center dashboard. Lives at /overview so
// that `/` can serve the public marketing Landing to everyone (the route guard
// in lib/auth bounces logged-out visitors here back to /login).
export default function OverviewPage() {
  return <CommandCenter />;
}
