import React, { useEffect, useState } from 'react';
import { useOffline } from '@/contexts/OfflineContext';
import { getAllQueued, removeFromQueue, updateQueueItem, type OfflineExpense } from '@/lib/offlineQueue';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { AlertTriangle, RefreshCw, Trash2, WifiOff } from 'lucide-react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { format } from 'date-fns';

interface OfflineQueueBannerProps {
  onSyncComplete?: () => void;
}

const OfflineQueueBanner: React.FC<OfflineQueueBannerProps> = ({ onSyncComplete }) => {
  const { triggerSync, refreshPendingCount } = useOffline();
  const [items, setItems] = useState<OfflineExpense[]>([]);
  const [showDetails, setShowDetails] = useState(false);

  const loadItems = async () => {
    const all = await getAllQueued();
    setItems(all);
  };

  useEffect(() => { loadItems(); }, []);

  const pendingItems = items.filter(i => i.sync_status === 'pending');
  const failedItems = items.filter(i => i.sync_status === 'failed');

  if (items.length === 0) return null;

  const handleRetry = async () => {
    // Reset failed items to pending
    for (const item of failedItems) {
      if (item.id) {
        await updateQueueItem(item.id, { sync_status: 'pending', retry_count: 0 });
      }
    }
    const result = await triggerSync();
    await loadItems();
    await refreshPendingCount();
    if (result.synced > 0) {
      toast.success(`Synced ${result.synced} expense${result.synced > 1 ? 's' : ''}`);
      onSyncComplete?.();
    }
    if (result.failed > 0) {
      toast.error(`${result.failed} expense${result.failed > 1 ? 's' : ''} failed to sync`);
    }
  };

  const handleDelete = async (id: number) => {
    await removeFromQueue(id);
    await loadItems();
    await refreshPendingCount();
    toast.success('Queued expense removed');
  };

  return (
    <div className="space-y-3 mb-4">
      {pendingItems.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-warning/10 border border-warning/20">
          <WifiOff className="h-4 w-4 text-warning shrink-0" />
          <span className="text-sm font-medium text-warning flex-1">
            You have {pendingItems.length} expense{pendingItems.length > 1 ? 's' : ''} waiting to sync
          </span>
        </div>
      )}

      {failedItems.length > 0 && (
        <div className="flex items-center gap-3 p-3 rounded-lg bg-destructive/10 border border-destructive/20">
          <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />
          <span className="text-sm font-medium text-destructive flex-1">
            Sync failed for {failedItems.length} expense{failedItems.length > 1 ? 's' : ''}
          </span>
          <Button size="sm" variant="outline" onClick={handleRetry}>
            <RefreshCw className="h-3.5 w-3.5 mr-1" />Retry
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setShowDetails(!showDetails)}>
            {showDetails ? 'Hide' : 'Details'}
          </Button>
        </div>
      )}

      {showDetails && (failedItems.length > 0 || pendingItems.length > 0) && (
        <div className="bg-card rounded-lg border overflow-hidden">
          <div className="px-4 py-2 bg-muted/50 border-b">
            <h3 className="text-sm font-semibold text-foreground">Unsynced Expenses</h3>
          </div>
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Saved At</TableHead>
                <TableHead>Vendor</TableHead>
                <TableHead>Amount</TableHead>
                <TableHead>Status</TableHead>
                <TableHead></TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {[...failedItems, ...pendingItems].map(item => (
                <TableRow key={item.id}>
                  <TableCell className="text-xs">{format(new Date(item.created_at), 'dd MMM HH:mm')}</TableCell>
                  <TableCell className="text-sm">{item.expense_data?.vendor || '—'}</TableCell>
                  <TableCell className="text-sm">{item.expense_data?.amount} {item.expense_data?.currency}</TableCell>
                  <TableCell>
                    <Badge variant="outline" className={item.sync_status === 'failed' ? 'bg-destructive/10 text-destructive border-destructive/20' : 'bg-warning/10 text-warning border-warning/20'}>
                      {item.sync_status === 'failed' ? `Failed (${item.retry_count}×)` : 'Pending'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Button size="sm" variant="ghost" onClick={() => item.id && handleDelete(item.id)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}
    </div>
  );
};

export default OfflineQueueBanner;
