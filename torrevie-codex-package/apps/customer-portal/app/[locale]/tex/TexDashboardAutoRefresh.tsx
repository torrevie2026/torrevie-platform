"use client";

import { useCallback, useTransition } from "react";
import { useRouter } from "next/navigation";
import { useTexAutoRefresh } from "./useTexAutoRefresh";

export function TexDashboardAutoRefresh() {
  const router = useRouter();
  const [, startTransition] = useTransition();
  const refreshDashboard = useCallback(async () => {
    startTransition(() => {
      router.refresh();
    });
  }, [router]);

  useTexAutoRefresh({
    intervalMs: 60000,
    minRefreshGapMs: 30000,
    onRefresh: refreshDashboard
  });

  return null;
}
