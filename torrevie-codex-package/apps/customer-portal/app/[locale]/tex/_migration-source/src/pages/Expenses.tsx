import React, { useState, useEffect } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import { format } from 'date-fns';
import { Receipt, Search, X, AlertTriangle, Eye, Pencil, Trash2, ChevronLeft, ChevronRight, MessageCircle, Image as ImageIcon, Check, XCircle, Download, CheckSquare } from 'lucide-react';
import OfflineQueueBanner from '@/components/OfflineQueueBanner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { expenseApprovalBlockReason } from '@/lib/expenseApproval';
import { Link, useSearchParams } from 'react-router-dom';
import EditExpenseForm from '@/components/expenses/EditExpenseForm';

const PAGE_SIZE = 25;

/** Return the image URL (use original since render/image transforms may not be available) */
const toThumbnail = (url: string, _width: number) => url;

const CATEGORIES = ['Travel', 'Fuel', 'Meals', 'Accommodation', 'Office', 'Office Supplies', 'Repairs', 'Maintenance', 'General', 'Logistics', 'Other'];

type Expense = {
  id: string; date: string; vendor: string | null; employee_name: string | null;
  trip_name: string | null; category: string | null; amount: number; currency: string;
  base_amount: number | null; status: string | null; source: string | null;
  policy_flag: boolean | null; policy_flag_reason: string | null;
  receipt_image_url: string | null; notes: string | null; payment_method: string | null;
  expense_type: string | null; tax_amount: number | null; tax_id_number: string | null;
  exchange_rate: number | null; employee_phone: string | null; employee_id: string | null;
  trip_id: string | null; company_id: string; created_at: string | null;
  approved_at: string | null; approved_by: string | null;
  rejected_at: string | null; rejected_by: string | null; rejected_reason: string | null;
  finance_reviewed_at: string | null; finance_reviewed_by: string | null;
  paid_at: string | null; paid_by: string | null;
};

const statusColor = (s: string | null) => {
  if (s === 'approved') return 'bg-green-100 text-green-800 border-green-200';
  if (s === 'rejected') return 'bg-red-100 text-red-800 border-red-200';
  if (s === 'paid') return 'bg-teal-100 text-teal-800 border-teal-200';
  if (s === 'draft') return 'bg-muted text-muted-foreground border-border';
  return 'bg-amber-100 text-amber-800 border-amber-200';
};

const Expenses = () => {
  const { user, profile, selectedCompanyId } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.super_admin;
  const isCoordinator = profile?.role === 'coordinator';
  const canViewOthers = isAdmin || profile?.role === 'finance' || profile?.role === 'manager' || isCoordinator;
  const [searchParams, setSearchParams] = useSearchParams();

  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(0);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filters — initialize from URL params
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();
  const [tripFilter, setTripFilter] = useState(searchParams.get('trip') ?? 'all');
  const [categoryFilter, setCategoryFilter] = useState('all');
  const [statusFilter, setStatusFilter] = useState(searchParams.get('status') ?? 'all');
  const [employeeFilter, setEmployeeFilter] = useState('all');
  const [teamFilter, setTeamFilter] = useState<string>(searchParams.get('team') ?? '');
  const [teamName, setTeamName] = useState<string>('');
  const [teamMemberIds, setTeamMemberIds] = useState<string[] | null>(null);
  const [search, setSearch] = useState('');

  // Reject modal
  const [rejectExpense, setRejectExpense] = useState<Expense | null>(null);
  const [rejectReason, setRejectReason] = useState('');

  // Lookup data
  const [trips, setTrips] = useState<{ id: string; name: string }[]>([]);
  const [employees, setEmployees] = useState<{ id: string; name: string; phone_number?: string | null }[]>([]);
  const [company, setCompany] = useState<{ base_currency: string } | null>(null);

  // Detail / delete state
  const [selectedExpense, setSelectedExpense] = useState<Expense | null>(null);
  const [editMode, setEditMode] = useState(false);
  const [deleteExpense, setDeleteExpense] = useState<Expense | null>(null);
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [approverNames, setApproverNames] = useState<Record<string, string>>({});

  const canEditExpense = (exp: Expense): boolean => {
    if (!profile) return false;
    if (exp.status !== 'pending' && exp.status !== 'approved' && exp.status !== 'paid') return false;
    if (profile.super_admin || profile.role === 'admin') {
      return exp.status === 'pending' || exp.status === 'approved' || exp.status === 'paid';
    }
    if (profile.role === 'finance') {
      return exp.status === 'pending' || exp.status === 'approved' || exp.status === 'paid';
    }
    if (profile.role === 'manager') {
      return exp.status === 'pending';
    }
    if (profile.role === 'coordinator') {
      return exp.status === 'pending';
    }
    // Employees: only their own pending
    return exp.status === 'pending' && exp.employee_name === profile.full_name;
  };
  const canChangeExpenseEmployee = (exp: Expense): boolean => {
    if (!canEditExpense(exp) || !profile) return false;
    return profile.super_admin === true || ['admin', 'finance', 'manager', 'coordinator'].includes(profile.role || '');
  };

  useEffect(() => {
    if (!selectedCompanyId) return;
    const load = async () => {
      const data = await apiRequest<{
        company: { base_currency: string } | null;
        trips: { id: string; name: string }[];
        employees: { id: string; name: string; phone_number?: string | null }[];
      }>(`/api/tex/expenses/bootstrap?company_id=${encodeURIComponent(selectedCompanyId)}`);
      setTrips(data.trips ?? []);
      setEmployees(data.employees ?? []);
      setCompany(data.company);
    };
    load().catch((error) => toast.error((error as Error).message || 'Failed to load expense filters'));
  }, [selectedCompanyId]);

  // Load team members + name when teamFilter is set
  useEffect(() => {
    if (!teamFilter) { setTeamMemberIds(null); setTeamName(''); return; }
    let cancelled = false;
    (async () => {
      if (!selectedCompanyId) return;
      const data = await apiRequest<{ team: { name: string } | null; members: Array<{ employee_id: string }> }>(
        `/api/tex/expenses/team?company_id=${encodeURIComponent(selectedCompanyId)}&team_id=${encodeURIComponent(teamFilter)}`,
      );
      if (cancelled) return;
      setTeamMemberIds((data.members ?? []).map((m) => m.employee_id));
      setTeamName(data.team?.name ?? '');
    })();
    return () => { cancelled = true; };
  }, [teamFilter, selectedCompanyId]);

  const fetchExpenses = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);

    if (teamFilter && teamMemberIds !== null) {
      if (teamMemberIds.length === 0) {
        setExpenses([]); setTotal(0); setSelected(new Set()); setLoading(false); return;
      }
    }
    try {
      const params = new URLSearchParams({
        company_id: selectedCompanyId,
        page: String(page),
        page_size: String(PAGE_SIZE),
      });
      if (dateFrom) params.set('date_from', format(dateFrom, 'yyyy-MM-dd'));
      if (dateTo) params.set('date_to', format(dateTo, 'yyyy-MM-dd'));
      if (tripFilter !== 'all') params.set('trip_id', tripFilter);
      if (categoryFilter !== 'all') params.set('category', categoryFilter);
      if (statusFilter !== 'all') params.set('status', statusFilter);
      if (canViewOthers && employeeFilter !== 'all') params.set('employee_id', employeeFilter);
      if (teamFilter && teamMemberIds?.length) params.set('team_member_ids', teamMemberIds.join(','));
      if (search) params.set('search', search);

      const data = await apiRequest<{ expenses: Expense[]; total: number }>(`/api/tex/expenses?${params.toString()}`);
      setExpenses(data.expenses ?? []);
      setTotal(data.total ?? 0);
      setSelected(new Set());
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load expenses');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    // Wait for team members to load before fetching when team filter is active
    if (teamFilter && teamMemberIds === null) return;
    fetchExpenses();
  }, [selectedCompanyId, page, dateFrom, dateTo, tripFilter, categoryFilter, statusFilter, employeeFilter, search, teamFilter, teamMemberIds]);

  // Open detail/edit slide-over when URL has ?highlight=<id> or ?edit=<id>
  useEffect(() => {
    const highlightId = searchParams.get('highlight');
    const editId = searchParams.get('edit');
    const targetId = editId || highlightId;
    if (!targetId || !selectedCompanyId) return;
    let cancelled = false;
    (async () => {
      const data = await apiRequest<{ expense: Expense }>(
        `/api/tex/expenses/${encodeURIComponent(targetId)}?company_id=${encodeURIComponent(selectedCompanyId)}`,
      );
      if (cancelled || !data.expense) return;
      setSelectedExpense(data.expense);
      setEditMode(!!editId);
      const next = new URLSearchParams(searchParams);
      next.delete('edit');
      next.delete('highlight');
      setSearchParams(next, { replace: true });
    })().catch(() => null);
    return () => { cancelled = true; };
  }, [searchParams, selectedCompanyId]);

  const clearTeamFilter = () => {
    setTeamFilter('');
    setTeamMemberIds(null);
    setTeamName('');
    const next = new URLSearchParams(searchParams);
    next.delete('team');
    setSearchParams(next, { replace: true });
    setPage(0);
  };

  const clearFilters = () => {
    setDateFrom(undefined); setDateTo(undefined);
    setTripFilter('all'); setCategoryFilter('all');
    setStatusFilter('all'); setEmployeeFilter('all');
    setSearch(''); setPage(0);
    clearTeamFilter();
  };

  const hasFilters = dateFrom || dateTo || tripFilter !== 'all' || categoryFilter !== 'all' || statusFilter !== 'all' || employeeFilter !== 'all' || search || teamFilter;
  const totalPages = Math.ceil(total / PAGE_SIZE);

  const handleApprove = async (expense: Expense) => {
    const blockReason = expenseApprovalBlockReason(expense);
    if (blockReason) {
      toast.error(blockReason);
      return;
    }
    await apiRequest(`/api/tex/expenses/${expense.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'approved' }),
    });
    toast.success('Expense approved');
    setSelectedExpense(null);
    fetchExpenses();
  };

  const handleRejectConfirm = async () => {
    if (!rejectExpense || !rejectReason.trim()) return;
    await apiRequest(`/api/tex/expenses/${rejectExpense.id}/status`, {
      method: 'PATCH',
      body: JSON.stringify({ status: 'rejected', reason: rejectReason.trim() }),
    });
    toast.success('Expense rejected');
    setRejectExpense(null); setRejectReason('');
    setSelectedExpense(null);
    fetchExpenses();
  };

  const handleDelete = async () => {
    if (!deleteExpense) return;
    await apiRequest(`/api/tex/expenses/${deleteExpense.id}`, { method: 'DELETE' });
    toast.success('Expense deleted');
    setDeleteExpense(null);
    fetchExpenses();
  };

  // Bulk approve
  const handleBulkApprove = async () => {
    const pending = expenses.filter(e => selected.has(e.id) && e.status === 'pending');
    if (pending.length === 0) { toast.error('No pending expenses selected'); return; }
    const blocked = pending.filter(e => expenseApprovalBlockReason(e));
    if (blocked.length > 0) {
      toast.error(`${blocked.length} selected expense${blocked.length > 1 ? 's need' : ' needs'} a trip or general category before approval`);
      return;
    }
    for (const exp of pending) {
      await apiRequest(`/api/tex/expenses/${exp.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'approved' }),
      });
    }
    toast.success(`${pending.length} expense${pending.length > 1 ? 's' : ''} approved`);
    setSelected(new Set());
    fetchExpenses();
  };

  // Bulk export to CSV
  const handleBulkExport = () => {
    const rows = expenses.filter(e => selected.has(e.id));
    if (rows.length === 0) return;
    const headers = ['Date', 'Vendor', 'Employee', 'Category', 'Amount', 'Currency', 'Base Amount', 'Status', 'Source', 'Notes'];
    const csv = [
      headers.join(','),
      ...rows.map(e => [
        e.date, `"${(e.vendor ?? '').replace(/"/g, '""')}"`, `"${(e.employee_name ?? '').replace(/"/g, '""')}"`,
        e.category ?? '', e.amount, e.currency, e.base_amount ?? '', e.status ?? '',
        e.source ?? '', `"${(e.notes ?? '').replace(/"/g, '""')}"`
      ].join(','))
    ].join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url; a.download = `expenses-export-${format(new Date(), 'yyyy-MM-dd')}.csv`;
    a.click(); URL.revokeObjectURL(url);
    toast.success(`Exported ${rows.length} expense${rows.length > 1 ? 's' : ''}`);
  };

  const toggleSelect = (id: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selected.size === expenses.length) setSelected(new Set());
    else setSelected(new Set(expenses.map(e => e.id)));
  };

  // Fetch names for every actor referenced on the expense
  useEffect(() => {
    if (!selectedExpense) return;
    const ids = [
      selectedExpense.approved_by,
      selectedExpense.rejected_by,
      selectedExpense.finance_reviewed_by,
      selectedExpense.paid_by,
    ].filter((x): x is string => !!x && !approverNames[x]);
    if (ids.length === 0) return;
    apiRequest<{ profiles: Array<{ id: string; full_name: string | null }> }>(
      `/api/tex/profiles/names?ids=${encodeURIComponent(ids.join(','))}`,
    ).then(({ profiles }) => {
      setApproverNames(prev => {
        const next = { ...prev };
        for (const p of profiles ?? []) next[p.id] = p.full_name ?? 'Unknown';
        return next;
      });
    }).catch(() => null);
  }, [selectedExpense]);

  const selectedPendingCount = expenses.filter(e => selected.has(e.id) && e.status === 'pending').length;
  const selectedPendingBlockedCount = expenses.filter(e => selected.has(e.id) && e.status === 'pending' && expenseApprovalBlockReason(e)).length;

  return (
    <div>
      <OfflineQueueBanner onSyncComplete={fetchExpenses} />
      <div className="flex items-center justify-between mb-4">
        <h1 className="text-2xl font-bold text-foreground">Expenses</h1>
        <Button asChild><Link to="/expenses/new">+ New Expense</Link></Button>
      </div>

      {/* Filters */}
      <div className="bg-card rounded-lg border p-4 mb-4 grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-3 items-end">
        <DateFilter label="From" value={dateFrom} onChange={setDateFrom} />
        <DateFilter label="To" value={dateTo} onChange={setDateTo} />
        <FilterSelect label="Trip" value={tripFilter} onChange={v => { setTripFilter(v); setPage(0); }} options={[{ value: 'all', label: 'All trips' }, ...trips.map(t => ({ value: t.id, label: t.name }))]} />
        <FilterSelect label="Category" value={categoryFilter} onChange={v => { setCategoryFilter(v); setPage(0); }} options={[{ value: 'all', label: 'All categories' }, ...CATEGORIES.map(c => ({ value: c, label: c }))]} />
        <FilterSelect label="Status" value={statusFilter} onChange={v => { setStatusFilter(v); setPage(0); }} options={[{ value: 'all', label: 'All' }, { value: 'pending', label: 'Pending' }, { value: 'approved', label: 'Approved' }, { value: 'rejected', label: 'Rejected' }]} />
        {canViewOthers && <FilterSelect label="Employee" value={employeeFilter} onChange={v => { setEmployeeFilter(v); setPage(0); }} options={[{ value: 'all', label: 'All employees' }, ...employees.map(e => ({ value: e.id, label: e.name }))]} />}
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Search</label>
          <div className="relative">
            <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
            <Input className="pl-8" placeholder="Vendor / notes" value={search} onChange={e => { setSearch(e.target.value); setPage(0); }} />
          </div>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters} className="col-span-2 md:col-span-1"><X className="h-4 w-4 mr-1" />Clear</Button>
        )}
      </div>

      {teamFilter && (
        <div className="mb-4 flex items-center gap-2">
          <Badge variant="secondary" className="gap-1.5 pl-2.5 pr-1 py-1">
            <span>Team: <span className="font-semibold">{teamName || '…'}</span></span>
            <button onClick={clearTeamFilter} className="ml-1 rounded hover:bg-muted/60 p-0.5" aria-label="Clear team filter">
              <X className="h-3 w-3" />
            </button>
          </Badge>
        </div>
      )}

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4 flex items-center gap-3">
          <CheckSquare className="h-4 w-4 text-primary" />
          <span className="text-sm font-medium text-foreground">{selected.size} selected</span>
          {isAdmin && selectedPendingCount > 0 && (
            <Button size="sm" onClick={handleBulkApprove} disabled={selectedPendingBlockedCount > 0}>
              <Check className="h-3.5 w-3.5 mr-1" />Approve selected ({selectedPendingCount})
            </Button>
          )}
          {selectedPendingBlockedCount > 0 && (
            <span className="text-xs text-muted-foreground">
              {selectedPendingBlockedCount} need a trip or general category
            </span>
          )}
          <Button size="sm" variant="outline" onClick={handleBulkExport}>
            <Download className="h-3.5 w-3.5 mr-1" />Export selected
          </Button>
          <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
        </div>
      )}

      {/* Table */}
      <div className="bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead className="w-10">
                <Checkbox checked={expenses.length > 0 && selected.size === expenses.length} onCheckedChange={toggleAll} />
              </TableHead>
              <TableHead>Date</TableHead>
              <TableHead>Vendor</TableHead>
              {canViewOthers && <TableHead>Employee</TableHead>}
              <TableHead>Trip</TableHead>
              <TableHead>Category</TableHead>
              <TableHead className="text-right">Amount</TableHead>
              <TableHead className="text-right">Base Amount</TableHead>
              <TableHead>Status</TableHead>
              <TableHead>Source</TableHead>
              <TableHead></TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={canViewOthers ? 11 : 10} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
            ) : expenses.length === 0 ? (
              <TableRow><TableCell colSpan={canViewOthers ? 11 : 10} className="text-center py-8">
                <div className="flex flex-col items-center gap-2">
                  <Receipt className="h-8 w-8 text-muted-foreground" />
                  <p className="text-muted-foreground">No expenses found</p>
                </div>
              </TableCell></TableRow>
            ) : expenses.map(exp => (
              <TableRow key={exp.id} className="cursor-pointer" onClick={() => setSelectedExpense(exp)}>
                <TableCell onClick={e => e.stopPropagation()}>
                  <Checkbox checked={selected.has(exp.id)} onCheckedChange={() => toggleSelect(exp.id)} />
                </TableCell>
                <TableCell className="whitespace-nowrap">{format(new Date(exp.date), 'dd MMM yyyy')}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-1.5">
                    {exp.receipt_image_url && (
                      <button onClick={e => { e.stopPropagation(); setLightboxUrl(exp.receipt_image_url); }} className="shrink-0">
                        <ImageIcon className="h-4 w-4 text-muted-foreground hover:text-primary" />
                      </button>
                    )}
                    {exp.vendor ?? '—'}
                  </div>
                </TableCell>
                {canViewOthers && <TableCell>{exp.employee_name ?? '—'}</TableCell>}
                <TableCell>{exp.trip_name ?? '—'}</TableCell>
                <TableCell>{exp.category ?? '—'}</TableCell>
                <TableCell className="text-right whitespace-nowrap">
                  <div className="flex items-center justify-end gap-1">
                    {exp.policy_flag && (
                      <Tooltip>
                        <TooltipTrigger asChild><AlertTriangle className="h-3.5 w-3.5 text-warning shrink-0" /></TooltipTrigger>
                        <TooltipContent>{exp.policy_flag_reason ?? 'Policy violation'}</TooltipContent>
                      </Tooltip>
                    )}
                    {exp.amount.toFixed(2)} {exp.currency}
                  </div>
                </TableCell>
                <TableCell className="text-right whitespace-nowrap">{exp.base_amount != null ? `${exp.base_amount.toFixed(2)}` : '—'}</TableCell>
                <TableCell><Badge variant="outline" className={cn('capitalize text-xs', statusColor(exp.status))}>{exp.status ?? 'pending'}</Badge></TableCell>
                <TableCell>
                  {exp.source === 'whatsapp' ? (
                    <Tooltip><TooltipTrigger asChild><MessageCircle className="h-4 w-4 text-green-600" /></TooltipTrigger><TooltipContent>WhatsApp</TooltipContent></Tooltip>
                  ) : (
                    <span className="text-xs text-muted-foreground capitalize">{exp.source ?? 'web'}</span>
                  )}
                </TableCell>
                <TableCell>
                  <div className="flex gap-1" onClick={e => e.stopPropagation()}>
                    {isAdmin && exp.status === 'pending' && (
                      <>
                        <Tooltip><TooltipTrigger asChild>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-7 w-7 text-green-600 hover:text-green-700 disabled:opacity-40"
                            disabled={!!expenseApprovalBlockReason(exp)}
                            onClick={() => handleApprove(exp)}
                          >
                            <Check className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger><TooltipContent>{expenseApprovalBlockReason(exp) ?? 'Approve'}</TooltipContent></Tooltip>
                        <Tooltip><TooltipTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => { setRejectExpense(exp); setRejectReason(''); }}>
                            <XCircle className="h-3.5 w-3.5" />
                          </Button>
                        </TooltipTrigger><TooltipContent>Reject</TooltipContent></Tooltip>
                      </>
                    )}
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setSelectedExpense(exp)}><Eye className="h-3.5 w-3.5" /></Button>
                    {canEditExpense(exp) && (
                      <Tooltip><TooltipTrigger asChild>
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => { setSelectedExpense(exp); setEditMode(true); }}>
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                      </TooltipTrigger><TooltipContent>Edit</TooltipContent></Tooltip>
                    )}
                    {isAdmin && <Button variant="ghost" size="icon" className="h-7 w-7 text-destructive" onClick={() => setDeleteExpense(exp)}><Trash2 className="h-3.5 w-3.5" /></Button>}
                  </div>
                </TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>

        {totalPages > 1 && (
          <div className="flex items-center justify-between px-4 py-3 border-t">
            <span className="text-sm text-muted-foreground">{total} expense{total !== 1 ? 's' : ''} · Page {page + 1} of {totalPages}</span>
            <div className="flex gap-1">
              <Button variant="outline" size="sm" disabled={page === 0} onClick={() => setPage(p => p - 1)}><ChevronLeft className="h-4 w-4" /></Button>
              <Button variant="outline" size="sm" disabled={page >= totalPages - 1} onClick={() => setPage(p => p + 1)}><ChevronRight className="h-4 w-4" /></Button>
            </div>
          </div>
        )}
      </div>

      {/* Detail Slide-over */}
      <Sheet open={!!selectedExpense} onOpenChange={open => { if (!open) { setSelectedExpense(null); setEditMode(false); } }}>
        <SheetContent className="sm:max-w-lg overflow-y-auto">
          {selectedExpense && (
            <>
              <SheetHeader>
                <div className="flex items-center justify-between pr-6">
                  <SheetTitle>{editMode ? 'Edit Expense' : 'Expense Detail'}</SheetTitle>
                  {!editMode && canEditExpense(selectedExpense) && (
                    <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                      <Pencil className="h-3.5 w-3.5 mr-1.5" />Edit
                    </Button>
                  )}
                </div>
              </SheetHeader>
              <div className="mt-4 space-y-4">
                {selectedExpense.receipt_image_url && (
                  <button onClick={() => setLightboxUrl(selectedExpense.receipt_image_url)} className="w-full">
                    <img src={toThumbnail(selectedExpense.receipt_image_url, 600)} alt="Receipt" loading="lazy" className="w-full rounded-lg border object-contain max-h-64" />
                  </button>
                )}
                {editMode ? (
                  <EditExpenseForm
                    expense={selectedExpense}
                    trips={trips}
                    employees={employees}
                    canChangeEmployee={canChangeExpenseEmployee(selectedExpense)}
                    baseCurrency={company?.base_currency ?? 'AED'}
                    userId={user?.id}
                    onCancel={() => setEditMode(false)}
                    onSaved={() => { setEditMode(false); setSelectedExpense(null); fetchExpenses(); }}
                  />
                ) : (
                  <>
                    <DetailGrid expense={selectedExpense} baseCurrency={company?.base_currency ?? ''} />
                    <div className="border-t pt-4 space-y-1">
                      <h3 className="text-sm font-semibold text-foreground">Audit Trail</h3>
                      <p className="text-xs text-muted-foreground">
                        Created {selectedExpense.created_at ? format(new Date(selectedExpense.created_at), 'dd MMM yyyy HH:mm') : '—'} via <span className="capitalize">{selectedExpense.source ?? 'web'}</span>
                      </p>
                      {selectedExpense.approved_at && (
                        <p className="text-xs text-muted-foreground">
                          Approved {format(new Date(selectedExpense.approved_at), 'dd MMM yyyy HH:mm')}{selectedExpense.approved_by ? ` by ${approverNames[selectedExpense.approved_by] ?? '…'}` : ''}
                        </p>
                      )}
                      {selectedExpense.rejected_at && (
                        <p className="text-xs text-muted-foreground">
                          Rejected {format(new Date(selectedExpense.rejected_at), 'dd MMM yyyy HH:mm')}{selectedExpense.rejected_by ? ` by ${approverNames[selectedExpense.rejected_by] ?? '…'}` : ''}
                        </p>
                      )}
                      {selectedExpense.rejected_reason && (
                        <p className="text-xs text-destructive">Reason: {selectedExpense.rejected_reason}</p>
                      )}
                      {selectedExpense.finance_reviewed_at && (
                        <p className="text-xs text-muted-foreground">
                          Finance reviewed {format(new Date(selectedExpense.finance_reviewed_at), 'dd MMM yyyy HH:mm')}{selectedExpense.finance_reviewed_by ? ` by ${approverNames[selectedExpense.finance_reviewed_by] ?? '…'}` : ''}
                        </p>
                      )}
                      {selectedExpense.paid_at && (
                        <p className="text-xs text-muted-foreground">
                          Paid {format(new Date(selectedExpense.paid_at), 'dd MMM yyyy HH:mm')}{selectedExpense.paid_by ? ` by ${approverNames[selectedExpense.paid_by] ?? '…'}` : ''}
                        </p>
                      )}
                    </div>
                    {isAdmin && selectedExpense.status === 'pending' && (
                      <div className="space-y-2 pt-2">
                        {expenseApprovalBlockReason(selectedExpense) && (
                          <p className="text-xs text-muted-foreground">{expenseApprovalBlockReason(selectedExpense)}</p>
                        )}
                        <div className="flex gap-2">
                          <Button
                            className="flex-1"
                            disabled={!!expenseApprovalBlockReason(selectedExpense)}
                            title={expenseApprovalBlockReason(selectedExpense) ?? 'Approve'}
                            onClick={() => handleApprove(selectedExpense)}
                          >
                            Approve
                          </Button>
                          <Button variant="destructive" className="flex-1" onClick={() => { const exp = selectedExpense; setSelectedExpense(null); setTimeout(() => { setRejectExpense(exp); setRejectReason(''); }, 150); }}>Reject</Button>
                        </div>
                      </div>
                    )}
                  </>
                )}
              </div>
            </>
          )}
        </SheetContent>
      </Sheet>

      {/* Reject modal */}
      <Dialog open={!!rejectExpense} onOpenChange={open => { if (!open) { setRejectExpense(null); setRejectReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Expense</DialogTitle>
            <DialogDescription>Please provide a reason for rejection.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Reason for rejection" value={rejectReason} onChange={e => setRejectReason(e.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectExpense(null); setRejectReason(''); }}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectReason.trim()} onClick={handleRejectConfirm}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteExpense} onOpenChange={open => { if (!open) setDeleteExpense(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete expense?</AlertDialogTitle>
            <AlertDialogDescription>This action cannot be undone.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* Lightbox */}
      <Dialog open={!!lightboxUrl} onOpenChange={open => { if (!open) setLightboxUrl(null); }}>
        <DialogContent className="max-w-3xl p-2">
          <DialogHeader><DialogTitle>Receipt</DialogTitle><DialogDescription className="sr-only">Full-size receipt image</DialogDescription></DialogHeader>
          {lightboxUrl && <img src={toThumbnail(lightboxUrl, 1200)} alt="Receipt" loading="lazy" className="w-full rounded-lg object-contain max-h-[80vh]" />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

/* Sub-components */
const DateFilter: React.FC<{ label: string; value: Date | undefined; onChange: (d: Date | undefined) => void }> = ({ label, value, onChange }) => (
  <div>
    <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
    <Popover>
      <PopoverTrigger asChild>
        <Button variant="outline" className={cn('w-full justify-start text-left font-normal', !value && 'text-muted-foreground')}>
          {value ? format(value, 'dd MMM yyyy') : 'Pick date'}
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-auto p-0" align="start">
        <Calendar mode="single" selected={value} onSelect={onChange} initialFocus className="p-3 pointer-events-auto" />
      </PopoverContent>
    </Popover>
  </div>
);

const FilterSelect: React.FC<{ label: string; value: string; onChange: (v: string) => void; options: { value: string; label: string }[] }> = ({ label, value, onChange, options }) => (
  <div>
    <label className="text-xs font-medium text-muted-foreground mb-1 block">{label}</label>
    <Select value={value} onValueChange={onChange}>
      <SelectTrigger><SelectValue /></SelectTrigger>
      <SelectContent>{options.map(o => <SelectItem key={o.value} value={o.value}>{o.label}</SelectItem>)}</SelectContent>
    </Select>
  </div>
);

const DetailGrid: React.FC<{ expense: Expense; baseCurrency: string }> = ({ expense: e, baseCurrency }) => {
  const fields = [
    ['Date', format(new Date(e.date), 'dd MMM yyyy')],
    ['Vendor', e.vendor], ['Employee', e.employee_name], ['Phone', e.employee_phone],
    ['Trip', e.trip_name], ['Category', e.category], ['Type', e.expense_type],
    ['Payment', e.payment_method],
    ['Amount', `${e.amount.toFixed(2)} ${e.currency}`],
    ['Base Amount', e.base_amount != null ? `${e.base_amount.toFixed(2)} ${baseCurrency}` : '—'],
    ['Exchange Rate', e.exchange_rate?.toString()], ['Tax Amount', e.tax_amount?.toFixed(2)],
    ['Tax ID', e.tax_id_number], ['Notes', e.notes], ['Status', e.status],
    ['Policy Flag', e.policy_flag ? `⚠ ${e.policy_flag_reason ?? 'Yes'}` : 'No'],
  ];
  return (
    <div className="grid grid-cols-2 gap-x-4 gap-y-2">
      {fields.map(([lbl, val]) => (
        <div key={lbl as string}>
          <p className="text-xs text-muted-foreground">{lbl}</p>
          <p className="text-sm text-foreground">{val ?? '—'}</p>
        </div>
      ))}
    </div>
  );
};

export default Expenses;
