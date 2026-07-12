"use client";

// Cross-page selected-domain state. The portfolio is the center of the app:
// once a user picks a domain from the selector, every other workflow (lead gen,
// email gen, campaign create) reads it from here so the user never re-types.
import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from "react";
import { fetchOutbound, type PortfolioDomain } from "@/lib/outbound";
import { readCache, writeCache } from "@/lib/cache";
import { useAuth } from "@/lib/auth";

const storageKey = (userId: string) => `geolead.activeDomainId.${userId}`;
const domainsCacheKey = (userId: string) => `domains.${userId}`;

interface DomainContextValue {
  domains: PortfolioDomain[];
  activeDomain: PortfolioDomain | null;
  activeDomainId: string | null;
  loading: boolean;
  setActiveDomainId: (id: string | null) => void;
  refresh: () => Promise<void>;
}

const DomainContext = createContext<DomainContextValue | null>(null);

export function DomainContextProvider({ children }: { children: ReactNode }) {
  const { user, loading: authLoading } = useAuth();
  const [domains, setDomains] = useState<PortfolioDomain[]>([]);
  const [activeDomainId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [stateOwnerId, setStateOwnerId] = useState<string | null>(null);
  const currentUserId = useRef<string | null>(user?.id ?? null);

  useEffect(() => {
    currentUserId.current = user?.id ?? null;
  }, [user?.id]);

  const refresh = useCallback(async () => {
    if (!user) {
      setDomains([]);
      setLoading(false);
      return;
    }
    const requestedUserId = user.id;
    try {
      const data = await fetchOutbound<PortfolioDomain[]>("/api/domains");
      if (currentUserId.current !== requestedUserId) return;
      setDomains(data);
      writeCache(domainsCacheKey(requestedUserId), data);
    } catch {
      if (currentUserId.current === requestedUserId) setDomains([]);
    } finally {
      if (currentUserId.current === requestedUserId) setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    if (authLoading || typeof window === "undefined") return;
    let active = true;
    void (async () => {
      await Promise.resolve();
      if (!active) return;
      if (!user) {
        setDomains([]);
        setActiveId(null);
        setStateOwnerId(null);
        setLoading(false);
        return;
      }
      setLoading(true);
      setDomains(readCache<PortfolioDomain[]>(domainsCacheKey(user.id)) ?? []);
      setActiveId(window.localStorage.getItem(storageKey(user.id)) || null);
      setStateOwnerId(user.id);
      void refresh();
    })();
    return () => { active = false; };
  }, [authLoading, user, refresh]);

  const setActiveDomainId = useCallback((id: string | null) => {
    setActiveId(id);
    if (typeof window !== "undefined" && user) {
      const key = storageKey(user.id);
      if (id) window.localStorage.setItem(key, id);
      else window.localStorage.removeItem(key);
    }
  }, [user]);

  const visibleDomains = useMemo(
    () => stateOwnerId === user?.id ? domains : [],
    [domains, stateOwnerId, user?.id]
  );
  const visibleActiveDomainId = stateOwnerId === user?.id ? activeDomainId : null;

  const activeDomain = useMemo(
    () => visibleDomains.find((d) => d.id === visibleActiveDomainId) || null,
    [visibleDomains, visibleActiveDomainId]
  );

  const value = useMemo<DomainContextValue>(
    () => ({
      domains: visibleDomains,
      activeDomain,
      activeDomainId: visibleActiveDomainId,
      loading: authLoading || Boolean(user && stateOwnerId !== user.id) || loading,
      setActiveDomainId,
      refresh,
    }),
    [visibleDomains, activeDomain, visibleActiveDomainId, authLoading, user, stateOwnerId, loading, setActiveDomainId, refresh]
  );

  return <DomainContext.Provider value={value}>{children}</DomainContext.Provider>;
}

export function useDomainContext(): DomainContextValue {
  const ctx = useContext(DomainContext);
  if (!ctx) {
    throw new Error("useDomainContext must be used within DomainContextProvider");
  }
  return ctx;
}
