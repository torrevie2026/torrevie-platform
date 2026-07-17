import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import { format, differenceInDays } from 'date-fns';
import { toast } from 'sonner';
import { AlertTriangle, Check, Clock, MapPin, X } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { expenseApprovalBlockReason } from '@/lib/expenseApproval';

type Expense = {
  id: string;
  date: string;
  vendor: string | null;
  employee_name: string | null;
  employee_phone: string | null;
  category: string | null;
  amount: number;
  currency: string;
  base_amount: number | null;
  status: string | null;
  source: string | null;
  policy_flag: boolean | null;
  policy_flag_reason: string | null;
  receipt_image_url: string | null;
  notes: string | null;
  payment_method: string | null;
  trip_id: string | null;
  trip_name: string | null;
  created_at: string | null;
  employee_id: string | null;
  company_id: string;
  rejected_reason: string | null;
};

type TripOption = { id: string; name: string; status?: string | null };

const NO_TRIP = '__no_trip__';

const statusBadge = (status: string | null) => {
  if (status === 'approved') return 'bg-green-100 text-green-800 border-green-200';
  if (status === 'rejected') return 'bg-red-100 text-red-800 border-red-200';
  if (status === 'paid') return 'bg-teal-100 text-teal-800 border-teal-200';
  return 'bg-amber-100 text-amber-800 border-amber-200';
};

const money = (value: number | null | undefined) => Number(value ?? 0).toFixed(2);

const MyTeam = () => {
  const { user, profile, selectedCompanyId, hasDirectReports, companies } = useAuth();
  const selectedCompany = companies?.find((item) => item.id === selectedCompanyId);
  const effectiveRole = selectedCompany?.role || profile?.role || 'employee';
  const isAdmin = effectiveRole === 'admin' || profile?.super_admin === true;
  const canViewQueue = isAdmin || ['manager', 'coordinator', 'finance'].includes(effectiveRole) || hasDirectReports;
  const canApprove = isAdmin || effectiveRole === 'manager';

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [myExpenses, setMyExpenses] = useState<Expense[]>([]);
  const [company, setCompany] = useState<{ base_currency: string } | null>(null);
  const [managerName, setManagerName] = useState<string | null>(null);
  const [trips, setTrips] = useState<TripOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [approveModal, setApproveModal] = useState<{ expenses: Expense[]; name: string } | null>(null);
  const [rejectingId, setRejectingId] = useState<string | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [detailExpense, setDetailExpense] = useState<Expense | null>(null);

  const baseCurrency = company?.base_currency ?? selectedCompany?.base_currency ?? 'AED';

  const fetchData = async () => {
    if (!selectedCompanyId || !user) {
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      const [tripData, pendingData, ownData] = await Promise.all([
        apiRequest<{ company: { base_currency: string } | null; trips: TripOption[] }>(
          `/api/tex/trips?company_id=${encodeURIComponent(selectedCompanyId)}`,
        ),
        canViewQueue
          ? apiRequest<{ expenses: Expense[] }>(
              `/api/tex/expenses?company_id=${encodeURIComponent(selectedCompanyId)}&status=pending&page_size=100`,
            )
          : Promise.resolve({ expenses: [] }),
        apiRequest<{ expenses: Expense[] }>(
          `/api/tex/expenses?company_id=${encodeURIComponent(selectedCompanyId)}&mine=true&page_size=10`,
        ),
      ]);

      setCompany(tripData.company);
      setTrips(tripData.trips ?? []);
      setExpenses(pendingData.expenses ?? []);
      setMyExpenses(ownData.expenses ?? []);

      if (profile?.manager_id) {
        const managerData = await apiRequest<{ profiles: { id: string; full_name: string | null }[] }>(
          `/api/tex/profiles/names?ids=${encodeURIComponent(profile.manager_id)}`,
        );
        setManagerName(managerData.profiles?.[0]?.full_name ?? null);
      } else {
        setManagerName(null);
      }
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to load team expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, [selectedCompanyId, user, canViewQueue, profile?.manager_id]);

  const pendingTotal = expenses.reduce((sum, expense) => sum + (expense.base_amount ?? expense.amount), 0);
  const myPendingCount = myExpenses.filter((expense) => expense.status === 'pending').length;

  const byEmployee = useMemo(() => {
    const grouped: Record<string, { expenses: Expense[]; phone: string | null }> = {};
    for (const expense of expenses) {
      const name = expense.employee_name ?? 'Unknown';
      if (!grouped[name]) grouped[name] = { expenses: [], phone: expense.employee_phone };
      grouped[name].expenses.push(expense);
    }
    return grouped;
  }, [expenses]);

  const toggleSelect = (id: string) => {
    const next = new Set(selected);
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  };

  const handleAssignTrip = async (expense: Expense, nextTripId: string | null) => {
    try {
      await apiRequest(`/api/tex/expenses/${expense.id}/trip`, {
        method: 'PATCH',
        body: JSON.stringify({ trip_id: nextTripId }),
      });
      toast.success(nextTripId ? 'Trip assigned' : 'Trip removed');
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to assign trip');
    }
  };

  const handleApprove = async (expense: Expense) => {
    if (!canApprove) {
      toast.error('Only admins and managers can approve expenses');
      return;
    }
    const blockReason = expenseApprovalBlockReason(expense);
    if (blockReason) {
      toast.error(blockReason);
      return;
    }
    try {
      await apiRequest(`/api/tex/expenses/${expense.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      });
      toast.success('Expense approved');
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to approve expense');
    }
  };

  const handleBulkApprove = async () => {
    if (!approveModal || !canApprove) return;
    const blocked = approveModal.expenses.filter((expense) => expenseApprovalBlockReason(expense));
    if (blocked.length > 0) {
      toast.error(`${blocked.length} expense${blocked.length > 1 ? 's need' : ' needs'} a trip or general category before approval`);
      return;
    }
    try {
      for (const expense of approveModal.expenses) {
        await apiRequest(`/api/tex/expenses/${expense.id}/status`, {
          method: 'PATCH',
          body: JSON.stringify({ status: 'approved' }),
        });
      }
      toast.success(`${approveModal.expenses.length} expense(s) approved for ${approveModal.name}`);
      setApproveModal(null);
      setSelected(new Set());
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to approve selected expenses');
    }
  };

  const handleReject = async () => {
    if (!rejectingId || !rejectReason.trim()) return;
    const expense = expenses.find((item) => item.id === rejectingId);
    if (!expense) return;
    try {
      await apiRequest(`/api/tex/expenses/${expense.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected', reason: rejectReason.trim() }),
      });
      toast.success('Expense rejected');
      setRejectingId(null);
      setRejectReason('');
      await fetchData();
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Unable to reject expense');
    }
  };

  if (loading) {
    return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;
  }

  if (!canViewQueue) {
    return <div className="text-center py-20 text-muted-foreground">You do not have any team expenses to review.</div>;
  }

  const renderTripSelector = (expense: Expense) => (
    <Select
      value={expense.trip_id || NO_TRIP}
      onValueChange={(value) => handleAssignTrip(expense, value === NO_TRIP ? null : value)}
    >
      <SelectTrigger className="h-8 w-full sm:w-[220px]" onClick={(event) => event.stopPropagation()}>
        <SelectValue placeholder="Select trip" />
      </SelectTrigger>
      <SelectContent>
        <SelectItem value={NO_TRIP}>No trip</SelectItem>
        {trips.map((trip) => (
          <SelectItem key={trip.id} value={trip.id}>{trip.name}</SelectItem>
        ))}
      </SelectContent>
    </Select>
  );

  const selectedExpenses = expenses.filter((expense) => selected.has(expense.id));
  const selectedBlocked = selectedExpenses.some((expense) => !!expenseApprovalBlockReason(expense));

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">My Team</h1>

      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <Card className={cn(expenses.length > 0 && 'border-amber-300')}>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Awaiting review</p>
            <p className={cn('text-2xl font-bold mt-1', expenses.length > 0 ? 'text-amber-600' : 'text-foreground')}>{expenses.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{baseCurrency} {money(pendingTotal)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">My own expenses pending</p>
            <p className="text-2xl font-bold text-foreground mt-1">{myPendingCount}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Your approver</p>
            <p className="text-lg font-semibold text-foreground mt-1">{managerName ?? (profile?.is_ceo ? 'CEO - direct to finance' : 'Not assigned')}</p>
          </CardContent>
        </Card>
      </div>

      {selected.size > 0 && (
        <div className="flex flex-wrap items-center gap-3 p-3 bg-primary/5 border border-primary/20 rounded-lg">
          <span className="text-sm font-medium">{selected.size} selected</span>
          {canApprove && (
            <Button
              size="sm"
              className="bg-green-600 hover:bg-green-700 text-white"
              disabled={selectedBlocked}
              onClick={() => {
                if (selectedExpenses.length === 0) return;
                setApproveModal({ expenses: selectedExpenses, name: selectedExpenses[0].employee_name ?? 'Unknown' });
              }}
            >
              <Check className="h-3 w-3 mr-1" /> Approve selected
            </Button>
          )}
          {selectedBlocked && <span className="text-xs text-muted-foreground">Selection needs a trip or general category</span>}
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {Object.entries(byEmployee).length === 0 ? (
        <Card>
          <CardContent className="p-8 text-center text-muted-foreground">
            <Check className="h-8 w-8 mx-auto mb-2 text-green-600" />
            <p>All caught up - no expenses awaiting review.</p>
          </CardContent>
        </Card>
      ) : Object.entries(byEmployee).map(([name, data]) => (
        <div key={name} className="space-y-3">
          <div className="flex items-center justify-between gap-3">
            <div>
              <h3 className="text-base font-semibold text-foreground">{name}</h3>
              <p className="text-xs text-muted-foreground">
                {data.expenses.length} pending - {baseCurrency} {money(data.expenses.reduce((sum, item) => sum + (item.base_amount ?? item.amount), 0))}
              </p>
            </div>
            {canApprove && (
              <Button
                size="sm"
                className="bg-green-600 hover:bg-green-700 text-white"
                disabled={data.expenses.some((expense) => !!expenseApprovalBlockReason(expense))}
                onClick={() => setApproveModal({ expenses: data.expenses, name })}
              >
                <Check className="h-3 w-3 mr-1" /> Approve all
              </Button>
            )}
          </div>

          {data.expenses.some((expense) => !!expenseApprovalBlockReason(expense)) && (
            <p className="text-xs text-muted-foreground">Some expenses need a trip or a general/maintenance category before approval.</p>
          )}

          {data.expenses.map((expense) => {
            const blockReason = expenseApprovalBlockReason(expense);
            return (
              <div
                key={expense.id}
                className="bg-card border rounded-lg p-4 cursor-pointer hover:bg-muted/30 transition-colors"
                onClick={() => setDetailExpense(expense)}
              >
                <div className="flex flex-col lg:flex-row gap-4">
                  <div className="flex items-start gap-2" onClick={(event) => event.stopPropagation()}>
                    <Checkbox checked={selected.has(expense.id)} onCheckedChange={() => toggleSelect(expense.id)} className="mt-1" />
                    {expense.receipt_image_url ? (
                      <img
                        src={expense.receipt_image_url}
                        alt="Receipt"
                        className="w-20 h-20 object-cover rounded-md border cursor-pointer hover:opacity-80"
                        onClick={(event) => {
                          event.stopPropagation();
                          setLightboxUrl(expense.receipt_image_url);
                        }}
                      />
                    ) : (
                      <div className="w-20 h-20 bg-muted rounded-md border flex items-center justify-center">
                        <span className="text-xs text-muted-foreground">No receipt</span>
                      </div>
                    )}
                  </div>

                  <div className="flex-1 min-w-0">
                    <div className="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-foreground">{expense.vendor ?? 'No vendor'}</p>
                        <p className="text-xs text-muted-foreground">
                          {format(new Date(expense.date), 'dd MMM yyyy')} - {expense.category ?? 'Uncategorized'} - {expense.payment_method ?? 'No payment method'}
                        </p>
                      </div>
                      <div className="sm:text-right">
                        <p className="text-sm font-semibold text-foreground">{baseCurrency} {money(expense.base_amount ?? expense.amount)}</p>
                        {expense.currency !== baseCurrency && <p className="text-xs text-muted-foreground">{expense.currency} {money(expense.amount)}</p>}
                      </div>
                    </div>

                    <div className="flex flex-wrap items-center gap-2 mt-3" onClick={(event) => event.stopPropagation()}>
                      {renderTripSelector(expense)}
                      <Badge variant="outline" className="text-[10px]">{expense.source === 'whatsapp' ? 'WhatsApp' : 'Web'}</Badge>
                      {expense.policy_flag && (
                        <Badge variant="destructive" className="text-[10px]">
                          <AlertTriangle className="h-2.5 w-2.5 mr-0.5" />{expense.policy_flag_reason ?? 'Policy flag'}
                        </Badge>
                      )}
                      <span className={cn('text-[10px] font-medium', differenceInDays(new Date(), new Date(expense.date)) > 7 ? 'text-destructive' : 'text-muted-foreground')}>
                        <Clock className="h-2.5 w-2.5 inline mr-0.5" />{differenceInDays(new Date(), new Date(expense.date))}d ago
                      </span>
                    </div>
                    {blockReason && <p className="text-xs text-amber-700 mt-2">{blockReason}</p>}
                    {expense.notes && <p className="text-xs text-muted-foreground mt-1.5 italic">"{expense.notes}"</p>}
                  </div>

                  <div className="flex lg:flex-col gap-1.5 flex-shrink-0" onClick={(event) => event.stopPropagation()}>
                    {canApprove && (
                      <Button
                        size="sm"
                        className="h-8 w-8 p-0 bg-green-600 hover:bg-green-700 text-white disabled:opacity-40"
                        disabled={!!blockReason}
                        title={blockReason ?? 'Approve'}
                        onClick={() => handleApprove(expense)}
                      >
                        <Check className="h-4 w-4" />
                      </Button>
                    )}
                    <Button size="sm" variant="destructive" className="h-8 w-8 p-0" onClick={() => setRejectingId(expense.id)}>
                      <X className="h-4 w-4" />
                    </Button>
                  </div>
                </div>

                {rejectingId === expense.id && (
                  <div className="mt-3 flex gap-2 items-end border-t pt-3" onClick={(event) => event.stopPropagation()}>
                    <div className="flex-1">
                      <label className="text-xs font-medium text-muted-foreground mb-1 block">Rejection reason</label>
                      <Input placeholder="Enter reason..." value={rejectReason} onChange={(event) => setRejectReason(event.target.value)} className="h-8 text-sm" />
                    </div>
                    <Button size="sm" variant="destructive" className="h-8" disabled={!rejectReason.trim()} onClick={handleReject}>Confirm</Button>
                    <Button size="sm" variant="ghost" className="h-8" onClick={() => { setRejectingId(null); setRejectReason(''); }}>Cancel</Button>
                  </div>
                )}
              </div>
            );
          })}
        </div>
      ))}

      {myExpenses.length > 0 && (
        <Card className="mt-8">
          <CardHeader className="pb-2">
            <CardTitle className="text-base">My Own Expenses</CardTitle>
            {managerName && <p className="text-xs text-muted-foreground">Your expenses are approved by: {managerName}</p>}
          </CardHeader>
          <CardContent className="space-y-2">
            {myExpenses.map((expense) => (
              <div
                key={expense.id}
                className="flex items-center justify-between py-2.5 border-b border-border last:border-0 cursor-pointer hover:bg-muted/50 rounded px-2 -mx-2 transition-colors"
                onClick={() => setDetailExpense(expense)}
              >
                <div>
                  <p className="text-sm font-medium text-foreground">{expense.vendor ?? 'No vendor'}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(expense.date), 'dd MMM yyyy')} - {expense.category ?? 'Uncategorized'}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{baseCurrency} {money(expense.base_amount ?? expense.amount)}</span>
                  <Badge variant="outline" className={cn('capitalize text-[10px] px-1.5 py-0', statusBadge(expense.status))}>{expense.status ?? 'pending'}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      <Dialog open={!!approveModal} onOpenChange={(open) => { if (!open) setApproveModal(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Approve expenses</DialogTitle>
            <DialogDescription>
              Approve {approveModal?.expenses.length} expense(s) totalling {baseCurrency} {money(approveModal?.expenses.reduce((sum, item) => sum + (item.base_amount ?? item.amount), 0) ?? 0)} for {approveModal?.name}?
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setApproveModal(null)}>Cancel</Button>
            <Button className="bg-green-600 hover:bg-green-700 text-white" disabled={!!approveModal?.expenses.some((expense) => !!expenseApprovalBlockReason(expense))} onClick={handleBulkApprove}>Approve all</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lightboxUrl} onOpenChange={(open) => { if (!open) setLightboxUrl(null); }}>
        <DialogContent className="max-w-3xl p-2">
          {lightboxUrl && <img src={lightboxUrl} alt="Receipt" className="w-full h-auto rounded-lg" />}
        </DialogContent>
      </Dialog>

      <Dialog open={!!detailExpense} onOpenChange={(open) => { if (!open) setDetailExpense(null); }}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{detailExpense?.vendor ?? 'Expense Details'}</DialogTitle>
            <DialogDescription>{detailExpense && format(new Date(detailExpense.date), 'dd MMM yyyy')}</DialogDescription>
          </DialogHeader>
          {detailExpense && (
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-3 text-sm">
                <div>
                  <p className="text-muted-foreground">Amount</p>
                  <p className="font-semibold text-foreground">{baseCurrency} {money(detailExpense.base_amount ?? detailExpense.amount)}</p>
                  {detailExpense.currency !== baseCurrency && <p className="text-xs text-muted-foreground">{detailExpense.currency} {money(detailExpense.amount)}</p>}
                </div>
                <div>
                  <p className="text-muted-foreground">Status</p>
                  <Badge variant="outline" className={cn('capitalize mt-0.5', statusBadge(detailExpense.status))}>{detailExpense.status ?? 'pending'}</Badge>
                </div>
                <div>
                  <p className="text-muted-foreground">Category</p>
                  <p className="font-medium text-foreground">{detailExpense.category ?? 'Uncategorized'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Payment Method</p>
                  <p className="font-medium text-foreground">{detailExpense.payment_method ?? '-'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Trip</p>
                  <p className="font-medium text-foreground flex items-center gap-1"><MapPin className="h-3 w-3" />{detailExpense.trip_name ?? 'Not assigned'}</p>
                </div>
                <div>
                  <p className="text-muted-foreground">Source</p>
                  <p className="font-medium text-foreground">{detailExpense.source === 'whatsapp' ? 'WhatsApp' : 'Web'}</p>
                </div>
              </div>
              {detailExpense.notes && (
                <div>
                  <p className="text-sm text-muted-foreground">Notes</p>
                  <p className="text-sm text-foreground italic">"{detailExpense.notes}"</p>
                </div>
              )}
              {detailExpense.policy_flag && (
                <div className="flex items-center gap-1.5 text-sm text-destructive">
                  <AlertTriangle className="h-4 w-4" />
                  <span>{detailExpense.policy_flag_reason ?? 'Policy flag'}</span>
                </div>
              )}
              {detailExpense.rejected_reason && (
                <div className="bg-destructive/10 border border-destructive/20 rounded-md p-3">
                  <p className="text-sm font-medium text-destructive">Rejection Reason</p>
                  <p className="text-sm text-foreground mt-1">{detailExpense.rejected_reason}</p>
                </div>
              )}
              {detailExpense.receipt_image_url && (
                <div>
                  <p className="text-sm text-muted-foreground mb-1">Receipt</p>
                  <img
                    src={detailExpense.receipt_image_url}
                    alt="Receipt"
                    className="w-full max-h-64 object-contain rounded-md border cursor-pointer hover:opacity-80"
                    onClick={() => {
                      setDetailExpense(null);
                      setLightboxUrl(detailExpense.receipt_image_url);
                    }}
                  />
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default MyTeam;
