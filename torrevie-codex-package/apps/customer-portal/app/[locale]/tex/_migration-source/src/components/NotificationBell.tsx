import React from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Bell, CheckCheck, Receipt, AlertTriangle, DollarSign, MapPin, Wifi, XCircle, CheckCircle } from 'lucide-react';
import { useNotifications, Notification } from '@/contexts/NotificationContext';
import { Button } from '@/components/ui/button';
import { Popover, PopoverTrigger, PopoverContent } from '@/components/ui/popover';
import { cn } from '@/lib/utils';
import { formatDistanceToNow } from 'date-fns';

const typeIcons: Record<string, React.ElementType> = {
  expense_submitted: Receipt,
  expense_approved: CheckCircle,
  expense_rejected: XCircle,
  expense_paid: DollarSign,
  policy_violation: AlertTriangle,
  budget_warning: AlertTriangle,
  budget_exceeded: AlertTriangle,
  sync_complete: Wifi,
  trip_budget_warning: MapPin,
};

const typeColors: Record<string, string> = {
  expense_submitted: 'text-blue-600',
  expense_approved: 'text-green-600',
  expense_rejected: 'text-destructive',
  expense_paid: 'text-teal-600',
  policy_violation: 'text-amber-600',
  budget_warning: 'text-amber-600',
  budget_exceeded: 'text-destructive',
  sync_complete: 'text-green-600',
  trip_budget_warning: 'text-amber-600',
};

interface NotificationBellProps {
  side?: 'right' | 'bottom';
}

const NotificationBell: React.FC<NotificationBellProps> = ({ side = 'right' }) => {
  const { notifications, unreadCount, markAsRead, markAllAsRead } = useNotifications();
  const navigate = useNavigate();
  const [open, setOpen] = React.useState(false);

  const handleClick = async (n: Notification) => {
    if (!n.is_read) await markAsRead(n.id);
    setOpen(false);
    if (n.related_expense_id) navigate(`/expenses?highlight=${n.related_expense_id}`);
    else if (n.related_trip_id) navigate(`/trips`);
  };

  const recent = notifications.slice(0, 20);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="ghost" size="icon" className="relative h-9 w-9">
          <Bell className="h-5 w-5 text-sidebar-foreground/70" />
          {unreadCount > 0 && (
            <span className="absolute -top-0.5 -right-0.5 h-4.5 w-4.5 min-w-[18px] rounded-full bg-destructive text-destructive-foreground text-[10px] font-bold flex items-center justify-center px-1">
              {unreadCount > 99 ? '99+' : unreadCount}
            </span>
          )}
        </Button>
      </PopoverTrigger>

      <PopoverContent
        side={side}
        align="end"
        sideOffset={12}
        className="w-80 md:w-96 p-0 max-h-[70vh] flex flex-col"
      >
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-border">
          <h3 className="text-sm font-semibold text-foreground">Notifications</h3>
          {unreadCount > 0 && (
            <Button variant="ghost" size="sm" className="h-7 text-xs text-primary" onClick={markAllAsRead}>
              <CheckCheck className="h-3.5 w-3.5 mr-1" /> Mark all read
            </Button>
          )}
        </div>

        {/* List */}
        <div className="overflow-y-auto flex-1">
          {recent.length === 0 ? (
            <div className="text-center py-8 text-sm text-muted-foreground">No notifications yet</div>
          ) : recent.map(n => {
            const Icon = typeIcons[n.type] ?? Bell;
            const iconColor = typeColors[n.type] ?? 'text-muted-foreground';
            return (
              <button
                key={n.id}
                onClick={() => handleClick(n)}
                className={cn(
                  'w-full text-left px-4 py-3 hover:bg-accent/50 transition-colors border-b border-border last:border-0 flex gap-3',
                  !n.is_read && 'border-l-2 border-l-primary bg-primary/5'
                )}
              >
                <div className={cn('mt-0.5 shrink-0', iconColor)}>
                  <Icon className="h-4 w-4" />
                </div>
                <div className="min-w-0 flex-1">
                  <p className={cn('text-sm', !n.is_read ? 'font-semibold text-foreground' : 'font-medium text-foreground/80')}>{n.title}</p>
                  <p className="text-xs text-muted-foreground mt-0.5 line-clamp-2">{n.body}</p>
                  <p className="text-[10px] text-muted-foreground/60 mt-1">
                    {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                  </p>
                </div>
                {!n.is_read && <div className="h-2 w-2 rounded-full bg-primary mt-1.5 shrink-0" />}
              </button>
            );
          })}
        </div>

        {/* Footer */}
        <div className="border-t border-border px-4 py-2">
          <Link to="/notifications" onClick={() => setOpen(false)} className="text-xs text-primary hover:underline">
            View all notifications
          </Link>
        </div>
      </PopoverContent>
    </Popover>
  );
};

export default NotificationBell;
