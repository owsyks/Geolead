"use client";

import { useEffect, useRef } from "react";

interface VisiblePollingOptions {
  /** Run the poll. Return `false` to stop polling (e.g. terminal status reached). */
  poll: () => boolean | void | Promise<boolean | void>;
  /** Whether polling should be active at all (e.g. a task is running). */
  enabled: boolean;
  /** Starting interval in ms. */
  intervalMs?: number;
  /** Max interval after backoff in ms. */
  maxIntervalMs?: number;
  /** Backoff multiplier applied each tick (1 = constant interval). */
  backoff?: number;
  /**
   * Fire the first poll right away instead of waiting a full `intervalMs`
   * before the first fetch. Without this, whatever the loop is displaying
   * (e.g. cached/stale data) sits unrefreshed for the entire first interval,
   * which reads as "old data takes forever to reload."
   */
  immediate?: boolean;
}

/**
 * Self-scheduling poller that:
 *  - PAUSES while the tab is hidden (`document.visibilityState`), resuming on focus,
 *  - backs OFF (interval grows up to `maxIntervalMs`) so idle/long jobs don't hammer the API,
 *  - stops cleanly when `enabled` flips false or `poll` returns `false`.
 *
 * Replaces raw `setInterval(fn, 3000)` loops that fire forever in background tabs.
 */
export function useVisiblePolling({
  poll,
  enabled,
  intervalMs = 3000,
  maxIntervalMs = 30000,
  backoff = 1.5,
  immediate = false,
}: VisiblePollingOptions) {
  const pollRef = useRef(poll);
  pollRef.current = poll;

  useEffect(() => {
    if (!enabled) return;

    let stopped = false;
    let timer: ReturnType<typeof setTimeout> | undefined;
    let delay = intervalMs;

    const clear = () => {
      if (timer) clearTimeout(timer);
      timer = undefined;
    };

    const schedule = () => {
      clear();
      if (stopped) return;
      timer = setTimeout(tick, delay);
    };

    const tick = async () => {
      if (stopped) return;
      if (typeof document !== "undefined" && document.visibilityState === "hidden") {
        // Tab not visible — wait and re-check rather than fetching.
        schedule();
        return;
      }
      try {
        const result = await pollRef.current();
        if (result === false) {
          stopped = true;
          clear();
          return;
        }
      } catch {
        /* swallow — next tick retries */
      }
      delay = Math.min(maxIntervalMs, Math.round(delay * backoff));
      schedule();
    };

    const onVisibility = () => {
      if (document.visibilityState === "visible" && !stopped) {
        delay = intervalMs; // reset cadence when the user returns
        clear();
        timer = setTimeout(tick, 0);
      }
    };

    document.addEventListener("visibilitychange", onVisibility);
    timer = setTimeout(tick, immediate ? 0 : delay);

    return () => {
      stopped = true;
      clear();
      document.removeEventListener("visibilitychange", onVisibility);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [enabled, intervalMs, maxIntervalMs, backoff, immediate]);
}
