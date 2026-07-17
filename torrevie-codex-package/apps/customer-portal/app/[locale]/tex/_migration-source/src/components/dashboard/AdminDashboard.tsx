import React, { useEffect, useState, useMemo } from 'react';
import { notifyAdmins } from '@/lib/notifications';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { TrendingUp, TrendingDown, Receipt, Clock, MapPin, ArrowRight, AlertTriangle, CheckCircle, XCircle, DollarSign, Filter, X, CalendarIcon, UsersRound } from 'lucide-react';
import InstallBanner from '@/components/InstallBanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

const CHART_COLORS = [
  'hsl(170 84% 32%)', 'hsl(32 95% 44%)', 'hsl(0 72% 51%)', 'hsl(142 72% 37%)',
  'hsl(222 47% 30%)', 'hsl(280 60% 50%)', 'hsl(200 70% 45%)', 'hsl(45 90% 50%)',
];

const statusBadge = (s: string | null) => {
  if (s === 'approved') return 'bg-green-100 text-green-800 border-green-200';
  if (s === 'rejected') return 'bg-red-100 text-red-800 border-red-200';
  if (s === 'paid') return 'bg-teal-100 text-teal-800 border-teal-200';
  return 'bg-amber-100 text-amber-800 border-amber-200';
};

type Expense = {
  id: string; date: string; vendor: string | null; employee_name: string | null;
  employee_phone: string | null; category: string | null; amount: number;
  currency: string; base_amount: number | null; status: string | null;
  source: string | null; policy_flag: boolean | null; policy_flag_reason: string | null;
  trip_id: string | null; trip_name: string | null;
};

type Budget = { department: string; budget_amount: number };
type Trip = {
  id: string; name: string; status: string | null; budget_aed: number | null;
  total_spend?: number; driver_trip_amount?: number | null; subcontractor_amount?: number | null;
};

const STATUSES = ['pending', 'approved', 'rejected', 'paid'];

const AdminDashboard = () => {
  const { selectedCompanyId, user, profile, companies } = useAuth();
  const [company, setCompany] = useState<{ base_currency: string } | null>(null);
  const [allExpenses, setAllExpenses] = useState<Expense[]>([]);
  const [lastMonthTotal, setLastMonthTotal] = useState(0);
  const [activeTrips, setActiveTrips] = useState<Trip[]>([]);
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [loading, setLoading] = useState(true);
  const [pendingManagerCount, setPendingManagerCount] = useState(0);
  const [approvedAwaitingCount, setApprovedAwaitingCount] = useState(0);

  const [filterDateFrom, setFilterDateFrom] = useState<Date | undefined>(startOfMonth(new Date()));
  const [filterDateTo, setFilterDateTo] = useState<Date | undefined>(endOfMonth(new Date()));
  const [showFilters, setShowFilters] = useState(false);

  const now = new Date();
  const lastMonthStart = format(startOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');
  const lastMonthEnd = format(endOfMonth(subMonths(now, 1)), 'yyyy-MM-dd');

  const fetchData = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const dateFrom = filterDateFrom ? format(filterDateFrom, 'yyyy-MM-dd') : format(startOfMonth(now), 'yyyy-MM-dd');
    const dateTo = filterDateTo ? format(filterDateTo, 'yyyy-MM-dd') : format(endOfMonth(now), 'yyyy-MM-dd');

    const data = await apiRequest<{
      company: { base_currency: string } | null;
      expenses: Expense[];
      lastMonthTotal: number;
      activeTrips: Trip[];
      budgets: Budget[];
      pendingCount: number;
      approvedCount: number;
    }>(`/api/tex/dashboard?company_id=${encodeURIComponent(selectedCompanyId)}&date_from=${encodeURIComponent(dateFrom)}&date_to=${encodeURIComponent(dateTo)}&month=${now.getMonth() + 1}&year=${now.getFullYear()}`);

    setCompany(data.company);
    setAllExpenses(data.expenses ?? []);
    setLastMonthTotal(data.lastMonthTotal ?? 0);
    setActiveTrips(data.activeTrips ?? []);
    setBudgets(data.budgets ?? []);
    setPendingManagerCount(data.pendingCount ?? 0);
    setApprovedAwaitingCount(data.approvedCount ?? 0);
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedCompanyId, filterDateFrom, filterDateTo]);

  const selectedCompany = companies?.find((item) => item.id === selectedCompanyId);
  const baseCurrency = company?.base_currency || selectedCompany?.base_currency || 'AED';
  const filteredExpenses = allExpenses;
  const spendExpenses = filteredExpenses.filter(e => e.status !== 'rejected');
  const thisMonthTotal = spendExpenses.reduce((s, e) => s + (e.base_amount ?? 0), 0);
  const pctChange = lastMonthTotal > 0 ? ((thisMonthTotal - lastMonthTotal) / lastMonthTotal) * 100 : 0;
  const flaggedExpenses = filteredExpenses.filter(e => e.policy_flag);

  const empMap: Record<string, number> = {};
  spendExpenses.forEach(e => { const emp = e.employee_name ?? 'Unknown'; empMap[emp] = (empMap[emp] ?? 0) + (e.base_amount ?? 0); });
  const employeeData = Object.entries(empMap).map(([name, total]) => ({ name, total: Math.round(total * 100) / 100 })).sort((a, b) => b.total - a.total);

  const categoryMap: Record<string, number> = {};
  spendExpenses.forEach(e => { const cat = e.category ?? 'Other'; categoryMap[cat] = (categoryMap[cat] ?? 0) + (e.base_amount ?? 0); });
  const categoryData = Object.entries(categoryMap).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);
  const categoryChartConfig = Object.fromEntries(categoryData.map((c, i) => [c.name, { label: c.name, color: CHART_COLORS[i % CHART_COLORS.length] }]));

  const tripSpendMap: Record<string, number> = {};
  spendExpenses.filter(e => e.trip_id).forEach(e => { tripSpendMap[e.trip_id!] = (tripSpendMap[e.trip_id!] ?? 0) + (e.base_amount ?? 0); });

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading dashboard…</div>;

  return (
    <div className="space-y-6">
      <InstallBanner />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <Button variant={showFilters ? 'default' : 'outline'} size="sm" onClick={() => setShowFilters(!showFilters)} className="gap-1.5">
          <Filter className="h-3.5 w-3.5" /> Filters
        </Button>
      </div>

      {showFilters && (
        <Card>
          <CardContent className="p-4">
            <div className="flex flex-wrap items-end gap-3">
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">From</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn('w-[140px] justify-start text-left font-normal h-9', !filterDateFrom && 'text-muted-foreground')}>
                      <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                      {filterDateFrom ? format(filterDateFrom, 'dd MMM yyyy') : 'Start date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={filterDateFrom} onSelect={setFilterDateFrom} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
              <div className="space-y-1">
                <label className="text-xs font-medium text-muted-foreground">To</label>
                <Popover>
                  <PopoverTrigger asChild>
                    <Button variant="outline" size="sm" className={cn('w-[140px] justify-start text-left font-normal h-9', !filterDateTo && 'text-muted-foreground')}>
                      <CalendarIcon className="h-3.5 w-3.5 mr-1.5" />
                      {filterDateTo ? format(filterDateTo, 'dd MMM yyyy') : 'End date'}
                    </Button>
                  </PopoverTrigger>
                  <PopoverContent className="w-auto p-0" align="start">
                    <Calendar mode="single" selected={filterDateTo} onSelect={setFilterDateTo} initialFocus className="p-3 pointer-events-auto" />
                  </PopoverContent>
                </Popover>
              </div>
            </div>
          </CardContent>
        </Card>
      )}

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Total Spend</p>
            <p className="text-2xl font-bold text-foreground mt-1">{thisMonthTotal.toFixed(2)} {baseCurrency}</p>
            <div className="flex items-center gap-1 mt-1">
              {pctChange >= 0 ? <TrendingUp className="h-3.5 w-3.5 text-destructive" /> : <TrendingDown className="h-3.5 w-3.5 text-green-600" />}
              <span className={cn('text-xs font-medium', pctChange >= 0 ? 'text-destructive' : 'text-green-600')}>{Math.abs(pctChange).toFixed(1)}% vs last month</span>
            </div>
          </CardContent>
        </Card>
        <Card className={cn(pendingManagerCount > 0 && 'border-amber-300 cursor-pointer')} onClick={() => window.location.href = '/my-team'}>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Awaiting Manager Approval</p>
            <p className={cn('text-2xl font-bold mt-1', pendingManagerCount > 0 ? 'text-amber-600' : 'text-foreground')}>{pendingManagerCount}</p>
            <p className="text-xs text-primary mt-1">Go to My Team →</p>
          </CardContent>
        </Card>
        <Card className="cursor-pointer" onClick={() => window.location.href = '/finance-review'}>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Approved — Awaiting Payment</p>
            <p className="text-2xl font-bold text-foreground mt-1">{approvedAwaitingCount}</p>
            <p className="text-xs text-primary mt-1">Go to Finance Review →</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Flagged Expenses</p>
            <p className="text-2xl font-bold text-foreground mt-1">{flaggedExpenses.length}</p>
          </CardContent>
        </Card>
      </div>

      {/* Shortcut cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-primary/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <UsersRound className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">My Team — Approval Queue</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{pendingManagerCount} pending expenses</p>
                </div>
              </div>
              <Link to="/my-team"><Button size="sm" className="gap-1.5">Review <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Finance Review</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{approvedAwaitingCount} approved awaiting payment</p>
                </div>
              </div>
              <Link to="/finance-review"><Button size="sm" className="gap-1.5">Process <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Team Spend by Employee</CardTitle></CardHeader>
          <CardContent>
            {employeeData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ChartContainer config={{ total: { label: 'Spend', color: 'hsl(222 47% 30%)' } }} className="aspect-video max-h-[250px]">
                <BarChart data={employeeData} layout="vertical">
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis dataKey="name" type="category" width={100} tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="total" fill="hsl(222 47% 30%)" radius={[0, 3, 3, 0]} />
                </BarChart>
              </ChartContainer>
            )}
          </CardContent>
        </Card>
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Spend by Category</CardTitle></CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No data yet</p>
            ) : (
              <ChartContainer config={categoryChartConfig} className="aspect-square max-h-[220px] mx-auto">
                <PieChart>
                  <Pie data={categoryData} dataKey="value" nameKey="name" innerRadius={45} outerRadius={80} paddingAngle={2}>
                    {categoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                  </Pie>
                  <ChartTooltip content={<ChartTooltipContent />} />
                </PieChart>
              </ChartContainer>
            )}
            <div className="flex flex-wrap gap-2 mt-2 justify-center">
              {categoryData.slice(0, 6).map((c, i) => (
                <div key={c.name} className="flex items-center gap-1 text-xs">
                  <div className="h-2.5 w-2.5 rounded-sm" style={{ background: CHART_COLORS[i % CHART_COLORS.length] }} />
                  <span className="text-muted-foreground">{c.name}</span>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Trip progress */}
      {activeTrips.length > 0 && (
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Trip Advances vs Spend</CardTitle></CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            {activeTrips.map(t => {
              const spent = tripSpendMap[t.id] ?? t.total_spend ?? 0;
              const budget = t.budget_aed ?? 0;
              const pct = budget > 0 ? (spent / budget) * 100 : 0;
              return (
                <div key={t.id} className="p-3 rounded-lg bg-muted/50 border border-border">
                  <p className="text-sm font-medium text-foreground">{t.name}</p>
                  <p className="text-xs text-muted-foreground mt-1">Spend {spent.toFixed(0)} / advance {budget.toFixed(0)} {baseCurrency}</p>
                  <div className="relative h-2 w-full overflow-hidden rounded-full bg-secondary mt-2">
                    <div className={cn('h-full rounded-full transition-all', pct > 90 ? 'bg-destructive' : 'bg-primary')} style={{ width: `${Math.min(pct, 100)}%` }} />
                  </div>
                </div>
              );
            })}
          </CardContent>
        </Card>
      )}

      {/* Recent expenses */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recent Expenses</CardTitle>
            <Link to="/expenses" className="text-xs text-primary hover:underline">View all</Link>
          </div>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Date</TableHead><TableHead>Vendor</TableHead><TableHead>Employee</TableHead>
                <TableHead className="text-right">Amount</TableHead><TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filteredExpenses.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No expenses</TableCell></TableRow>
              ) : filteredExpenses.slice(0, 10).map(e => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{format(new Date(e.date), 'dd MMM')}</TableCell>
                  <TableCell className="text-xs">{e.vendor ?? '—'}</TableCell>
                  <TableCell className="text-xs">{e.employee_name ?? '—'}</TableCell>
                  <TableCell className="text-xs text-right">{(e.base_amount ?? e.amount).toFixed(2)}</TableCell>
                  <TableCell><Badge variant="outline" className={cn('capitalize text-[10px] px-1.5 py-0', statusBadge(e.status))}>{e.status ?? 'pending'}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default AdminDashboard;
