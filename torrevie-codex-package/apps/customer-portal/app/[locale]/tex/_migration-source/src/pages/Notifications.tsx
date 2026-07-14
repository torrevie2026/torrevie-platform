import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Bell, Receipt, CheckCircle, XCircle, DollarSign, AlertTriangle, MapPin, Wifi, UserPlus, Link2, EyeOff } from 'lucide-react';
import { useNotifications, Notification } from '@/contexts/NotificationContext';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { cn } from '@/lib/utils';
import { apiRequest } from '@/lib/api';
import { toast } from 'sonner';
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
  wappfly_unregistered: AlertTriangle,
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
  wappfly_unregistered: 'text-amber-600',
};

const typeLabels: Record<string, string> = {
  expense_submitted: 'Expense Submitted',
  expense_approved: 'Expense Approved',
  expense_rejected: 'Expense Rejected',
  expense_paid: 'Expense Paid',
  policy_violation: 'Policy Violation',
  budget_warning: 'Budget Warning',
  budget_exceeded: 'Budget Exceeded',
  sync_complete: 'Sync Complete',
  trip_budget_warning: 'Trip Budget Warning',
  wappfly_unregistered: 'Unregistered WhatsApp',
};

interface UnregisteredSubmission {
  id: string;
  sender_raw: string | null;
  sender_phone: string | null;
  message_text: string | null;
  receipt_image_url: string | null;
  status: string;
  created_at: string;
}

interface Employee {
  id: string;
  name: string;
  phone_number: string;
}

const NotificationsPage = () => {
  const { notifications, markAsRead, markAllAsRead, unreadCount, refreshNotifications } = useNotifications();
  const { profile, companies, selectedCompanyId } = useAuth();
  const navigate = useNavigate();
  const [typeFilter, setTypeFilter] = useState('all');
  const [readFilter, setReadFilter] = useState('all');
  const [submissions, setSubmissions] = useState<UnregisteredSubmission[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [reviewLoading, setReviewLoading] = useState(false);
  const [selectedEmployees, setSelectedEmployees] = useState<Record<string, string>>({});
  const [newEmployeeNames, setNewEmployeeNames] = useState<Record<string, string>>({});
  const [resolvingId, setResolvingId] = useState<string | null>(null);
  const reviewQueueRef = useRef<HTMLElement | null>(null);

  const filtered = notifications.filter(n => {
    if (typeFilter !== 'all' && n.type !== typeFilter) return false;
    if (readFilter === 'unread' && n.is_read) return false;
    if (readFilter === 'read' && !n.is_read) return false;
    return true;
  });

  const selectedRole = useMemo(() => (
    companies?.find(company => company.id === selectedCompanyId)?.role || profile?.role || 'employee'
  ), [companies, profile?.role, selectedCompanyId]);
  const canReviewWhatsapp = !!selectedCompanyId && (
    profile?.super_admin === true || ['admin', 'finance', 'manager', 'coordinator'].includes(selectedRole || '')
  );

  const refreshReviewQueue = useCallback(async () => {
    if (!selectedCompanyId || !canReviewWhatsapp) {
      setSubmissions([]);
      setEmployees([]);
      return;
    }
    setReviewLoading(true);
    try {
      const [submissionData, peopleData] = await Promise.all([
        apiRequest<{ submissions: UnregisteredSubmission[] }>(
          `/api/tex/unregistered-whatsapp?company_id=${encodeURIComponent(selectedCompanyId)}&status=open`,
        ),
        apiRequest<{ employees: Employee[] }>(
          `/api/tex/people/bootstrap?company_id=${encodeURIComponent(selectedCompanyId)}`,
        ),
      ]);
      setSubmissions(submissionData.submissions ?? []);
      setEmployees((peopleData.employees ?? []).filter(employee => employee.id && employee.name));
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load WhatsApp review queue');
    } finally {
      setReviewLoading(false);
    }
  }, [canReviewWhatsapp, selectedCompanyId]);

  useEffect(() => {
    refreshReviewQueue();
  }, [refreshReviewQueue]);

  const resolveSubmission = async (submission: UnregisteredSubmission, mode: 'existing_employee' | 'new_employee') => {
    setResolvingId(submission.id);
    try {
      const payload = mode === 'existing_employee'
        ? {
            mode,
            employee_id: selectedEmployees[submission.id],
          }
        : {
            mode,
            employee_name: newEmployeeNames[submission.id],
            phone_number: submission.sender_phone || submission.sender_raw || '',
          };
      if (mode === 'existing_employee' && !payload.employee_id) {
        toast.error('Select an employee first');
        return;
      }
      if (mode === 'new_employee' && !payload.employee_name) {
        toast.error('Enter the employee name first');
        return;
      }
      await apiRequest(`/api/tex/unregistered-whatsapp/${submission.id}/resolve`, {
        method: 'PATCH',
        body: JSON.stringify(payload),
      });
      toast.success('WhatsApp receipt assigned');
      await Promise.all([refreshReviewQueue(), refreshNotifications()]);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to assign receipt');
    } finally {
      setResolvingId(null);
    }
  };

  const ignoreSubmission = async (submission: UnregisteredSubmission) => {
    setResolvingId(submission.id);
    try {
      await apiRequest(`/api/tex/unregistered-whatsapp/${submission.id}/ignore`, {
        method: 'PATCH',
        body: JSON.stringify({ reason: 'Ignored from notification center' }),
      });
      toast.success('Submission ignored');
      await Promise.all([refreshReviewQueue(), refreshNotifications()]);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to ignore submission');
    } finally {
      setResolvingId(null);
    }
  };

  const handleClick = async (n: Notification) => {
    if (!n.is_read) await markAsRead(n.id);
    if (n.type === 'wappfly_unregistered') {
      setTypeFilter('wappfly_unregistered');
      await refreshReviewQueue();
      reviewQueueRef.current?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    } else if (n.related_expense_id) navigate(`/expenses?highlight=${n.related_expense_id}`);
    else if (n.related_trip_id) navigate(`/trips`);
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Notifications</h1>
        {unreadCount > 0 && (
          <Button variant="outline" size="sm" onClick={markAllAsRead}>Mark all as read</Button>
        )}
      </div>

      {canReviewWhatsapp && (
        <section ref={reviewQueueRef} className="rounded-lg border bg-card">
          <div className="flex items-center justify-between gap-3 border-b px-5 py-4">
            <div>
              <h2 className="text-base font-semibold text-foreground">Unregistered WhatsApp Receipts</h2>
              <p className="text-sm text-muted-foreground">Assign unknown senders to an employee or add the sender as a new employee.</p>
            </div>
            <Button variant="outline" size="sm" onClick={refreshReviewQueue} disabled={reviewLoading}>
              Refresh
            </Button>
          </div>
          {submissions.length === 0 ? (
            <div className="px-5 py-8 text-sm text-muted-foreground">
              {reviewLoading ? 'Loading WhatsApp review queue...' : 'No unregistered WhatsApp receipts waiting for review.'}
            </div>
          ) : (
            <div className="divide-y">
              {submissions.map(submission => (
                <div key={submission.id} className="grid gap-4 px-5 py-4 lg:grid-cols-[180px_1fr_360px]">
                  <div className="space-y-2">
                    <Badge variant="outline" className="border-amber-300 bg-amber-50 text-amber-700">
                      Unknown sender
                    </Badge>
                    <div className="text-sm font-medium text-foreground">{submission.sender_phone || submission.sender_raw || 'Unknown number'}</div>
                    <div className="text-xs text-muted-foreground">
                      {formatDistanceToNow(new Date(submission.created_at), { addSuffix: true })}
                    </div>
                  </div>
                  <div className="min-w-0 space-y-3">
                    {submission.receipt_image_url ? (
                      <button
                        type="button"
                        onClick={() => window.open(submission.receipt_image_url!, '_blank', 'noopener,noreferrer')}
                        className="block w-full max-w-52 overflow-hidden rounded-md border bg-muted"
                      >
                        <img src={submission.receipt_image_url} alt="Unregistered WhatsApp receipt" className="h-36 w-full object-contain" />
                      </button>
                    ) : (
                      <div className="flex h-24 max-w-52 items-center justify-center rounded-md border bg-muted text-xs text-muted-foreground">
                        No receipt image
                      </div>
                    )}
                    {submission.message_text && (
                      <p className="text-sm text-muted-foreground">{submission.message_text}</p>
                    )}
                  </div>
                  <div className="space-y-4">
                    <div className="space-y-2">
                      <Label>Assign to existing employee</Label>
                      <div className="flex gap-2">
                        <Select
                          value={selectedEmployees[submission.id] || ''}
                          onValueChange={value => setSelectedEmployees(prev => ({ ...prev, [submission.id]: value }))}
                        >
                          <SelectTrigger><SelectValue placeholder="Select employee" /></SelectTrigger>
                          <SelectContent>
                            {employees.map(employee => (
                              <SelectItem key={employee.id} value={employee.id}>
                                {employee.name} - {employee.phone_number}
                              </SelectItem>
                            ))}
                          </SelectContent>
                        </Select>
                        <Button
                          size="icon"
                          variant="outline"
                          title="Assign receipt"
                          disabled={resolvingId === submission.id}
                          onClick={() => resolveSubmission(submission, 'existing_employee')}
                        >
                          <Link2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <div className="space-y-2">
                      <Label>Add sender as employee</Label>
                      <div className="flex gap-2">
                        <Input
                          value={newEmployeeNames[submission.id] || ''}
                          onChange={event => setNewEmployeeNames(prev => ({ ...prev, [submission.id]: event.target.value }))}
                          placeholder="Employee name"
                        />
                        <Button
                          size="icon"
                          title="Add employee and assign receipt"
                          disabled={resolvingId === submission.id}
                          onClick={() => resolveSubmission(submission, 'new_employee')}
                        >
                          <UserPlus className="h-4 w-4" />
                        </Button>
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="text-muted-foreground"
                      disabled={resolvingId === submission.id}
                      onClick={() => ignoreSubmission(submission)}
                    >
                      <EyeOff className="mr-2 h-4 w-4" />
                      Ignore
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>
      )}

      {/* Filters */}
      <div className="flex gap-3">
        <Select value={typeFilter} onValueChange={setTypeFilter}>
          <SelectTrigger className="w-48"><SelectValue placeholder="All types" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All types</SelectItem>
            {Object.entries(typeLabels).map(([k, v]) => (
              <SelectItem key={k} value={k}>{v}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select value={readFilter} onValueChange={setReadFilter}>
          <SelectTrigger className="w-36"><SelectValue placeholder="All" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="all">All</SelectItem>
            <SelectItem value="unread">Unread</SelectItem>
            <SelectItem value="read">Read</SelectItem>
          </SelectContent>
        </Select>
      </div>

      {/* List */}
      <div className="bg-card rounded-lg border divide-y divide-border">
        {filtered.length === 0 ? (
          <div className="text-center py-12 text-muted-foreground">
            <Bell className="h-8 w-8 mx-auto mb-2 opacity-50" />
            <p className="text-sm">No notifications found</p>
          </div>
        ) : filtered.map(n => {
          const Icon = typeIcons[n.type] ?? Bell;
          const iconColor = typeColors[n.type] ?? 'text-muted-foreground';
          return (
            <button
              key={n.id}
              onClick={() => handleClick(n)}
              className={cn(
                'w-full text-left px-5 py-4 hover:bg-accent/50 transition-colors flex gap-4',
                !n.is_read && 'border-l-3 border-l-primary bg-primary/5'
              )}
            >
              <div className={cn('mt-0.5 shrink-0', iconColor)}>
                <Icon className="h-5 w-5" />
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex items-center gap-2">
                  <p className={cn('text-sm', !n.is_read ? 'font-semibold text-foreground' : 'font-medium text-foreground/80')}>{n.title}</p>
                  <Badge variant="outline" className="text-[10px] capitalize">{typeLabels[n.type] ?? n.type}</Badge>
                </div>
                <p className="text-sm text-muted-foreground mt-0.5">{n.body}</p>
                <p className="text-xs text-muted-foreground/60 mt-1">
                  {formatDistanceToNow(new Date(n.created_at), { addSuffix: true })}
                </p>
              </div>
              {!n.is_read && <div className="h-2.5 w-2.5 rounded-full bg-primary mt-1.5 shrink-0" />}
            </button>
          );
        })}
      </div>
    </div>
  );
};

export default NotificationsPage;
