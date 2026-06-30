"use client";

import { useAuth } from "@/lib/auth";
import Landing from "@/components/Landing";
import CommandCenter from "@/components/CommandCenter";

// `/` serves the public marketing Landing to logged-out visitors and the
// authenticated Command Center dashboard to signed-in users.
export default function HomePage() {
  const { user } = useAuth();
  if (!user) return <Landing />;
  return <CommandCenter />;
}
