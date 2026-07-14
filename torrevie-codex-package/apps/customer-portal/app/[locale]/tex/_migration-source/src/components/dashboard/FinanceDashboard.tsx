import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import { format, startOfMonth, endOfMonth, subMonths } from 'date-fns';
import { DollarSign, AlertTriangle, CheckCircle, FileText, ArrowRight, Clock } from 'lucide-react';
import InstallBanner from '@/components/InstallBanner';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell, BarChart, Bar, XAxis, YAxis, CartesianGrid } from 'recharts';
import { cn } from '@/lib/utils';

const CHART_COLORS = [
  'hsl(170 84% 32%)', 'hsl(32 95% 44%)', 'hsl(0 72% 51%)', 'hsl(142 72% 37%)',
  'hsl(222 47% 30%)', 'hsl(280 60% 50%)', 'hsl(200 70% 45%)', 'hsl(45 90% 50%)',
];

type Expense = {
  id: string; date: string; vendor: string | null; employee_name: string | null;
  category: string | null; amount: number; currency: string; base_amount: number | null;
  status: string | null; policy_flag: boolean | null; created_at: string | null;
  trip_id: string | null; trip_name: string | null;
};

type Trip = { id: string; name: string; status: string | null; budget_aed: number | null };

const FinanceDashboard = () => {
  const { selectedCompanyId, companies } = useAuth();
  const [company, setCompany] = useState<{ base_currency: string } | null>(null);
  const [approved, setApproved] = useState<Expense[]>([]);
  const [paidThisMonth, setPaidThisMonth] = useState<Expense[]>([]);
  const [recentPaid, setRecentPaid] = useState<Expense[]>([]);
  const [paidLast6, setPaidLast6] = useState<Expense[]>([]);
  const [activeTrips, setActiveTrips] = useState<Trip[]>([]);
  const [tripSpend, setTripSpend] = useState<Record<string, number>>({});
  const [driverAdvanceTotal, setDriverAdvanceTotal] = useState(0);
  const [unpaidTripPayoutTotal, setUnpaidTripPayoutTotal] = useState(0);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const sixMonthsAgo = format(startOfMonth(subMonths(now, 5)), 'yyyy-MM-dd');

  useEffect(() => {
    if (!selectedCompanyId) return;
    const load = async () => {
      setLoading(true);
      const data = await apiRequest<{
        company: { base_currency: string } | null;
        approved: Expense[];
        paidThisMonth: Expense[];
        recentPaid: Expense[];
        paidLast6: Expense[];
        activeTrips: Trip[];
        tripSpend: Record<string, number>;
        driverAdvanceTotal: number;
        unpaidTripPayoutTotal: number;
      }>(`/api/tex/dashboard?company_id=${encodeURIComponent(selectedCompanyId)}&date_from=${encodeURIComponent(monthStart)}&date_to=${encodeURIComponent(monthEnd)}&month=${now.getMonth() + 1}&year=${now.getFullYear()}`);

      setCompany(data.company);
      setApproved(data.approved ?? []);
      setPaidThisMonth(data.paidThisMonth ?? []);
      setRecentPaid(data.recentPaid ?? []);
      setPaidLast6(data.paidLast6 ?? []);
      setActiveTrips(data.activeTrips ?? []);
      setTripSpend(data.tripSpend ?? {});
      setDriverAdvanceTotal(data.driverAdvanceTotal ?? 0);
      setUnpaidTripPayoutTotal(data.unpaidTripPayoutTotal ?? 0);
      setLoading(false);
    };
    load();
  }, [selectedCompanyId]);

  const selectedCompany = companies?.find((item) => item.id === selectedCompanyId);
  const baseCurrency = company?.base_currency || selectedCompany?.base_currency || 'AED';
  const awaitingTotal = approved.reduce((s, e) => s + (e.base_amount ?? 0), 0) + unpaidTripPayoutTotal;
  const paidMonthTotal = paidThisMonth.reduce((s, e) => s + (e.base_amount ?? 0), 0);
  const flaggedCount = approved.filter(e => e.policy_flag).length;

  // Category (from approved + paid-this-month for finance perspective)
  const catSource = [...approved, ...paidThisMonth];
  const categoryMap: Record<string, number> = {};
  catSource.forEach(e => { const c = e.category ?? 'Other'; categoryMap[c] = (categoryMap[c] ?? 0) + (e.base_amount ?? 0); });
  const categoryData = Object.entries(categoryMap).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);
  const categoryChartConfig = Object.fromEntries(categoryData.map((c, i) => [c.name, { label: c.name, color: CHART_COLORS[i % CHART_COLORS.length] }]));

  // Monthly payout trend (last 6 months)
  const months: { key: string; label: string; total: number }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = subMonths(now, i);
    months.push({ key: format(d, 'yyyy-MM'), label: format(d, 'MMM'), total: 0 });
  }
  paidLast6.forEach(e => {
    const k = e.date.slice(0, 7);
    const m = months.find(mm => mm.key === k);
    if (m) m.total += e.base_amount ?? 0;
  });

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading dashboard…</div>;

  return (
    <div className="space-y-6">
      <InstallBanner />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Finance Dashboard</h1>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Link to="/finance-review">
          <Card className={cn('h-full hover:border-primary/50 transition-colors', approved.length > 0 && 'border-amber-300')}>
            <CardContent className="p-5">
              <div className="flex items-center gap-1.5 text-muted-foreground"><Clock className="h-3.5 w-3.5" /><p className="text-sm">Awaiting Payment</p></div>
              <p className={cn('text-2xl font-bold mt-1', approved.length > 0 ? 'text-amber-600' : 'text-foreground')}>{approved.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{awaitingTotal.toFixed(2)} {baseCurrency}</p>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-1.5 text-muted-foreground"><CheckCircle className="h-3.5 w-3.5" /><p className="text-sm">Paid This Month</p></div>
            <p className="text-2xl font-bold text-foreground mt-1">{paidThisMonth.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{paidMonthTotal.toFixed(2)} {baseCurrency}</p>
          </CardContent>
        </Card>
        <Link to="/finance-review?flag=flagged">
          <Card className={cn('h-full hover:border-primary/50 transition-colors', flaggedCount > 0 && 'border-destructive/40')}>
            <CardContent className="p-5">
              <div className="flex items-center gap-1.5 text-muted-foreground"><AlertTriangle className="h-3.5 w-3.5" /><p className="text-sm">Flagged Expenses</p></div>
              <p className={cn('text-2xl font-bold mt-1', flaggedCount > 0 ? 'text-destructive' : 'text-foreground')}>{flaggedCount}</p>
              <p className="text-xs text-primary mt-1">Review →</p>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-1.5 text-muted-foreground"><DollarSign className="h-3.5 w-3.5" /><p className="text-sm">Outstanding Settlement</p></div>
            <p className="text-2xl font-bold text-foreground mt-1">{awaitingTotal.toFixed(2)}</p>
            <p className="text-xs text-muted-foreground mt-1">{baseCurrency} incl. trip payouts</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Driver Advances This Month</p>
            <p className="text-2xl font-bold text-foreground mt-1">{driverAdvanceTotal.toFixed(2)} {baseCurrency}</p>
            <p className="text-xs text-muted-foreground mt-1">Includes trip budgets</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Unpaid Trip Driver Amounts</p>
            <p className="text-2xl font-bold text-foreground mt-1">{unpaidTripPayoutTotal.toFixed(2)} {baseCurrency}</p>
          </CardContent>
        </Card>
      </div>

      {/* Shortcut cards */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card className="border-primary/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <DollarSign className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Finance Review</p>
                  <p className="text-xs text-muted-foreground mt-0.5">{approved.length} approved awaiting payment</p>
                </div>
              </div>
              <Link to="/finance-review"><Button size="sm" className="gap-1.5">Process <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
            </div>
          </CardContent>
        </Card>
        <Card className="border-primary/30">
          <CardContent className="p-5">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-primary" />
                <div>
                  <p className="text-sm font-semibold text-foreground">Reports</p>
                  <p className="text-xs text-muted-foreground mt-0.5">Tax reports &amp; exports</p>
                </div>
              </div>
              <Link to="/reports"><Button size="sm" variant="outline" className="gap-1.5">Open <ArrowRight className="h-3.5 w-3.5" /></Button></Link>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* Charts */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Monthly Payout Trend</CardTitle></CardHeader>
          <CardContent>
            {months.every(m => m.total === 0) ? (
              <p className="text-sm text-muted-foreground text-center py-8">No payouts yet</p>
            ) : (
              <ChartContainer config={{ total: { label: 'Paid', color: 'hsl(170 84% 32%)' } }} className="aspect-video max-h-[250px]">
                <BarChart data={months}>
                  <CartesianGrid strokeDasharray="3 3" className="stroke-border" />
                  <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                  <YAxis tick={{ fontSize: 11 }} />
                  <ChartTooltip content={<ChartTooltipContent />} />
                  <Bar dataKey="total" fill="hsl(170 84% 32%)" radius={[3, 3, 0, 0]} />
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
              const spent = tripSpend[t.id] ?? 0;
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

      {/* Recently paid */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">Recently Paid</CardTitle>
            <Link to="/expenses?status=paid" className="text-xs text-primary hover:underline">View all</Link>
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
              {recentPaid.length === 0 ? (
                <TableRow><TableCell colSpan={5} className="text-center py-4 text-muted-foreground">No paid expenses yet</TableCell></TableRow>
              ) : recentPaid.map(e => (
                <TableRow key={e.id}>
                  <TableCell className="text-xs">{format(new Date(e.date), 'dd MMM')}</TableCell>
                  <TableCell className="text-xs">{e.vendor ?? '—'}</TableCell>
                  <TableCell className="text-xs">{e.employee_name ?? '—'}</TableCell>
                  <TableCell className="text-xs text-right">{(e.base_amount ?? e.amount).toFixed(2)} {baseCurrency}</TableCell>
                  <TableCell><Badge variant="outline" className="bg-teal-100 text-teal-800 border-teal-200 capitalize text-[10px] px-1.5 py-0">{e.status}</Badge></TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default FinanceDashboard;
