"use client";

import { useCallback, useEffect, useRef, useState, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTexAutoRefresh } from "./useTexAutoRefresh";

export function TexDashboardAutoRefresh() {
  const router = useRouter();
  const [isPending, startTransition] = useTransition();
  const [isSyncing, setIsSyncing] = useState(false);
  const syncTimeoutRef = useRef<number | null>(null);
  const refreshDashboard = useCallback(async () => {
    if (syncTimeoutRef.current) {
      window.clearTimeout(syncTimeoutRef.current);
    }
    setIsSyncing(true);
    startTransition(() => {
      router.refresh();
    });
    syncTimeoutRef.current = window.setTimeout(() => {
      setIsSyncing(false);
      syncTimeoutRef.current = null;
    }, 900);
  }, [router]);

  useEffect(
    () => () => {
      if (syncTimeoutRef.current) {
        window.clearTimeout(syncTimeoutRef.current);
      }
    },
    []
  );

  useTexAutoRefresh({
    intervalMs: 60000,
    minRefreshGapMs: 30000,
    onRefresh: refreshDashboard
  });

  if (!isSyncing && !isPending) {
    return null;
  }

  return (
    <div className="tex-live-sync-indicator" role="status" aria-live="polite">
      <span aria-hidden="true" />
      Syncing TEX
    </div>
  );
}
