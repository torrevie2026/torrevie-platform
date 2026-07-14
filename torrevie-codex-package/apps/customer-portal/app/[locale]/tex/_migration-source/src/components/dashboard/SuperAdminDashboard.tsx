import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth, addDays } from 'date-fns';
import { Building2, Users, Receipt, DollarSign } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { cn } from '@/lib/utils';

type Company = {
  id: string; name: string; country_code: string; plan: string | null;
  trial_expires_at: string | null; created_at: string | null;
};

type CompanyRow = Company & { employeeCount: number; expenseCount: number; lastActivity: string | null };

const PLAN_PRICES: Record<string, number> = { starter: 49, business: 149, enterprise: 499 };

const SuperAdminDashboard = () => {
  const [companies, setCompanies] = useState<CompanyRow[]>([]);
  const [totalExpenses, setTotalExpenses] = useState(0);
  const [loading, setLoading] = useState(true);

  const now = new Date();
  const monthStart = format(startOfMonth(now), 'yyyy-MM-dd');
  const monthEnd = format(endOfMonth(now), 'yyyy-MM-dd');
  const sevenDaysFromNow = addDays(now, 7).toISOString();
  const threeDaysFromNow = addDays(now, 3).toISOString();
  const fourteenDaysAgo = format(addDays(now, -14), 'yyyy-MM-dd');

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      const { data: allCompanies } = await supabase.from('companies').select('id, name, country_code, plan, trial_expires_at, created_at');
      if (!allCompanies) { setLoading(false); return; }

      // Get counts per company
      const rows: CompanyRow[] = [];
      for (const c of allCompanies) {
        const [empRes, expRes, lastExpRes] = await Promise.all([
          supabase.from('employees').select('id', { count: 'exact', head: true }).eq('company_id', c.id),
          supabase.from('expenses').select('id', { count: 'exact', head: true }).eq('company_id', c.id).gte('date', monthStart).lte('date', monthEnd),
          supabase.from('expenses').select('created_at').eq('company_id', c.id).order('created_at', { ascending: false }).limit(1),
        ]);
        rows.push({
          ...c,
          employeeCount: empRes.count ?? 0,
          expenseCount: expRes.count ?? 0,
          lastActivity: lastExpRes.data?.[0]?.created_at ?? null,
        });
      }

      setCompanies(rows);
      setTotalExpenses(rows.reduce((s, r) => s + r.expenseCount, 0));
      setLoading(false);
    };
    load();
  }, []);

  const trialCompanies = companies.filter(c => c.plan === 'trial');
  const trialExpiringSoon = trialCompanies.filter(c => c.trial_expires_at && new Date(c.trial_expires_at) <= new Date(sevenDaysFromNow));
  const payingCompanies = companies.filter(c => c.plan && c.plan !== 'trial');
  const revenue = payingCompanies.reduce((s, c) => s + (PLAN_PRICES[c.plan ?? ''] ?? 0), 0);

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading platform overview…</div>;

  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold text-foreground">Platform Overview</h1>

      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground"><Building2 className="h-4 w-4" /><span className="text-sm">Total Companies</span></div>
            <p className="text-2xl font-bold text-foreground mt-1">{companies.length}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground"><Users className="h-4 w-4" /><span className="text-sm">On Trial</span></div>
            <p className="text-2xl font-bold text-foreground mt-1">{trialCompanies.length}</p>
            {trialExpiringSoon.length > 0 && <p className="text-xs text-amber-600 mt-1">{trialExpiringSoon.length} expiring within 7 days</p>}
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground"><Receipt className="h-4 w-4" /><span className="text-sm">Expenses This Month</span></div>
            <p className="text-2xl font-bold text-foreground mt-1">{totalExpenses}</p>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-5">
            <div className="flex items-center gap-2 text-muted-foreground"><DollarSign className="h-4 w-4" /><span className="text-sm">Platform Revenue</span></div>
            <p className="text-2xl font-bold text-foreground mt-1">${revenue}/mo</p>
            <p className="text-xs text-muted-foreground mt-1">{payingCompanies.length} paying</p>
          </CardContent>
        </Card>
      </div>

      <Card>
        <CardHeader className="pb-2"><CardTitle className="text-base">Company Health</CardTitle></CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Company</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Trial Expiry</TableHead>
                <TableHead className="text-right">Employees</TableHead>
                <TableHead className="text-right">Expenses (Month)</TableHead>
                <TableHead>Last Activity</TableHead>
                <TableHead>Status</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.length === 0 ? (
                <TableRow><TableCell colSpan={8} className="text-center py-4 text-muted-foreground">No companies</TableCell></TableRow>
              ) : companies.map(c => {
                const isExpiringSoon = c.trial_expires_at && new Date(c.trial_expires_at) <= new Date(threeDaysFromNow) && c.plan === 'trial';
                const isInactive = c.lastActivity && new Date(c.lastActivity) < new Date(fourteenDaysAgo + 'T00:00:00Z');
                return (
                  <TableRow key={c.id} className={cn(isExpiringSoon ? 'bg-amber-50 dark:bg-amber-950/20' : isInactive ? 'bg-muted/50' : '')}>
                    <TableCell className="text-sm font-medium">{c.name}</TableCell>
                    <TableCell className="text-sm">{c.country_code}</TableCell>
                    <TableCell><Badge variant="outline" className="capitalize text-xs">{c.plan ?? 'trial'}</Badge></TableCell>
                    <TableCell className="text-xs">{c.trial_expires_at ? format(new Date(c.trial_expires_at), 'dd MMM yyyy') : '—'}</TableCell>
                    <TableCell className="text-sm text-right">{c.employeeCount}</TableCell>
                    <TableCell className="text-sm text-right">{c.expenseCount}</TableCell>
                    <TableCell className="text-xs">{c.lastActivity ? format(new Date(c.lastActivity), 'dd MMM HH:mm') : 'Never'}</TableCell>
                    <TableCell>
                      {isExpiringSoon ? <Badge className="bg-amber-100 text-amber-800 border-amber-200 text-[10px]">Expiring</Badge>
                        : isInactive ? <Badge variant="outline" className="text-muted-foreground text-[10px]">Inactive</Badge>
                        : <Badge className="bg-green-100 text-green-800 border-green-200 text-[10px]">Active</Badge>}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>
    </div>
  );
};

export default SuperAdminDashboard;
