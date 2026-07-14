import React, { createContext, useContext, useEffect, useState, useCallback } from 'react';
import { getPendingCount } from '@/lib/offlineQueue';
import { syncOfflineExpenses, type SyncResult } from '@/lib/syncEngine';
import { createNotification } from '@/lib/notifications';
import { supabase } from '@/integrations/supabase/client';

interface OfflineContextType {
  isOnline: boolean;
  pendingCount: number;
  lastSyncResult: SyncResult | null;
  refreshPendingCount: () => Promise<void>;
  triggerSync: () => Promise<SyncResult>;
}

const OfflineContext = createContext<OfflineContextType>({
  isOnline: true,
  pendingCount: 0,
  lastSyncResult: null,
  refreshPendingCount: async () => {},
  triggerSync: async () => ({ synced: 0, failed: 0 }),
});

export const useOffline = () => useContext(OfflineContext);

export const OfflineProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [isOnline, setIsOnline] = useState(navigator.onLine);
  const [pendingCount, setPendingCount] = useState(0);
  const [lastSyncResult, setLastSyncResult] = useState<SyncResult | null>(null);
  const [syncing, setSyncing] = useState(false);

  const refreshPendingCount = useCallback(async () => {
    try {
      const count = await getPendingCount();
      setPendingCount(count);
    } catch {
      // IndexedDB might not be available
    }
  }, []);

  const triggerSync = useCallback(async (): Promise<SyncResult> => {
    if (syncing || !navigator.onLine) return { synced: 0, failed: 0 };
    setSyncing(true);
    try {
      const result = await syncOfflineExpenses();
      setLastSyncResult(result);
      await refreshPendingCount();
      // Clear sync result after 3 seconds
      if (result.synced > 0) {
        // Send sync_complete notification
        try {
          const { data: { session } } = await supabase.auth.getSession();
          if (session?.user) {
            const { data: prof } = await supabase.from('profiles').select('company_id').eq('id', session.user.id).single();
            if (prof?.company_id) {
              await createNotification({
                companyId: prof.company_id,
                userId: session.user.id,
                title: 'Expenses synced',
                body: `${result.synced} offline expense(s) have been synced successfully`,
                type: 'sync_complete',
              });
            }
          }
        } catch {
          // Notification creation should not block offline sync completion.
        }
        setTimeout(() => setLastSyncResult(null), 3000);
      }
      return result;
    } finally {
      setSyncing(false);
    }
  }, [syncing, refreshPendingCount]);

  useEffect(() => {
    const handleOnline = () => {
      setIsOnline(true);
      // Auto-sync when coming back online
      triggerSync();
    };
    const handleOffline = () => setIsOnline(false);

    window.addEventListener('online', handleOnline);
    window.addEventListener('offline', handleOffline);

    // Initial count
    refreshPendingCount();

    return () => {
      window.removeEventListener('online', handleOnline);
      window.removeEventListener('offline', handleOffline);
    };
  }, [triggerSync, refreshPendingCount]);

  return (
    <OfflineContext.Provider value={{ isOnline, pendingCount, lastSyncResult, refreshPendingCount, triggerSync }}>
      {children}
    </OfflineContext.Provider>
  );
};
