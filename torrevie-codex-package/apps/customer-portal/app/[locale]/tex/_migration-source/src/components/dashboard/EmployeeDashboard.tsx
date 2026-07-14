import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Plus, MapPin } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChartContainer, ChartTooltip, ChartTooltipContent } from '@/components/ui/chart';
import { PieChart, Pie, Cell } from 'recharts';
import { cn } from '@/lib/utils';
import InstallBanner from '@/components/InstallBanner';

const CHART_COLORS = [
  'hsl(170 84% 32%)', 'hsl(32 95% 44%)', 'hsl(0 72% 51%)', 'hsl(142 72% 37%)',
  'hsl(222 47% 30%)', 'hsl(280 60% 50%)', 'hsl(200 70% 45%)', 'hsl(45 90% 50%)',
];

const statusBadge = (s: string | null) => {
  if (s === 'approved') return 'bg-green-100 text-green-800 border-green-200';
  if (s === 'rejected') return 'bg-red-100 text-red-800 border-red-200';
  if (s === 'paid') return 'bg-teal-100 text-teal-800 border-teal-200';
  if (s === 'draft') return 'bg-muted text-muted-foreground border-border';
  return 'bg-amber-100 text-amber-800 border-amber-200';
};

type Expense = {
  id: string; date: string; vendor: string | null; category: string | null;
  amount: number; currency: string; base_amount: number | null; status: string | null;
  trip_id: string | null; trip_name: string | null;
};

const EmployeeDashboard = () => {
  const { user, selectedCompanyId, companies } = useAuth();
  const [company, setCompany] = useState<{ base_currency: string } | null>(null);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [recentExpenses, setRecentExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');

  useEffect(() => {
    if (!selectedCompanyId || !user) return;
    const load = async () => {
      setLoading(true);
      const data = await apiRequest<{
        company: { base_currency: string } | null;
        myMonthExpenses: Expense[];
        myRecentExpenses: Expense[];
      }>(`/api/tex/dashboard?company_id=${encodeURIComponent(selectedCompanyId)}&date_from=${encodeURIComponent(monthStart)}&date_to=${encodeURIComponent(monthEnd)}`);

      setCompany(data.company);
      setExpenses(data.myMonthExpenses ?? []);
      setRecentExpenses(data.myRecentExpenses ?? []);
      setLoading(false);
    };
    load();
  }, [selectedCompanyId, user, monthStart, monthEnd]);

  const selectedCompany = companies?.find((item) => item.id === selectedCompanyId);
  const baseCurrency = company?.base_currency || selectedCompany?.base_currency || 'AED';
  const totalSpend = expenses.reduce((s, e) => s + (e.base_amount ?? 0), 0);
  const pendingCount = expenses.filter(e => e.status === 'pending').length;
  const approvedCount = expenses.filter(e => e.status === 'approved' || e.status === 'paid').length;

  // Category donut
  const categoryMap: Record<string, number> = {};
  expenses.forEach(e => {
    const cat = e.category ?? 'Other';
    categoryMap[cat] = (categoryMap[cat] ?? 0) + (e.base_amount ?? 0);
  });
  const categoryData = Object.entries(categoryMap).map(([name, value]) => ({ name, value: Math.round(value * 100) / 100 })).sort((a, b) => b.value - a.value);
  const categoryChartConfig = Object.fromEntries(categoryData.map((c, i) => [c.name, { label: c.name, color: CHART_COLORS[i % CHART_COLORS.length] }]));

  // Reimbursement - approved but not paid
  const outstandingExpenses = recentExpenses.filter(e => e.status === 'approved');
  const outstandingTotal = outstandingExpenses.reduce((s, e) => s + (e.base_amount ?? e.amount), 0);

  // Trip grouping
  const tripMap: Record<string, { name: string; total: number; count: number }> = {};
  expenses.filter(e => e.trip_id).forEach(e => {
    const key = e.trip_id!;
    if (!tripMap[key]) tripMap[key] = { name: e.trip_name ?? 'Unnamed Trip', total: 0, count: 0 };
    tripMap[key].total += e.base_amount ?? 0;
    tripMap[key].count++;
  });

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading dashboard…</div>;

  return (
    <div className="space-y-6">
      <InstallBanner />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">My Dashboard</h1>
        <Link to="/new-expense">
          <Button size="lg" className="gap-2">
            <Plus className="h-5 w-5" /> New Expense
          </Button>
        </Link>
      </div>

      {/* Stat cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">My Spend This Month</p>
            <p className="text-2xl font-bold text-foreground mt-1">{totalSpend.toFixed(2)} {baseCurrency}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">My Expenses</p>
            <p className="text-2xl font-bold text-foreground mt-1">{expenses.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{format(now, 'MMMM yyyy')}</p>
          </CardContent>
        </Card>
        <Link to="/expenses?status=pending">
          <Card className="hover:border-primary/50 transition-colors h-full">
            <CardContent className="p-5">
              <p className="text-sm text-muted-foreground">Pending</p>
              <p className="text-2xl font-bold text-foreground mt-1">{pendingCount}</p>
              <p className="text-xs text-primary mt-1">View pending →</p>
            </CardContent>
          </Card>
        </Link>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Approved</p>
            <p className="text-2xl font-bold text-foreground mt-1">{approvedCount}</p>
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Category donut */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">My Spend by Category</CardTitle></CardHeader>
          <CardContent>
            {categoryData.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-8">No expenses yet</p>
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

        {/* Recent activity */}
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Recent Activity</CardTitle>
              <Link to="/expenses" className="text-xs text-primary hover:underline">View all</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {recentExpenses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No expenses yet</p>
            ) : recentExpenses.map(e => (
              <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{e.vendor ?? 'No vendor'}</p>
                  <p className="text-xs text-muted-foreground">{format(new Date(e.date), 'dd MMM yyyy')}</p>
                </div>
                <div className="flex items-center gap-2">
                  <span className="text-sm font-medium text-foreground">{(e.base_amount ?? e.amount).toFixed(2)}</span>
                  <Badge variant="outline" className={cn('capitalize text-[10px] px-1.5 py-0', statusBadge(e.status))}>{e.status ?? 'pending'}</Badge>
                </div>
              </div>
            ))}
          </CardContent>
        </Card>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        {/* Trips */}
        {Object.keys(tripMap).length > 0 && (
          <Card>
            <CardHeader className="pb-2"><CardTitle className="text-base">My Trips</CardTitle></CardHeader>
            <CardContent className="space-y-3">
              {Object.entries(tripMap).map(([id, t]) => (
                <div key={id} className="flex items-center justify-between p-3 rounded-lg bg-muted/50">
                  <div className="flex items-center gap-2">
                    <MapPin className="h-4 w-4 text-muted-foreground" />
                    <div>
                      <p className="text-sm font-medium text-foreground">{t.name}</p>
                      <p className="text-xs text-muted-foreground">{t.count} expense(s)</p>
                    </div>
                  </div>
                  <span className="text-sm font-bold text-foreground">{t.total.toFixed(2)} {baseCurrency}</span>
                </div>
              ))}
            </CardContent>
          </Card>
        )}

        {/* Reimbursement status */}
        <Card>
          <CardHeader className="pb-2"><CardTitle className="text-base">Reimbursement Status</CardTitle></CardHeader>
          <CardContent>
            {outstandingExpenses.length === 0 ? (
              <p className="text-sm text-muted-foreground text-center py-4">No outstanding reimbursements</p>
            ) : (
              <>
                <div className="mb-3 p-3 rounded-lg bg-amber-50 dark:bg-amber-950/30 border border-amber-200 dark:border-amber-800">
                  <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
                    Outstanding: {outstandingTotal.toFixed(2)} {baseCurrency}
                  </p>
                  <p className="text-xs text-amber-600 dark:text-amber-400">{outstandingExpenses.length} approved expense(s) awaiting reimbursement</p>
                </div>
                {outstandingExpenses.map(e => (
                  <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                    <span className="text-sm text-foreground">{e.vendor ?? '—'}</span>
                    <span className="text-sm font-medium text-foreground">{(e.base_amount ?? e.amount).toFixed(2)}</span>
                  </div>
                ))}
              </>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
};

export default EmployeeDashboard;
