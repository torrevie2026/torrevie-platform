"use client";

import { useEffect, useRef } from "react";

type TexAutoRefreshOptions = {
  enabled?: boolean;
  intervalMs: number;
  leading?: boolean;
  minRefreshGapMs?: number;
  onRefresh: () => Promise<void>;
};

export function useTexAutoRefresh({
  enabled = true,
  intervalMs,
  leading = false,
  minRefreshGapMs = Math.min(intervalMs, 10000),
  onRefresh
}: TexAutoRefreshOptions) {
  const isRefreshingRef = useRef(false);
  const lastRefreshAtRef = useRef(0);
  const refreshRef = useRef(onRefresh);

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const tick = async (force = false) => {
      if (document.visibilityState !== "visible" || isRefreshingRef.current) {
        return;
      }

      const now = Date.now();
      if (!force && now - lastRefreshAtRef.current < minRefreshGapMs) {
        return;
      }

      isRefreshingRef.current = true;
      try {
        await refreshRef.current();
        lastRefreshAtRef.current = Date.now();
      } finally {
        isRefreshingRef.current = false;
      }
    };

    if (leading) {
      void tick(true);
    }

    const interval = window.setInterval(() => {
      void tick();
    }, intervalMs);

    const refreshOnResume = () => {
      void tick();
    };

    document.addEventListener("visibilitychange", refreshOnResume);
    window.addEventListener("focus", refreshOnResume);
    window.addEventListener("online", refreshOnResume);

    return () => {
      window.clearInterval(interval);
      document.removeEventListener("visibilitychange", refreshOnResume);
      window.removeEventListener("focus", refreshOnResume);
      window.removeEventListener("online", refreshOnResume);
    };
  }, [enabled, intervalMs, leading, minRefreshGapMs]);
}
