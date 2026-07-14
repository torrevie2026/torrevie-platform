import React, { useEffect, useMemo, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import { format } from 'date-fns';
import { toast } from 'sonner';
import {
  AlertTriangle, Banknote, ChevronDown, ChevronUp, Download, Eye,
  Info, MapPin, Plus, Receipt, Trash2, X
} from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter, DialogDescription } from '@/components/ui/dialog';
import { Collapsible, CollapsibleContent, CollapsibleTrigger } from '@/components/ui/collapsible';
import { cn } from '@/lib/utils';

type Expense = {
  id: string; date: string; vendor: string | null; employee_name: string | null;
  employee_phone: string | null; category: string | null; amount: number;
  currency: string; base_amount: number | null; status: string | null;
  source: string | null; policy_flag: boolean | null; policy_flag_reason: string | null;
  receipt_image_url: string | null; notes: string | null; payment_method: string | null;
  trip_id: string | null; trip_name: string | null; created_at: string | null;
  employee_id: string | null; company_id: string; approved_by: string | null;
};

type Employee = {
  id: string; name: string; department: string | null; phone_number: string | null;
  monthly_salary?: number | null; submission_frequency?: string | null;
};

type Trip = { id: string; name: string };

type Advance = {
  id: string; employee_id: string | null; employee_name: string | null; employee_phone: string | null;
  department: string | null; amount: number; currency: string; base_amount: number;
  advance_date: string; month: number; year: number; notes: string | null;
  trip_id?: string | null; trip_name?: string | null; is_trip_budget_advance?: boolean | null;
  advance_deposit_slip_url?: string | null;
};

type TripPayout = {
  id: string; name: string; start_date: string | null; end_date: string | null;
  origin: string | null; destination: string | null; driver_employee_id: string | null;
  driver_name: string | null; driver_phone: string | null; driver_department: string | null;
  driver_trip_amount: number | null; subcontractor_driver_name: string | null;
  subcontractor_amount: number | null; subcontractor_notes: string | null;
  driver_payout_status: string | null; driver_payout_paid_at: string | null;
};

type SalaryPayment = { employee_id: string; amount: number };

type Settlement = {
  key: string;
  employee_id: string | null;
  name: string;
  department: string | null;
  phone: string | null;
  approvedExpenses: Expense[];
  tripPayouts: TripPayout[];
  advances: Advance[];
  salaries: Employee[];
  approvedTotal: number;
  tripTotal: number;
  advanceTotal: number;
  salaryTotal: number;
  netDue: number;
};

const monthOptions = Array.from({ length: 12 }, (_, index) => ({
  value: String(index + 1),
  label: format(new Date(Date.UTC(2026, index, 1)), 'MMMM'),
}));

const currentYear = new Date().getFullYear();
const yearOptions = Array.from({ length: 4 }, (_, index) => String(currentYear - 1 + index));

const amountOf = (value: number | null | undefined) => Number(value || 0);

const FinanceReview = () => {
  const { profile, selectedCompanyId } = useAuth();
  const isFinance = profile?.role === 'finance' || profile?.role === 'admin' || profile?.super_admin;

  const now = new Date();
  const [month, setMonth] = useState(now.getMonth() + 1);
  const [year, setYear] = useState(now.getFullYear());
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [advances, setAdvances] = useState<Advance[]>([]);
  const [tripBudgetAdvances, setTripBudgetAdvances] = useState<Advance[]>([]);
  const [salaryPayments, setSalaryPayments] = useState<SalaryPayment[]>([]);
  const [tripPayouts, setTripPayouts] = useState<TripPayout[]>([]);
  const [pendingManagerCount, setPendingManagerCount] = useState(0);
  const [company, setCompany] = useState<{ base_currency: string } | null>(null);
  const [loading, setLoading] = useState(true);
  const [deptFilter, setDeptFilter] = useState('all');
  const [expanded, setExpanded] = useState<string | null>(null);
  const [settleModal, setSettleModal] = useState<Settlement | null>(null);
  const [advanceOpen, setAdvanceOpen] = useState(false);
  const [advanceEmployeeId, setAdvanceEmployeeId] = useState('');
  const [advanceAmount, setAdvanceAmount] = useState('');
  const [advanceDate, setAdvanceDate] = useState(format(now, 'yyyy-MM-dd'));
  const [advanceNotes, setAdvanceNotes] = useState('');
  const [rejectingExpense, setRejectingExpense] = useState<Expense | null>(null);
  const [rejectReason, setRejectReason] = useState('');
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);
  const [unlinkedOpen, setUnlinkedOpen] = useState(false);

  const fetchData = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    try {
      const data = await apiRequest<{
        company: { base_currency: string } | null;
        expenses: Expense[];
        employees: Employee[];
        trips: Trip[];
        pendingManagerCount: number;
        advances: Advance[];
        tripBudgetAdvances: Advance[];
        salaryPayments: SalaryPayment[];
        tripPayouts: TripPayout[];
      }>(`/api/tex/finance-review?company_id=${encodeURIComponent(selectedCompanyId)}&month=${month}&year=${year}`);
      setCompany(data.company);
      setExpenses(data.expenses ?? []);
      setEmployees(data.employees ?? []);
      setTrips(data.trips ?? []);
      setPendingManagerCount(data.pendingManagerCount ?? 0);
      setAdvances(data.advances ?? []);
      setTripBudgetAdvances(data.tripBudgetAdvances ?? []);
      setSalaryPayments(data.salaryPayments ?? []);
      setTripPayouts(data.tripPayouts ?? []);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load finance review');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [selectedCompanyId, month, year]);

  const baseCurrency = company?.base_currency ?? 'AED';
  const employeeById = useMemo(() => new Map(employees.map(employee => [employee.id, employee])), [employees]);
  const employeeByName = useMemo(() => new Map(employees.map(employee => [employee.name, employee])), [employees]);

  const settlements = useMemo(() => {
    const map = new Map<string, Settlement>();

    const ensure = (employeeId: string | null, name: string | null, fallback?: Partial<Settlement>) => {
      const employee = employeeId ? employeeById.get(employeeId) : name ? employeeByName.get(name) : null;
      const key = employee?.id || employeeId || name || 'unassigned';
      if (!map.has(key)) {
        map.set(key, {
          key,
          employee_id: employee?.id || employeeId || null,
          name: employee?.name || name || fallback?.name || 'Unassigned driver',
          department: employee?.department || fallback?.department || null,
          phone: employee?.phone_number || fallback?.phone || null,
          approvedExpenses: [],
          tripPayouts: [],
          advances: [],
          salaries: [],
          approvedTotal: 0,
          tripTotal: 0,
          advanceTotal: 0,
          salaryTotal: 0,
          netDue: 0,
        });
      }
      return map.get(key)!;
    };

    expenses.filter(expense => expense.status === 'approved').forEach(expense => {
      const summary = ensure(expense.employee_id, expense.employee_name, { phone: expense.employee_phone });
      summary.approvedExpenses.push(expense);
      summary.approvedTotal += amountOf(expense.base_amount ?? expense.amount);
    });

    tripPayouts.filter(trip => trip.driver_payout_status !== 'paid').forEach(trip => {
      const summary = ensure(trip.driver_employee_id, trip.driver_name, {
        name: trip.driver_name || 'Unassigned driver',
        department: trip.driver_department,
        phone: trip.driver_phone,
      });
      summary.tripPayouts.push(trip);
      summary.tripTotal += amountOf(trip.driver_trip_amount) + amountOf(trip.subcontractor_amount);
    });

    [...advances, ...tripBudgetAdvances].forEach(advance => {
      const summary = ensure(advance.employee_id, advance.employee_name, {
        department: advance.department,
        phone: advance.employee_phone,
      });
      summary.advances.push(advance);
      summary.advanceTotal += amountOf(advance.base_amount);
    });

    const paidSalaryEmployeeIds = new Set(salaryPayments.map(payment => payment.employee_id));
    employees
      .filter(employee => amountOf(employee.monthly_salary) > 0 && !paidSalaryEmployeeIds.has(employee.id))
      .forEach(employee => {
        const summary = ensure(employee.id, employee.name, {
          department: employee.department,
          phone: employee.phone_number,
        });
        summary.salaries.push(employee);
        summary.salaryTotal += amountOf(employee.monthly_salary);
      });

    for (const summary of map.values()) {
      summary.netDue = summary.salaryTotal + summary.approvedTotal + summary.tripTotal - summary.advanceTotal;
    }

    return Array.from(map.values())
      .filter(summary => {
        if (deptFilter !== 'all' && summary.department !== deptFilter) return false;
        return summary.salaries.length > 0 || summary.approvedExpenses.length > 0 || summary.tripPayouts.length > 0 || summary.advances.length > 0;
      })
      .sort((a, b) => Math.abs(b.netDue) - Math.abs(a.netDue));
  }, [expenses, tripPayouts, advances, tripBudgetAdvances, salaryPayments, employees, employeeById, employeeByName, deptFilter]);

  const departments = useMemo(() => {
    const set = new Set<string>();
    employees.forEach(employee => { if (employee.department) set.add(employee.department); });
    return Array.from(set).sort();
  }, [employees]);

  const approvedTotal = settlements.reduce((sum, item) => sum + item.approvedTotal, 0);
  const tripTotal = settlements.reduce((sum, item) => sum + item.tripTotal, 0);
  const advanceTotal = settlements.reduce((sum, item) => sum + item.advanceTotal, 0);
  const salaryTotal = settlements.reduce((sum, item) => sum + item.salaryTotal, 0);
  const netDueTotal = settlements.reduce((sum, item) => sum + item.netDue, 0);
  const unlinkedExpenses = expenses.filter(expense => expense.status === 'approved' && !expense.trip_id);

  const createAdvance = async () => {
    if (!selectedCompanyId || !advanceEmployeeId || !advanceAmount) return;
    try {
      const selectedDate = new Date(`${advanceDate}T00:00:00`);
      await apiRequest('/api/tex/driver-advances', {
        method: 'POST',
        body: JSON.stringify({
          company_id: selectedCompanyId,
          employee_id: advanceEmployeeId,
          amount: Number(advanceAmount),
          advance_date: advanceDate,
          month: selectedDate.getMonth() + 1,
          year: selectedDate.getFullYear(),
          notes: advanceNotes.trim() || null,
        }),
      });
      toast.success('Driver advance recorded');
      setAdvanceOpen(false);
      setAdvanceEmployeeId(''); setAdvanceAmount(''); setAdvanceNotes('');
      setMonth(selectedDate.getMonth() + 1); setYear(selectedDate.getFullYear());
      fetchData();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to record advance');
    }
  };

  const deleteAdvance = async (advance: Advance) => {
    if (advance.is_trip_budget_advance) {
      toast.info('Trip budget advances are changed from the trip budget field.');
      return;
    }
    try {
      await apiRequest(`/api/tex/driver-advances/${advance.id}`, { method: 'DELETE' });
      toast.success('Advance deleted');
      fetchData();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to delete advance');
    }
  };

  const settle = async () => {
    if (!settleModal || !selectedCompanyId) return;
    try {
      await apiRequest('/api/tex/finance-review/settlements/pay', {
        method: 'POST',
        body: JSON.stringify({
          company_id: selectedCompanyId,
          employee_id: settleModal.employee_id,
          expense_ids: settleModal.approvedExpenses.map(expense => expense.id),
          trip_ids: settleModal.tripPayouts.map(trip => trip.id),
          salary_employee_ids: settleModal.salaries.map(employee => employee.id),
          month,
          year,
          note: settleModal.netDue > 0
            ? `Paid net settlement ${baseCurrency} ${settleModal.netDue.toFixed(2)}`
            : `Closed settlement against advances; balance ${baseCurrency} ${Math.abs(settleModal.netDue).toFixed(2)}`,
        }),
      });
      toast.success('Settlement marked as paid');
      setSettleModal(null);
      fetchData();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to settle');
    }
  };

  const handleAssignTrip = async (expenseId: string, tripId: string) => {
    try {
      await apiRequest(`/api/tex/expenses/${expenseId}/trip`, {
        method: 'PATCH',
        body: JSON.stringify({ trip_id: tripId }),
      });
      toast.success('Trip assigned');
      fetchData();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to assign trip');
    }
  };

  const handleRejectExpense = async () => {
    if (!rejectingExpense || !rejectReason.trim()) return;
    try {
      await apiRequest(`/api/tex/expenses/${rejectingExpense.id}/status`, {
        method: 'PATCH',
        body: JSON.stringify({ status: 'rejected', reason: rejectReason.trim() }),
      });
      toast.success('Expense rejected');
      setRejectingExpense(null); setRejectReason('');
      fetchData();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to reject expense');
    }
  };

  const exportSettlement = (summary: Settlement) => {
    const rows = [
      ['Type', 'Date/Trip', 'Description', 'Amount'],
      ...summary.salaries.map(employee => ['Monthly salary', `${year}-${String(month).padStart(2, '0')}`, employee.name, amountOf(employee.monthly_salary).toFixed(2)]),
      ...summary.approvedExpenses.map(expense => ['Receipt', expense.date, expense.vendor || expense.category || 'Expense', amountOf(expense.base_amount ?? expense.amount).toFixed(2)]),
      ...summary.tripPayouts.map(trip => ['Trip payout', trip.name, `Driver ${amountOf(trip.driver_trip_amount).toFixed(2)} + subcontractor ${amountOf(trip.subcontractor_amount).toFixed(2)}`, (amountOf(trip.driver_trip_amount) + amountOf(trip.subcontractor_amount)).toFixed(2)]),
      ...summary.advances.map(advance => [advance.is_trip_budget_advance ? 'Trip budget advance' : 'Advance', advance.advance_date, advance.notes || 'Driver advance', `-${amountOf(advance.base_amount).toFixed(2)}`]),
      ['Net', '', summary.netDue >= 0 ? 'Pay driver' : 'Advance remaining', summary.netDue.toFixed(2)],
    ];
    const csv = rows.map(row => row.map(value => `"${String(value).replace(/"/g, '""')}"`).join(',')).join('\n');
    const blob = new Blob([csv], { type: 'text/csv' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${summary.name.replace(/\s+/g, '_')}-settlement-${year}-${String(month).padStart(2, '0')}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  if (!isFinance) return <div className="text-center py-20 text-muted-foreground">Finance or admin access required</div>;
  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading...</div>;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="text-2xl font-bold text-foreground">Finance Review</h1>
        <div className="flex items-center gap-2">
          <Select value={String(month)} onValueChange={value => setMonth(Number(value))}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>{monthOptions.map(option => <SelectItem key={option.value} value={option.value}>{option.label}</SelectItem>)}</SelectContent>
          </Select>
          <Select value={String(year)} onValueChange={value => setYear(Number(value))}>
            <SelectTrigger className="w-28"><SelectValue /></SelectTrigger>
            <SelectContent>{yearOptions.map(option => <SelectItem key={option} value={option}>{option}</SelectItem>)}</SelectContent>
          </Select>
          <Button onClick={() => setAdvanceOpen(true)}><Plus className="h-4 w-4 mr-1" />Record Advance</Button>
        </div>
      </div>

      {pendingManagerCount > 0 && (
        <Card className="border-amber-300">
          <CardContent className="p-4 flex items-start gap-3">
            <Info className="h-5 w-5 text-amber-600 mt-0.5" />
            <p className="text-sm text-amber-800">
              Awaiting manager approval: <span className="font-semibold">{pendingManagerCount} expenses</span>. They will enter finance settlement after approval.
            </p>
          </CardContent>
        </Card>
      )}

      <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-5 gap-4">
        <Metric title="Monthly Salaries" value={`${baseCurrency} ${salaryTotal.toFixed(2)}`} icon={Banknote} />
        <Metric title="Approved Receipts" value={`${baseCurrency} ${approvedTotal.toFixed(2)}`} icon={Receipt} />
        <Metric title="Trip Driver Amounts" value={`${baseCurrency} ${tripTotal.toFixed(2)}`} icon={MapPin} />
        <Metric title="Advances Paid" value={`${baseCurrency} ${advanceTotal.toFixed(2)}`} icon={Banknote} />
        <Metric title={netDueTotal >= 0 ? 'Net To Pay' : 'Advance Remaining'} value={`${baseCurrency} ${Math.abs(netDueTotal).toFixed(2)}`} icon={Banknote} tone={netDueTotal >= 0 ? 'default' : 'muted'} />
      </div>

      <p className="text-xs text-muted-foreground">
        Trip budgets entered on the Trips page are counted automatically as paid driver advances for the month they are entered.
      </p>

      <Card>
        <CardContent className="p-4">
          <div className="flex items-end gap-3">
            <div className="space-y-1">
              <label className="text-xs font-medium text-muted-foreground">Department</label>
              <Select value={deptFilter} onValueChange={setDeptFilter}>
                <SelectTrigger className="w-[180px] h-9 text-sm"><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">All departments</SelectItem>
                  {departments.map(department => <SelectItem key={department} value={department}>{department}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Employee Monthly Settlements</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Employee</TableHead>
                <TableHead className="text-right">Salary</TableHead>
                <TableHead className="text-right">Receipts</TableHead>
                <TableHead className="text-right">Trip Amounts</TableHead>
                <TableHead className="text-right">Advances</TableHead>
                <TableHead className="text-right">Net</TableHead>
                <TableHead className="text-right">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {settlements.length === 0 ? (
                <TableRow><TableCell colSpan={7} className="text-center py-8 text-muted-foreground">No finance items for this period</TableCell></TableRow>
              ) : settlements.map(summary => (
                <React.Fragment key={summary.key}>
                  <TableRow className={expanded === summary.key ? 'bg-muted/30' : ''}>
                    <TableCell>
                      <div>
                        <p className="text-sm font-medium text-foreground">{summary.name}</p>
                        {summary.department && <p className="text-xs text-muted-foreground">{summary.department}</p>}
                      </div>
                    </TableCell>
                    <TableCell className="text-right">{baseCurrency} {summary.salaryTotal.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{baseCurrency} {summary.approvedTotal.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{baseCurrency} {summary.tripTotal.toFixed(2)}</TableCell>
                    <TableCell className="text-right">{baseCurrency} {summary.advanceTotal.toFixed(2)}</TableCell>
                    <TableCell className="text-right">
                      <Badge variant="outline" className={cn('text-xs', summary.netDue >= 0 ? 'bg-green-50 text-green-700 border-green-200' : 'bg-amber-50 text-amber-700 border-amber-200')}>
                        {summary.netDue >= 0 ? 'Pay ' : 'Carry '}
                        {baseCurrency} {Math.abs(summary.netDue).toFixed(2)}
                      </Badge>
                    </TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button size="sm" variant="outline" onClick={() => setExpanded(expanded === summary.key ? null : summary.key)}>
                          {expanded === summary.key ? <ChevronUp className="h-3.5 w-3.5" /> : <Eye className="h-3.5 w-3.5" />}
                        </Button>
                        <Button size="sm" variant="outline" onClick={() => exportSettlement(summary)}><Download className="h-3.5 w-3.5" /></Button>
                        <Button size="sm" disabled={summary.salaries.length === 0 && summary.approvedExpenses.length === 0 && summary.tripPayouts.length === 0} onClick={() => setSettleModal(summary)}>
                          Settle
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                  {expanded === summary.key && (
                    <TableRow>
                      <TableCell colSpan={7} className="bg-muted/20 p-4">
                        <SettlementDetails
                          summary={summary}
                          baseCurrency={baseCurrency}
                          onReceiptClick={setLightboxUrl}
                          onReject={expense => { setRejectingExpense(expense); setRejectReason(''); }}
                          onDeleteAdvance={deleteAdvance}
                        />
                      </TableCell>
                    </TableRow>
                  )}
                </React.Fragment>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {unlinkedExpenses.length > 0 && (
        <Collapsible open={unlinkedOpen} onOpenChange={setUnlinkedOpen}>
          <CollapsibleTrigger asChild>
            <Card className="cursor-pointer hover:shadow-sm transition-shadow">
              <CardContent className="p-4 flex items-center justify-between">
                <div className="flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-muted-foreground" />
                  <span className="text-sm font-medium text-foreground">Approved receipts with no trip assigned - {unlinkedExpenses.length}</span>
                </div>
                {unlinkedOpen ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              </CardContent>
            </Card>
          </CollapsibleTrigger>
          <CollapsibleContent>
            <Card className="mt-2">
              <CardContent className="p-4 space-y-2">
                {unlinkedExpenses.map(expense => (
                  <div key={expense.id} className="flex items-center justify-between gap-3 py-2 border-b last:border-0">
                    <div>
                      <p className="text-sm font-medium">{expense.employee_name} - {expense.vendor ?? 'N/A'}</p>
                      <p className="text-xs text-muted-foreground">{format(new Date(expense.date), 'dd MMM yyyy')} - {baseCurrency} {amountOf(expense.base_amount ?? expense.amount).toFixed(2)}</p>
                    </div>
                    <Select onValueChange={(value) => handleAssignTrip(expense.id, value)}>
                      <SelectTrigger className="h-8 text-xs w-[190px] border-dashed">
                        <SelectValue placeholder="Assign trip" />
                      </SelectTrigger>
                      <SelectContent>
                        {trips.map(trip => <SelectItem key={trip.id} value={trip.id}>{trip.name}</SelectItem>)}
                      </SelectContent>
                    </Select>
                  </div>
                ))}
              </CardContent>
            </Card>
          </CollapsibleContent>
        </Collapsible>
      )}

      <Dialog open={advanceOpen} onOpenChange={setAdvanceOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Record Driver Advance</DialogTitle>
            <DialogDescription>Use this for cash paid in advance to a driver. It reduces the monthly amount still due.</DialogDescription>
          </DialogHeader>
          <div className="space-y-3">
            <div>
              <label className="text-sm font-medium">Driver</label>
              <Select value={advanceEmployeeId} onValueChange={setAdvanceEmployeeId}>
                <SelectTrigger><SelectValue placeholder="Select driver" /></SelectTrigger>
                <SelectContent>
                  {employees.map(employee => (
                    <SelectItem key={employee.id} value={employee.id}>{employee.name}{employee.department ? ` (${employee.department})` : ''}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="text-sm font-medium">Amount ({baseCurrency})</label>
                <Input inputMode="decimal" value={advanceAmount} onChange={event => setAdvanceAmount(event.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" />
              </div>
              <div>
                <label className="text-sm font-medium">Date</label>
                <Input type="date" value={advanceDate} onChange={event => setAdvanceDate(event.target.value)} />
              </div>
            </div>
            <div>
              <label className="text-sm font-medium">Notes</label>
              <Textarea rows={2} value={advanceNotes} onChange={event => setAdvanceNotes(event.target.value)} placeholder="Optional reference or handover details" />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setAdvanceOpen(false)}>Cancel</Button>
            <Button disabled={!advanceEmployeeId || !advanceAmount} onClick={createAdvance}>Record Advance</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!settleModal} onOpenChange={open => { if (!open) setSettleModal(null); }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Settle {settleModal?.name}</DialogTitle>
            <DialogDescription>
              {settleModal && (
                settleModal.netDue >= 0
                  ? `Pay ${baseCurrency} ${settleModal.netDue.toFixed(2)} after deducting advances.`
                  : `No extra payment due. ${baseCurrency} ${Math.abs(settleModal.netDue).toFixed(2)} remains covered by advances.`
              )}
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setSettleModal(null)}>Cancel</Button>
            <Button onClick={settle}>Confirm Settlement</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!rejectingExpense} onOpenChange={open => { if (!open) { setRejectingExpense(null); setRejectReason(''); } }}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Reject Expense</DialogTitle>
            <DialogDescription>Please provide a reason for rejection.</DialogDescription>
          </DialogHeader>
          <Input placeholder="Reason for rejection" value={rejectReason} onChange={event => setRejectReason(event.target.value)} />
          <DialogFooter>
            <Button variant="outline" onClick={() => { setRejectingExpense(null); setRejectReason(''); }}>Cancel</Button>
            <Button variant="destructive" disabled={!rejectReason.trim()} onClick={handleRejectExpense}>Reject</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!lightboxUrl} onOpenChange={open => { if (!open) setLightboxUrl(null); }}>
        <DialogContent className="max-w-3xl p-2">
          {lightboxUrl && <img src={lightboxUrl} alt="Receipt" className="w-full h-auto rounded-lg" />}
        </DialogContent>
      </Dialog>
    </div>
  );
};

const Metric: React.FC<{ title: string; value: string; icon: React.ElementType; tone?: 'default' | 'muted' }> = ({ title, value, icon: Icon, tone = 'default' }) => (
  <Card>
    <CardContent className="p-5">
      <div className="flex items-center gap-1.5 text-muted-foreground"><Icon className="h-3.5 w-3.5" /><p className="text-sm">{title}</p></div>
      <p className={cn('text-2xl font-bold mt-1', tone === 'muted' ? 'text-amber-600' : 'text-foreground')}>{value}</p>
    </CardContent>
  </Card>
);

const SettlementDetails: React.FC<{
  summary: Settlement;
  baseCurrency: string;
  onReceiptClick: (url: string) => void;
  onReject: (expense: Expense) => void;
  onDeleteAdvance: (advance: Advance) => void;
}> = ({ summary, baseCurrency, onReceiptClick, onReject, onDeleteAdvance }) => (
  <div className="space-y-4">
    {summary.salaries.length > 0 && (
      <div>
        <h3 className="text-sm font-semibold mb-2">Monthly Salary</h3>
        <div className="space-y-2">
          {summary.salaries.map(employee => (
            <div key={`salary-${employee.id}`} className="rounded-md border bg-card p-3 flex items-center justify-between gap-3">
              <div>
                <p className="text-sm font-medium">{employee.name}</p>
                <p className="text-xs text-muted-foreground">{employee.department || 'No department'}</p>
              </div>
              <p className="text-sm font-semibold">{baseCurrency} {amountOf(employee.monthly_salary).toFixed(2)}</p>
            </div>
          ))}
        </div>
      </div>
    )}

    {summary.approvedExpenses.length > 0 && (
      <div>
        <h3 className="text-sm font-semibold mb-2">Approved Receipts</h3>
        <div className="space-y-2">
          {summary.approvedExpenses.map(expense => (
            <div key={expense.id} className="flex items-center justify-between gap-3 rounded-md border bg-card p-3">
              <div className="flex items-center gap-3 min-w-0">
                {expense.receipt_image_url ? (
                  <button onClick={() => onReceiptClick(expense.receipt_image_url!)} className="h-12 w-12 rounded border overflow-hidden shrink-0">
                    <img src={expense.receipt_image_url} alt="Receipt" className="h-full w-full object-cover" />
                  </button>
                ) : (
                  <div className="h-12 w-12 rounded border bg-muted flex items-center justify-center shrink-0"><Receipt className="h-4 w-4 text-muted-foreground" /></div>
                )}
                <div className="min-w-0">
                  <p className="text-sm font-medium truncate">{expense.vendor || 'No vendor'}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(expense.date), 'dd MMM yyyy')} - {expense.category || 'Uncategorized'}{expense.trip_name ? ` - ${expense.trip_name}` : ''}</p>
                  {expense.policy_flag && <p className="text-xs text-destructive flex items-center gap-1"><AlertTriangle className="h-3 w-3" />{expense.policy_flag_reason || 'Policy flag'}</p>}
                </div>
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold whitespace-nowrap">{baseCurrency} {amountOf(expense.base_amount ?? expense.amount).toFixed(2)}</p>
                <Button size="sm" variant="destructive" onClick={() => onReject(expense)}><X className="h-3.5 w-3.5" /></Button>
              </div>
            </div>
          ))}
        </div>
      </div>
    )}

    {summary.tripPayouts.length > 0 && (
      <div>
        <h3 className="text-sm font-semibold mb-2">Trip Driver Amounts</h3>
        <div className="space-y-2">
          {summary.tripPayouts.map(trip => {
            const total = amountOf(trip.driver_trip_amount) + amountOf(trip.subcontractor_amount);
            return (
              <div key={trip.id} className="rounded-md border bg-card p-3 flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-medium">{trip.name}</p>
                  <p className="text-xs text-muted-foreground">{trip.origin || '-'} to {trip.destination || '-'}</p>
                  <p className="text-xs text-muted-foreground">Driver {baseCurrency} {amountOf(trip.driver_trip_amount).toFixed(2)}{amountOf(trip.subcontractor_amount) > 0 ? ` + external ${trip.subcontractor_driver_name || 'driver'} ${baseCurrency} ${amountOf(trip.subcontractor_amount).toFixed(2)}` : ''}</p>
                </div>
                <p className="text-sm font-semibold">{baseCurrency} {total.toFixed(2)}</p>
              </div>
            );
          })}
        </div>
      </div>
    )}

    {summary.advances.length > 0 && (
      <div>
        <h3 className="text-sm font-semibold mb-2">Advances Paid</h3>
        <div className="space-y-2">
          {summary.advances.map(advance => (
            <div key={advance.is_trip_budget_advance ? `trip-budget-${advance.trip_id ?? advance.id}` : advance.id} className="rounded-md border bg-card p-3 flex items-center justify-between gap-3">
              <div>
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium">{format(new Date(advance.advance_date), 'dd MMM yyyy')}</p>
                  {advance.is_trip_budget_advance && <Badge variant="outline" className="text-[10px]">Trip budget</Badge>}
                </div>
                <p className="text-xs text-muted-foreground">{advance.notes || 'Driver advance'}</p>
                {advance.trip_name && <p className="text-xs text-muted-foreground">Trip: {advance.trip_name}</p>}
                {advance.advance_deposit_slip_url && (
                  <button
                    type="button"
                    className="mt-1 text-xs font-medium text-primary hover:underline"
                    onClick={() => window.open(advance.advance_deposit_slip_url!, '_blank', 'noopener,noreferrer')}
                  >
                    View deposit slip
                  </button>
                )}
              </div>
              <div className="flex items-center gap-2">
                <p className="text-sm font-semibold">-{baseCurrency} {amountOf(advance.base_amount).toFixed(2)}</p>
                {!advance.is_trip_budget_advance && (
                  <Button size="sm" variant="ghost" className="text-destructive" onClick={() => onDeleteAdvance(advance)}><Trash2 className="h-3.5 w-3.5" /></Button>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>
    )}
  </div>
);

export default FinanceReview;
