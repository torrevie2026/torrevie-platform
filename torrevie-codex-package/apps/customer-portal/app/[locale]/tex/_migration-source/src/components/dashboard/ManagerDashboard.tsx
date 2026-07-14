import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { apiRequest } from '@/lib/api';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Plus, ArrowRight, UsersRound } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import InstallBanner from '@/components/InstallBanner';

const statusBadge = (s: string | null) => {
  if (s === 'approved') return 'bg-green-100 text-green-800 border-green-200';
  if (s === 'rejected') return 'bg-red-100 text-red-800 border-red-200';
  if (s === 'paid') return 'bg-teal-100 text-teal-800 border-teal-200';
  return 'bg-amber-100 text-amber-800 border-amber-200';
};

type Expense = {
  id: string; date: string; vendor: string | null; category: string | null;
  amount: number; currency: string; base_amount: number | null; status: string | null;
  employee_name: string | null;
};

const ManagerDashboard = () => {
  const { user, selectedCompanyId, companies } = useAuth();
  const [company, setCompany] = useState<{ base_currency: string } | null>(null);
  const [teamExpenses, setTeamExpenses] = useState<Expense[]>([]);
  const [myExpenses, setMyExpenses] = useState<Expense[]>([]);
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
        teamPendingExpenses: Expense[];
        myMonthExpenses: Expense[];
      }>(`/api/tex/dashboard?company_id=${encodeURIComponent(selectedCompanyId)}&date_from=${encodeURIComponent(monthStart)}&date_to=${encodeURIComponent(monthEnd)}`);
      setCompany(data.company);
      setTeamExpenses(data.teamPendingExpenses ?? []);
      setMyExpenses(data.myMonthExpenses ?? []);
      setLoading(false);
    };
    load();
  }, [selectedCompanyId, user, monthStart, monthEnd]);

  const selectedCompany = companies?.find((item) => item.id === selectedCompanyId);
  const baseCurrency = company?.base_currency || selectedCompany?.base_currency || 'AED';
  const pendingCount = teamExpenses.length;
  const pendingTotal = teamExpenses.reduce((s, e) => s + (e.base_amount ?? e.amount), 0);
  const myTotal = myExpenses.reduce((s, e) => s + (e.base_amount ?? 0), 0);
  const myPending = myExpenses.filter(e => e.status === 'pending').length;

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <InstallBanner />
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Dashboard</h1>
        <Link to="/expenses/new">
          <Button className="gap-2"><Plus className="h-4 w-4" /> New Expense</Button>
        </Link>
      </div>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card className={cn(pendingCount > 0 && 'border-amber-300 cursor-pointer')} onClick={() => window.location.href = '/my-team'}>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">Team — Awaiting Approval</p>
            <p className={cn('text-2xl font-bold mt-1', pendingCount > 0 ? 'text-amber-600' : 'text-foreground')}>{pendingCount}</p>
            <p className="text-xs text-muted-foreground mt-1">{baseCurrency} {pendingTotal.toFixed(2)}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">My Spend This Month</p>
            <p className="text-2xl font-bold text-foreground mt-1">{myTotal.toFixed(2)} {baseCurrency}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">My Pending</p>
            <p className="text-2xl font-bold text-foreground mt-1">{myPending}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <p className="text-sm text-muted-foreground">My Expenses</p>
            <p className="text-2xl font-bold text-foreground mt-1">{myExpenses.length}</p>
            <p className="text-xs text-muted-foreground mt-1">{format(now, 'MMMM yyyy')}</p>
          </CardContent>
        </Card>
      </div>

      {/* Team approval shortcut */}
      <Card className="border-primary/30">
        <CardContent className="p-5">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-3">
              <UsersRound className="h-5 w-5 text-primary" />
              <div>
                <p className="text-sm font-semibold text-foreground">Team Approval Queue</p>
                <p className="text-xs text-muted-foreground mt-0.5">{pendingCount} expenses awaiting your review · {baseCurrency} {pendingTotal.toFixed(2)}</p>
              </div>
            </div>
            <Link to="/my-team">
              <Button size="sm" className="gap-1.5">Review <ArrowRight className="h-3.5 w-3.5" /></Button>
            </Link>
          </div>
        </CardContent>
      </Card>

      {/* Recent pending from team */}
      {teamExpenses.length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <div className="flex items-center justify-between">
              <CardTitle className="text-base">Pending from Team</CardTitle>
              <Link to="/my-team" className="text-xs text-primary hover:underline">View all</Link>
            </div>
          </CardHeader>
          <CardContent className="space-y-2">
            {teamExpenses.slice(0, 5).map(e => (
              <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
                <div>
                  <p className="text-sm font-medium text-foreground">{e.vendor ?? 'No vendor'}</p>
                  <p className="text-xs text-muted-foreground">{e.employee_name} · {format(new Date(e.date), 'dd MMM')}</p>
                </div>
                <span className="text-sm font-medium">{(e.base_amount ?? e.amount).toFixed(2)} {baseCurrency}</span>
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* My recent expenses */}
      <Card>
        <CardHeader className="pb-2">
          <div className="flex items-center justify-between">
            <CardTitle className="text-base">My Recent Expenses</CardTitle>
            <Link to="/expenses" className="text-xs text-primary hover:underline">View all</Link>
          </div>
        </CardHeader>
        <CardContent className="space-y-2">
          {myExpenses.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-4">No expenses this month</p>
          ) : myExpenses.slice(0, 8).map(e => (
            <div key={e.id} className="flex items-center justify-between py-1.5 border-b border-border last:border-0">
              <div>
                <p className="text-sm font-medium text-foreground">{e.vendor ?? 'No vendor'}</p>
                <p className="text-xs text-muted-foreground">{format(new Date(e.date), 'dd MMM yyyy')}</p>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-sm font-medium">{(e.base_amount ?? e.amount).toFixed(2)}</span>
                <Badge variant="outline" className={cn('capitalize text-[10px] px-1.5 py-0', statusBadge(e.status))}>{e.status ?? 'pending'}</Badge>
              </div>
            </div>
          ))}
        </CardContent>
      </Card>
    </div>
  );
};

export default ManagerDashboard;
