"use client";

import { Moon, Sun } from "lucide-react";
import { usePathname } from "next/navigation";
import { useTheme } from "./ThemeProvider";

const PUBLIC_PATHS = ["/", "/pricing", "/contact", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];

export function PublicThemeToggle() {
  const pathname = usePathname() || "/";
  const { theme, toggle } = useTheme();
  if (!PUBLIC_PATHS.some((path) => pathname === path || pathname.startsWith(`${path}/`))) return null;

  return (
    <button
      type="button"
      onClick={toggle}
      className="fixed bottom-4 left-4 z-[70] inline-flex h-10 items-center gap-2 rounded-full border border-border bg-bg/90 px-3 text-xs font-bold text-text-muted shadow-lg backdrop-blur-xl transition-colors hover:border-brand/40 hover:text-text"
      aria-label={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
      title={`Switch to ${theme === "dark" ? "light" : "dark"} mode`}
    >
      {theme === "dark" ? <Sun className="h-4 w-4 text-brand" /> : <Moon className="h-4 w-4 text-brand" />}
      <span className="hidden sm:inline">{theme === "dark" ? "Light mode" : "Dark mode"}</span>
    </button>
  );
}
