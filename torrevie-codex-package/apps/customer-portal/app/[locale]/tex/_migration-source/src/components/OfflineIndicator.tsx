import React from 'react';
import { useOffline } from '@/contexts/OfflineContext';
import { Wifi, WifiOff, RefreshCw } from 'lucide-react';
import { cn } from '@/lib/utils';

const OfflineIndicator: React.FC = () => {
  const { isOnline, pendingCount, lastSyncResult } = useOffline();

  if (lastSyncResult && lastSyncResult.synced > 0) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-green-500/10 text-green-600 text-xs font-medium animate-pulse">
        <RefreshCw className="h-3 w-3" />
        Synced {lastSyncResult.synced} expense{lastSyncResult.synced > 1 ? 's' : ''}
      </div>
    );
  }

  if (!isOnline) {
    return (
      <div className="flex items-center gap-2 px-3 py-1.5 rounded-md bg-warning/10 text-warning text-xs font-medium">
        <WifiOff className="h-3 w-3" />
        <span>Offline{pendingCount > 0 ? ` — ${pendingCount} queued` : ''}</span>
      </div>
    );
  }

  return (
    <div className="flex items-center gap-2 px-3 py-1.5 text-xs text-muted-foreground">
      <div className="h-2 w-2 rounded-full bg-green-500" />
      <span>Online</span>
    </div>
  );
};

export default OfflineIndicator;
