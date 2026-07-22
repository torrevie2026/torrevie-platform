"use client";

import { useEffect, useRef } from "react";

type TexAutoRefreshOptions = {
  enabled?: boolean;
  intervalMs: number;
  onRefresh: () => Promise<void>;
};

export function useTexAutoRefresh({
  enabled = true,
  intervalMs,
  onRefresh
}: TexAutoRefreshOptions) {
  const isRefreshingRef = useRef(false);
  const refreshRef = useRef(onRefresh);

  useEffect(() => {
    refreshRef.current = onRefresh;
  }, [onRefresh]);

  useEffect(() => {
    if (!enabled) {
      return;
    }

    const tick = async () => {
      if (document.visibilityState !== "visible" || isRefreshingRef.current) {
        return;
      }

      isRefreshingRef.current = true;
      try {
        await refreshRef.current();
      } finally {
        isRefreshingRef.current = false;
      }
    };

    const interval = window.setInterval(() => {
      void tick();
    }, intervalMs);

    return () => window.clearInterval(interval);
  }, [enabled, intervalMs]);
}
