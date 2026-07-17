import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import { Plus } from 'lucide-react';

type Budget = {
  id: string; department: string; budget_amount: number; month: number; year: number;
};

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

const BudgetsSection = () => {
  const { user, selectedCompanyId } = useAuth();
  const [budgets, setBudgets] = useState<Budget[]>([]);
  const [departments, setDepartments] = useState<string[]>([]);
  const [baseCurrency, setBaseCurrency] = useState('USD');
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);

  const now = new Date();
  const [viewMonth, setViewMonth] = useState(now.getMonth() + 1);
  const [viewYear, setViewYear] = useState(now.getFullYear());

  // Form
  const [formDept, setFormDept] = useState('');
  const [formAmount, setFormAmount] = useState('');
  const [formMonth, setFormMonth] = useState(String(now.getMonth() + 1));
  const [formYear, setFormYear] = useState(String(now.getFullYear()));
  const [saving, setSaving] = useState(false);

  const fetch = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const [{ data: bData }, { data: dData }, { data: cData }] = await Promise.all([
      supabase.from('budgets').select('*').eq('company_id', selectedCompanyId).eq('month', viewMonth).eq('year', viewYear),
      supabase.from('employees').select('department').eq('company_id', selectedCompanyId).not('department', 'is', null),
      supabase.from('companies').select('base_currency').eq('id', selectedCompanyId).single(),
    ]);
    setBudgets((bData ?? []) as Budget[]);
    const depts = [...new Set((dData ?? []).map(d => d.department).filter(Boolean))] as string[];
    setDepartments(depts);
    if (cData) setBaseCurrency(cData.base_currency);
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [selectedCompanyId, viewMonth, viewYear]);

  const handleSave = async () => {
    if (!formDept.trim() || !formAmount || !selectedCompanyId || !user) return;
    setSaving(true);
    const { error } = await supabase.from('budgets').insert({
      company_id: selectedCompanyId, department: formDept.trim(),
      month: parseInt(formMonth), year: parseInt(formYear),
      budget_amount: parseFloat(formAmount),
    });
    if (error) { toast.error(error.message); setSaving(false); return; }
    await supabase.from('audit_log').insert({
      company_id: selectedCompanyId, user_id: user.id, action: 'create', table_name: 'budgets',
      new_values: { department: formDept, amount: formAmount } as any,
    });
    toast.success('Budget added');
    setShowForm(false); setFormDept(''); setFormAmount('');
    fetch(); setSaving(false);
  };

  return (
    <div className="bg-card rounded-lg border p-5">
      <div className="flex items-center justify-between mb-4">
        <h2 className="text-lg font-semibold text-foreground">Department Budgets</h2>
        <div className="flex items-center gap-2">
          <Select value={String(viewMonth)} onValueChange={v => setViewMonth(parseInt(v))}>
            <SelectTrigger className="w-24"><SelectValue /></SelectTrigger>
            <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
          </Select>
          <Input type="number" className="w-20" value={viewYear} onChange={e => setViewYear(parseInt(e.target.value) || now.getFullYear())} />
          <Button size="sm" onClick={() => setShowForm(true)}><Plus className="h-4 w-4 mr-1" />Add</Button>
        </div>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Department</TableHead>
            <TableHead className="text-right">Budget</TableHead>
            <TableHead className="text-right">Spent</TableHead>
            <TableHead className="text-right">Remaining</TableHead>
            <TableHead>% Used</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">Loading…</TableCell></TableRow>
          ) : budgets.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No budgets set for {MONTHS[viewMonth - 1]} {viewYear}</TableCell></TableRow>
          ) : budgets.map(b => {
            const spent = 0; // TODO: aggregate from expenses by department
            const remaining = b.budget_amount - spent;
            const pct = b.budget_amount > 0 ? (spent / b.budget_amount) * 100 : 0;
            const barColor = pct > 90 ? 'bg-destructive' : pct > 70 ? 'bg-amber-500' : 'bg-green-500';
            return (
              <TableRow key={b.id}>
                <TableCell className="font-medium">{b.department}</TableCell>
                <TableCell className="text-right">{b.budget_amount.toFixed(2)} {baseCurrency}</TableCell>
                <TableCell className="text-right">{spent.toFixed(2)}</TableCell>
                <TableCell className="text-right">{remaining.toFixed(2)}</TableCell>
                <TableCell>
                  <div className="flex items-center gap-2">
                    <div className="h-2 w-20 rounded-full bg-secondary overflow-hidden">
                      <div className={cn('h-full rounded-full', barColor)} style={{ width: `${Math.min(pct, 100)}%` }} />
                    </div>
                    <span className="text-xs text-muted-foreground">{pct.toFixed(0)}%</span>
                  </div>
                </TableCell>
              </TableRow>
            );
          })}
        </TableBody>
      </Table>

      <Sheet open={showForm} onOpenChange={open => { if (!open) setShowForm(false); }}>
        <SheetContent className="sm:max-w-sm">
          <SheetHeader><SheetTitle>Add Budget</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Department</Label>
              {departments.length > 0 ? (
                <Select value={formDept} onValueChange={setFormDept}>
                  <SelectTrigger><SelectValue placeholder="Select department" /></SelectTrigger>
                  <SelectContent>
                    {departments.map(d => <SelectItem key={d} value={d}>{d}</SelectItem>)}
                    <SelectItem value="__custom">Other…</SelectItem>
                  </SelectContent>
                </Select>
              ) : (
                <Input value={formDept} onChange={e => setFormDept(e.target.value)} placeholder="Department name" />
              )}
              {formDept === '__custom' && <Input className="mt-2" placeholder="Enter department name" onChange={e => setFormDept(e.target.value)} />}
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <Label>Month</Label>
                <Select value={formMonth} onValueChange={setFormMonth}>
                  <SelectTrigger><SelectValue /></SelectTrigger>
                  <SelectContent>{MONTHS.map((m, i) => <SelectItem key={i} value={String(i + 1)}>{m}</SelectItem>)}</SelectContent>
                </Select>
              </div>
              <div>
                <Label>Year</Label>
                <Input type="number" value={formYear} onChange={e => setFormYear(e.target.value)} />
              </div>
            </div>
            <div>
              <Label>Budget Amount ({baseCurrency})</Label>
              <Input type="number" min="0" step="0.01" value={formAmount} onChange={e => setFormAmount(e.target.value)} />
            </div>
            <Button className="w-full" onClick={handleSave} disabled={!formDept.trim() || !formAmount || saving}>
              {saving ? 'Saving…' : 'Add Budget'}
            </Button>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default BudgetsSection;
