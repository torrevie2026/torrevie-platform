import React, { useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { toast } from 'sonner';
import { Plus, Trash2, Check, X, Pencil } from 'lucide-react';
import { useExpenseCategories } from '@/hooks/useExpenseCategories';

const ExpenseCategoriesSection = () => {
  const { selectedCompanyId, user } = useAuth();
  const { categories, loading, refresh } = useExpenseCategories(selectedCompanyId, { includeInactive: true });
  const [newName, setNewName] = useState('');
  const [newOrder, setNewOrder] = useState('');
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editOrder, setEditOrder] = useState('');
  const [saving, setSaving] = useState(false);

  const audit = async (action: string, payload: any) => {
    if (!selectedCompanyId || !user) return;
    await supabase.from('audit_log').insert({
      company_id: selectedCompanyId, user_id: user.id, action,
      table_name: 'expense_categories', new_values: payload as any,
    });
  };

  const add = async () => {
    if (!newName.trim() || !selectedCompanyId) return;
    setSaving(true);
    const payload = {
      company_id: selectedCompanyId,
      name: newName.trim(),
      sort_order: newOrder ? parseInt(newOrder, 10) : 100,
      is_system: false,
      is_active: true,
    };
    const { error } = await supabase.from('expense_categories').insert(payload);
    setSaving(false);
    if (error) { toast.error(error.message); return; }
    await audit('create', payload);
    setNewName(''); setNewOrder('');
    toast.success('Category added');
    refresh();
  };

  const startEdit = (c: typeof categories[number]) => {
    setEditId(c.id); setEditName(c.name); setEditOrder(String(c.sort_order));
  };
  const cancelEdit = () => { setEditId(null); setEditName(''); setEditOrder(''); };

  const saveEdit = async (id: string) => {
    if (!editName.trim()) return;
    const payload = { name: editName.trim(), sort_order: editOrder ? parseInt(editOrder, 10) : 100 };
    const { error } = await supabase.from('expense_categories').update(payload).eq('id', id);
    if (error) { toast.error(error.message); return; }
    await audit('update', { id, ...payload });
    cancelEdit();
    refresh();
  };

  const toggleActive = async (c: typeof categories[number]) => {
    const { error } = await supabase.from('expense_categories').update({ is_active: !c.is_active }).eq('id', c.id);
    if (error) { toast.error(error.message); return; }
    await audit('update', { id: c.id, is_active: !c.is_active });
    refresh();
  };

  const remove = async (c: typeof categories[number]) => {
    if (c.is_system) { toast.error('System categories cannot be deleted — deactivate instead.'); return; }
    if (!confirm(`Delete category "${c.name}"?`)) return;
    const { error } = await supabase.from('expense_categories').delete().eq('id', c.id);
    if (error) { toast.error(error.message); return; }
    await audit('delete', { id: c.id, name: c.name });
    refresh();
  };

  return (
    <div className="bg-card rounded-lg border p-5">
      <h2 className="text-lg font-semibold text-foreground mb-1">Expense Categories</h2>
      <p className="text-xs text-muted-foreground mb-4">
        Manage the category list available to your team. Deactivate items you don't use; system defaults can be deactivated but not deleted.
      </p>

      <div className="flex gap-2 mb-4">
        <Input
          placeholder="New category (e.g. Demurrage)"
          value={newName}
          onChange={e => setNewName(e.target.value)}
          className="max-w-xs"
        />
        <Input
          type="number"
          placeholder="Order"
          value={newOrder}
          onChange={e => setNewOrder(e.target.value)}
          className="w-24"
        />
        <Button onClick={add} disabled={!newName.trim() || saving}>
          <Plus className="h-4 w-4 mr-1" />Add
        </Button>
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Name</TableHead>
            <TableHead className="w-24 text-right">Order</TableHead>
            <TableHead className="w-24">Active</TableHead>
            <TableHead className="w-24">System</TableHead>
            <TableHead className="w-28"></TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">Loading…</TableCell></TableRow>
          ) : categories.length === 0 ? (
            <TableRow><TableCell colSpan={5} className="text-center text-muted-foreground py-4">No categories yet.</TableCell></TableRow>
          ) : categories.map(c => editId === c.id ? (
            <TableRow key={c.id}>
              <TableCell><Input value={editName} onChange={e => setEditName(e.target.value)} /></TableCell>
              <TableCell><Input type="number" value={editOrder} onChange={e => setEditOrder(e.target.value)} className="text-right" /></TableCell>
              <TableCell><Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} /></TableCell>
              <TableCell className="text-xs text-muted-foreground">{c.is_system ? 'Yes' : '—'}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => saveEdit(c.id)}><Check className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={cancelEdit}><X className="h-3.5 w-3.5" /></Button>
                </div>
              </TableCell>
            </TableRow>
          ) : (
            <TableRow key={c.id} className={!c.is_active ? 'opacity-50' : ''}>
              <TableCell className="font-medium">{c.name}</TableCell>
              <TableCell className="text-right text-sm text-muted-foreground">{c.sort_order}</TableCell>
              <TableCell><Switch checked={c.is_active} onCheckedChange={() => toggleActive(c)} /></TableCell>
              <TableCell className="text-xs text-muted-foreground">{c.is_system ? 'Yes' : '—'}</TableCell>
              <TableCell>
                <div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => startEdit(c)}><Pencil className="h-3.5 w-3.5" /></Button>
                  {!c.is_system && (
                    <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => remove(c)}>
                      <Trash2 className="h-3.5 w-3.5 text-destructive" />
                    </Button>
                  )}
                </div>
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default ExpenseCategoriesSection;
