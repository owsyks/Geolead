"use client";

// Client-side auth: holds the current user + access/refresh tokens (via the
// helpers in lib/outbound), exposes login/register/logout, and guards routes —
// unauthenticated visits to app pages are redirected to /login.
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
import {
  OUTBOUND_API_BASE,
  fetchOutbound,
  setTokens,
  clearTokens,
  getAccessToken,
  getRefreshToken,
  setUnauthorizedHandler,
} from "@/lib/outbound";

export interface AuthUser {
  id: string;
  email: string;
  name: string;
  avatarUrl: string | null;
  emailVerified: boolean;
  plan: string;
  role: string;
  timezone: string;
  locale: string;
  dateFormat: string;
  createdAt: string;
}

interface AuthContextValue {
  user: AuthUser | null;
  loading: boolean;
  login: (email: string, password: string, remember?: boolean) => Promise<void>;
  register: (name: string, email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshUser: () => Promise<void>;
}

const AuthContext = createContext<AuthContextValue | null>(null);

// Routes reachable without a session.
const PUBLIC_ROUTES = ["/login", "/register", "/forgot-password", "/reset-password", "/verify-email"];

function isPublic(path: string): boolean {
  return PUBLIC_ROUTES.some((r) => path === r || path.startsWith(`${r}?`));
}

export function AuthProvider({ children }: { children: ReactNode }) {
  const [user, setUser] = useState<AuthUser | null>(null);
  const [loading, setLoading] = useState(true);
  const router = useRouter();
  const pathname = usePathname() || "/";

  const loadMe = useCallback(async () => {
    if (!getAccessToken() && !getRefreshToken()) {
      setUser(null);
      return;
    }
    try {
      const data = await fetchOutbound<{ user: AuthUser }>("/api/auth/me");
      setUser(data.user);
    } catch {
      setUser(null);
    }
  }, []);

  // Initial load: resolve the current user from a stored token (if any).
  useEffect(() => {
    let active = true;
    (async () => {
      await loadMe();
      if (active) setLoading(false);
    })();
    return () => {
      active = false;
    };
  }, [loadMe]);

  // When a request hits an unrecoverable 401, drop the user and bounce to login.
  useEffect(() => {
    setUnauthorizedHandler(() => {
      setUser(null);
      if (!isPublic(window.location.pathname)) router.replace("/login");
    });
    return () => setUnauthorizedHandler(null);
  }, [router]);

  // Route guard: once loading is done, gate non-public routes.
  useEffect(() => {
    if (loading) return;
    if (!user && !isPublic(pathname)) {
      router.replace(`/login?next=${encodeURIComponent(pathname)}`);
    }
    if (user && (pathname === "/login" || pathname === "/register")) {
      router.replace("/");
    }
  }, [loading, user, pathname, router]);

  const login = useCallback(async (email: string, password: string, remember = true) => {
    const res = await fetch(`${OUTBOUND_API_BASE}/api/auth/login`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ email, password, remember }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Login failed.");
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

  const register = useCallback(async (name: string, email: string, password: string) => {
    const res = await fetch(`${OUTBOUND_API_BASE}/api/auth/register`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ name, email, password }),
    });
    const data = await res.json();
    if (!res.ok) throw new Error(data?.error || "Registration failed.");
    setTokens(data.accessToken, data.refreshToken);
    setUser(data.user);
  }, []);

  const logout = useCallback(async () => {
    const refreshToken = getRefreshToken();
    try {
      await fetch(`${OUTBOUND_API_BASE}/api/auth/logout`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ refreshToken }),
      });
    } catch {
      /* best-effort */
    }
    clearTokens();
    setUser(null);
    router.replace("/login");
  }, [router]);

  const value = useMemo<AuthContextValue>(
    () => ({ user, loading, login, register, logout, refreshUser: loadMe }),
    [user, loading, login, register, logout, loadMe]
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

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export function useAuth(): AuthContextValue {
  const ctx = useContext(AuthContext);
  if (!ctx) throw new Error("useAuth must be used within <AuthProvider>");
  return ctx;
}
