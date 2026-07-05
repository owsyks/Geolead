"use client";

// Client-side auth: identity/session now come from Clerk; this module still
// exposes the same `useAuth()`/`AuthUser` shape the rest of the app already
// depends on, merging in the local-DB profile fields (plan, planStatus,
// trialEndsAt, isAdmin, etc.) that only exist in this app's own Postgres
// `User` row, not in Clerk. Route guarding (redirect unauthenticated visits
// to /login) is preserved here as a client-side backstop alongside the edge
// `clerkMiddleware()` in middleware.ts.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
  type ReactNode,
} from "react";
import { usePathname, useRouter } from "next/navigation";
import { useAuth as useClerkAuth, useClerk } from "@clerk/nextjs";
import {
  fetchOutbound,
  setUnauthorizedHandler,
  setUpgradeHandler,
  type UpgradeSignal,
} from "@/lib/outbound";
import { readCache, writeCache, clearAllCache } from "@/lib/cache";
import { UpgradeModal } from "@/components/UpgradeModal";

// Cache key for the signed-in user, so returning visitors render instantly.
const USER_CACHE_KEY = "user";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  plan: string;
  planStatus?: string;
  trialEndsAt?: string | null;
  role: string;
  isAdmin?: boolean;
  timezone: string;
  locale: string;
  dateFormat: string;
  createdAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Routes reachable without a session. "/" serves the public marketing Landing
// to logged-out visitors (and the dashboard to signed-in users), and "/contact"
// is a public marketing page.
const PUBLIC_ROUTES = ["/", "/contact", "/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];

function isPublic(path: string): boolean {
  return PUBLIC_ROUTES.some((r) => path === r || path.startsWith(`${r}?`));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const { isLoaded: clerkLoaded, isSignedIn } = useClerkAuth();
  const { signOut } = useClerk();
  const [user, setUser] = useState<AuthUser | null>(null);
  const [profileLoading, setProfileLoading] = useState(true);
  const [upgrade, setUpgrade] = useState<UpgradeSignal | null>(null);
  const router = useRouter();
  const pathname = usePathname() || "/";

  const loadMe = useCallback(async () => {
    if (!isSignedIn) {
      setUser(null);
      clearAllCache();
      return;
    }
    try {
      const data = await fetchOutbound<{ user: AuthUser }>("/api/auth/me");
      setUser(data.user);
      writeCache(USER_CACHE_KEY, data.user);
    } catch {
      setUser(null);
    }
  }, [isSignedIn]);

  // Once Clerk has resolved its own session state, seed from cache for
  // instant paint, then revalidate the local profile (plan/isAdmin/etc.).
  useEffect(() => {
    if (!clerkLoaded) return;
    if (isSignedIn) {
      const cached = readCache<AuthUser>(USER_CACHE_KEY);
      if (cached) setUser(cached);
    }
    let active = true;
    (async () => {
      await loadMe();
      if (active) setProfileLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [clerkLoaded, isSignedIn, loadMe]);

  // When a request to the local API hits an unrecoverable 401 (e.g. the
  // account was deactivated even though Clerk still reports a session),
  // drop the user and bounce to login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      clearAllCache();
      if (!isPublic(window.location.pathname)) router.replace("/login");
    });
    return () => setUnauthorizedHandler(null);
  }, [router]);

  // Surface plan/quota gates (HTTP 402) as an upgrade modal.
  useEffect(() => {
    setUpgradeHandler((signal) => setUpgrade(signal));
    return () => setUpgradeHandler(null);
  }, []);

  const loading = !clerkLoaded || profileLoading;

  // Route guard: once loading is done, gate non-public routes. (Backstop —
  // clerkMiddleware() in middleware.ts already protects at the edge.)
  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic(pathname)) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
    if (user && (pathname === "/login" || pathname === "/register")) {
      router.replace("/overview");
    }
  }, [loading, user, pathname, router]);

  const logout = useCallback(async () => {
    await signOut();
    clearAllCache();
    setUser(null);
    router.replace("/login");
  }, [signOut, router]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, logout, refreshUser: loadMe }),
    [user, loading, logout, loadMe]
  );

  // Block app rendering until the session is resolved, and don't flash app
  // chrome for unauthenticated users on protected routes.
  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-text-muted">
        <div className="animate-pulse text-sm">Loading…</div>
      </div>
    );
  }
  if (!user && !isPublic(pathname)) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-bg text-text-muted">
        <div className="text-sm">Redirecting to sign in…</div>
      </div>
    );
  }

  return (
    <AuthContext.Provider value={value}>
      {children}
      {upgrade && <UpgradeModal signal={upgrade} onClose={() => setUpgrade(null)} />}
    </AuthContext.Provider>
  );
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
