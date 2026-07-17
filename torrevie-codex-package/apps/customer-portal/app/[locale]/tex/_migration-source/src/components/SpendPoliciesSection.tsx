import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Pencil, Check, X } from 'lucide-react';
import { useExpenseCategoryNames } from '@/hooks/useExpenseCategories';


type Policy = {
  id?: string; category: string; daily_limit: number | null;
  monthly_limit: number | null; requires_notes_above: number | null;
  is_blocked: boolean | null;
};

const SpendPoliciesSection = () => {
  const { user, selectedCompanyId } = useAuth();
  const { names: CATEGORIES } = useExpenseCategoryNames(selectedCompanyId);
  const [policies, setPolicies] = useState<Policy[]>([]);
  const [loading, setLoading] = useState(true);
  const [editCat, setEditCat] = useState<string | null>(null);
  const [editForm, setEditForm] = useState<Policy | null>(null);

  const fetch = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const { data } = await supabase.from('spend_policies').select('*').eq('company_id', selectedCompanyId);
    const pMap: Record<string, Policy> = {};
    (data ?? []).forEach(p => { pMap[p.category] = p; });
    setPolicies(CATEGORIES.map(c => pMap[c] ?? { category: c, daily_limit: null, monthly_limit: null, requires_notes_above: null, is_blocked: false }));
    setLoading(false);
  };

  useEffect(() => { fetch(); }, [selectedCompanyId]);

  const startEdit = (p: Policy) => {
    setEditCat(p.category);
    setEditForm({ ...p });
  };

  const cancelEdit = () => { setEditCat(null); setEditForm(null); };

  const savePolicy = async () => {
    if (!editForm || !selectedCompanyId || !user) return;
    const payload = {
      company_id: selectedCompanyId,
      category: editForm.category,
      daily_limit: editForm.daily_limit,
      monthly_limit: editForm.monthly_limit,
      requires_notes_above: editForm.requires_notes_above,
      is_blocked: editForm.is_blocked ?? false,
    };

    if (editForm.id) {
      const { error } = await supabase.from('spend_policies').update(payload).eq('id', editForm.id);
      if (error) { toast.error(error.message); return; }
    } else {
      const { error } = await supabase.from('spend_policies').insert(payload);
      if (error) { toast.error(error.message); return; }
    }

    await supabase.from('audit_log').insert({
      company_id: selectedCompanyId, user_id: user.id,
      action: editForm.id ? 'update' : 'create', table_name: 'spend_policies',
      new_values: payload as any,
    });
    toast.success('Policy saved');
    cancelEdit(); fetch();
  };

  const toggleBlocked = async (p: Policy) => {
    if (!selectedCompanyId || !user) return;
    const newBlocked = !p.is_blocked;
    if (p.id) {
      await supabase.from('spend_policies').update({ is_blocked: newBlocked }).eq('id', p.id);
    } else {
      await supabase.from('spend_policies').insert({
        company_id: selectedCompanyId, category: p.category, is_blocked: newBlocked,
      });
    }
    await supabase.from('audit_log').insert({
      company_id: selectedCompanyId, user_id: user.id, action: 'update',
      table_name: 'spend_policies', new_values: { category: p.category, is_blocked: newBlocked } as any,
    });
    toast.success(newBlocked ? `${p.category} blocked` : `${p.category} unblocked`);
    fetch();
  };

  const fmtLimit = (v: number | null) => v != null ? v.toFixed(0) : 'No limit';

  return (
    <div className="bg-card rounded-lg border p-5">
      <h2 className="text-lg font-semibold text-foreground mb-4">Spend Policies</h2>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Category</TableHead>
            <TableHead className="text-right">Daily Limit</TableHead>
            <TableHead className="text-right">Monthly Limit</TableHead>
            <TableHead className="text-right">Notes Required Above</TableHead>
            <TableHead>Blocked</TableHead>
            <TableHead></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={6} className="text-center text-muted-foreground py-4">Loading…</TableCell></TableRow>
          ) : policies.map(p => editCat === p.category && editForm ? (
            <TableRow key={p.category}>
              <TableCell className="font-medium">{p.category}</TableCell>
              <TableCell><Input type="number" min="0" className="w-24 ml-auto" value={editForm.daily_limit ?? ''} onChange={e => setEditForm({ ...editForm, daily_limit: e.target.value ? parseFloat(e.target.value) : null })} placeholder="No limit" /></TableCell>
              <TableCell><Input type="number" min="0" className="w-24 ml-auto" value={editForm.monthly_limit ?? ''} onChange={e => setEditForm({ ...editForm, monthly_limit: e.target.value ? parseFloat(e.target.value) : null })} placeholder="No limit" /></TableCell>
              <TableCell><Input type="number" min="0" className="w-24 ml-auto" value={editForm.requires_notes_above ?? ''} onChange={e => setEditForm({ ...editForm, requires_notes_above: e.target.value ? parseFloat(e.target.value) : null })} placeholder="No limit" /></TableCell>
              <TableCell><Switch checked={editForm.is_blocked ?? false} onCheckedChange={v => setEditForm({ ...editForm, is_blocked: v })} /></TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={savePolicy}><Check className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}><X className="h-3.5 w-3.5" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            <TableRow key={p.category}>
              <TableCell className="font-medium">{p.category}</TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">{fmtLimit(p.daily_limit)}</TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">{fmtLimit(p.monthly_limit)}</TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">{fmtLimit(p.requires_notes_above)}</TableCell>
              <TableCell><Switch checked={p.is_blocked ?? false} onCheckedChange={() => toggleBlocked(p)} /></TableCell>
              <TableCell>
                <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(p)}><Pencil className="h-3.5 w-3.5" /></Button>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default SpendPoliciesSection;
