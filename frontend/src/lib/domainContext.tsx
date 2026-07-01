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
  useState,
  type ReactNode,
} from "react";
import { fetchOutbound, type PortfolioDomain } from "@/lib/outbound";
import { readCache, writeCache } from "@/lib/cache";

const STORAGE_KEY = "geolead.activeDomainId";
const DOMAINS_CACHE_KEY = "domains";

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
  const [domains, setDomains] = useState<PortfolioDomain[]>(() => readCache<PortfolioDomain[]>(DOMAINS_CACHE_KEY) ?? []);
  const [activeDomainId, setActiveId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    try {
      const data = await fetchOutbound<PortfolioDomain[]>("/api/domains");
      setDomains(data);
      writeCache(DOMAINS_CACHE_KEY, data);
      // If the previously selected domain was deleted, clear the selection.
      if (activeDomainId && !data.some((d) => d.id === activeDomainId)) {
        setActiveId(null);
      }
    } catch {
      setDomains([]);
    } finally {
      setLoading(false);
    }
  }, [activeDomainId]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const stored = window.localStorage.getItem(STORAGE_KEY);
    if (stored) setActiveId(stored);
    void refresh();
    // refresh intentionally depends on activeDomainId via closure; we only
    // want this to fire on mount.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const setActiveDomainId = useCallback((id: string | null) => {
    setActiveId(id);
    if (typeof window !== "undefined") {
      if (id) window.localStorage.setItem(STORAGE_KEY, id);
      else window.localStorage.removeItem(STORAGE_KEY);
    }
  }, []);

  const activeDomain = useMemo(
    () => domains.find((d) => d.id === activeDomainId) || null,
    [domains, activeDomainId]
  );

  const value = useMemo<DomainContextValue>(
    () => ({ domains, activeDomain, activeDomainId, loading, setActiveDomainId, refresh }),
    [domains, activeDomain, activeDomainId, loading, setActiveDomainId, refresh]
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
