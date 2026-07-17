import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format, startOfMonth, endOfMonth } from 'date-fns';
import { Users2, Plus, Pencil, Trash2, Receipt } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Badge } from '@/components/ui/badge';
import { Card, CardContent } from '@/components/ui/card';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Employee = { id: string; name: string; phone_number: string; department: string | null; is_active: boolean | null };
type Team = {
  id: string; name: string; description: string | null;
  manager_id: string | null; company_id: string; created_at: string | null;
};
type TeamWithDetails = Team & { managerName: string | null; memberCount: number; memberNames: string[]; totalSpend: number };

const TeamsSection: React.FC = () => {
  const { user, profile, selectedCompanyId } = useAuth();
  const isAdmin = profile?.role === 'admin' || profile?.super_admin;

  const [teams, setTeams] = useState<TeamWithDetails[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [loading, setLoading] = useState(true);
  const [baseCurrency, setBaseCurrency] = useState('USD');

  // Form state
  const [showForm, setShowForm] = useState(false);
  const [editTeam, setEditTeam] = useState<Team | null>(null);
  const [formName, setFormName] = useState('');
  const [formDesc, setFormDesc] = useState('');
  const [formManager, setFormManager] = useState('none');
  const [formMembers, setFormMembers] = useState<Set<string>>(new Set());
  const [saving, setSaving] = useState(false);
  const [deleteTeam, setDeleteTeam] = useState<Team | null>(null);

  const resetForm = () => {
    setFormName(''); setFormDesc(''); setFormManager('none');
    setFormMembers(new Set()); setEditTeam(null);
  };

  const fetchData = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const now = new Date();
    const mStart = format(startOfMonth(now), 'yyyy-MM-dd');
    const mEnd = format(endOfMonth(now), 'yyyy-MM-dd');

    const [{ data: compData }, { data: teamData }, { data: empData }, { data: membersData }, { data: expData }] = await Promise.all([
      supabase.from('companies').select('base_currency').eq('id', selectedCompanyId).single(),
      supabase.from('teams').select('*').eq('company_id', selectedCompanyId).order('name'),
      supabase.from('employees').select('id, name, phone_number, department, is_active').eq('company_id', selectedCompanyId).order('name'),
      supabase.from('team_members').select('team_id, employee_id') as any,
      supabase.from('expenses').select('employee_id, base_amount, status').eq('company_id', selectedCompanyId).gte('date', mStart).lte('date', mEnd).neq('status', 'rejected'),
    ]);

    if (compData) setBaseCurrency(compData.base_currency);
    const emps = (empData ?? []) as Employee[];
    setEmployees(emps);
    const empMap = Object.fromEntries(emps.map(e => [e.id, e.name]));

    // Build member mapping
    const membersByTeam: Record<string, string[]> = {};
    ((membersData ?? []) as any[]).forEach((m: any) => {
      if (!membersByTeam[m.team_id]) membersByTeam[m.team_id] = [];
      membersByTeam[m.team_id].push(m.employee_id);
    });

    // Spend by employee
    const empSpend: Record<string, number> = {};
    ((expData ?? []) as any[]).forEach((e: any) => {
      if (e.employee_id) empSpend[e.employee_id] = (empSpend[e.employee_id] ?? 0) + (e.base_amount ?? 0);
    });

    setTeams(((teamData ?? []) as Team[]).map(t => {
      const members = membersByTeam[t.id] ?? [];
      return {
        ...t,
        managerName: t.manager_id ? empMap[t.manager_id] ?? null : null,
        memberCount: members.length,
        memberNames: members.map(id => empMap[id] ?? 'Unknown').slice(0, 5),
        totalSpend: members.reduce((s, id) => s + (empSpend[id] ?? 0), 0),
      };
    }));
    setLoading(false);
  };

  useEffect(() => { fetchData(); }, [selectedCompanyId]);

  const openEdit = async (team: Team) => {
    setEditTeam(team);
    setFormName(team.name);
    setFormDesc(team.description ?? '');
    setFormManager(team.manager_id ?? 'none');
    // Load members
    const { data } = await supabase.from('team_members').select('employee_id').eq('team_id', team.id) as any;
    setFormMembers(new Set(((data ?? []) as any[]).map((m: any) => m.employee_id)));
    setShowForm(true);
  };

  const handleSave = async () => {
    if (!formName.trim() || !selectedCompanyId || !user) return;
    setSaving(true);
    const payload: any = {
      name: formName.trim(),
      description: formDesc.trim() || null,
      manager_id: formManager !== 'none' ? formManager : null,
      company_id: selectedCompanyId,
    };

    let teamId: string;
    if (editTeam) {
      const { error } = await supabase.from('teams').update(payload).eq('id', editTeam.id);
      if (error) { toast.error(error.message); setSaving(false); return; }
      teamId = editTeam.id;
      // Remove old members
      await supabase.from('team_members').delete().eq('team_id', teamId);
    } else {
      const { data, error } = await supabase.from('teams').insert(payload).select('id').single();
      if (error || !data) { toast.error(error?.message ?? 'Failed'); setSaving(false); return; }
      teamId = data.id;
    }

    // Insert members
    if (formMembers.size > 0) {
      const memberRows = Array.from(formMembers).map(empId => ({ team_id: teamId, employee_id: empId }));
      await supabase.from('team_members').insert(memberRows as any);
    }

    await supabase.from('audit_log').insert({
      company_id: selectedCompanyId, user_id: user.id,
      action: editTeam ? 'update' : 'create', table_name: 'teams',
      record_id: teamId, new_values: { ...payload, members: Array.from(formMembers) } as any,
    });

    toast.success(editTeam ? 'Team updated' : 'Team created');
    setShowForm(false); resetForm(); fetchData();
    setSaving(false);
  };

  const handleDelete = async () => {
    if (!deleteTeam || !user || !selectedCompanyId) return;
    await supabase.from('team_members').delete().eq('team_id', deleteTeam.id);
    await supabase.from('teams').delete().eq('id', deleteTeam.id);
    await supabase.from('audit_log').insert({
      company_id: selectedCompanyId, user_id: user.id,
      action: 'delete', table_name: 'teams', record_id: deleteTeam.id,
    });
    toast.success('Team deleted');
    setDeleteTeam(null); fetchData();
  };

  const toggleMember = (empId: string) => {
    setFormMembers(prev => {
      const next = new Set(prev);
      if (next.has(empId)) next.delete(empId); else next.add(empId);
      return next;
    });
  };

  if (loading) return <div className="text-center text-muted-foreground py-10">Loading…</div>;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{teams.length} team{teams.length !== 1 ? 's' : ''}</p>
        {isAdmin && (
          <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}>
            <Plus className="h-4 w-4 mr-1" />New Team
          </Button>
        )}
      </div>

      {teams.length === 0 ? (
        <div className="bg-card rounded-lg shadow-sm border p-8 text-center">
          <Users2 className="h-10 w-10 text-muted-foreground mx-auto mb-3" />
          <h3 className="text-lg font-semibold text-foreground mb-1">No teams yet</h3>
          <p className="text-sm text-muted-foreground">Create teams to group employees and track team spending.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          {teams.map(team => (
            <Card key={team.id}>
              <CardContent className="p-5">
                <div className="mb-2">
                  <h3 className="font-semibold text-foreground">{team.name}</h3>
                  {team.description && <p className="text-xs text-muted-foreground mt-0.5">{team.description}</p>}
                </div>

                {team.managerName && (
                  <p className="text-xs text-muted-foreground mb-2">Manager: <span className="font-medium text-foreground">{team.managerName}</span></p>
                )}

                <div className="flex items-center gap-1 mb-3">
                  {team.memberNames.map((name, i) => (
                    <div key={i} className="h-7 w-7 rounded-full bg-primary/10 flex items-center justify-center text-xs font-medium text-primary">
                      {name[0]?.toUpperCase()}
                    </div>
                  ))}
                  {team.memberCount > 5 && (
                    <div className="h-7 w-7 rounded-full bg-muted flex items-center justify-center text-xs text-muted-foreground">
                      +{team.memberCount - 5}
                    </div>
                  )}
                  <span className="text-xs text-muted-foreground ml-1">{team.memberCount} member{team.memberCount !== 1 ? 's' : ''}</span>
                </div>

                <div className="flex items-center justify-between pt-3 border-t border-border gap-2">
                  <div>
                    <p className="text-xs text-muted-foreground">Spend this month</p>
                    <p className="text-sm font-bold text-foreground">{team.totalSpend.toFixed(2)} {baseCurrency}</p>
                  </div>
                  <div className="flex flex-wrap gap-2 justify-end">
                    <Button variant="outline" size="sm" asChild>
                      <Link to={`/expenses?team=${team.id}`}><Receipt className="h-3.5 w-3.5 mr-1" />Expenses</Link>
                    </Button>
                    {isAdmin && (
                      <>
                        <Button variant="outline" size="sm" onClick={() => openEdit(team)}>
                          <Pencil className="h-3.5 w-3.5 mr-1" />Edit
                        </Button>
                        <Button variant="outline" size="sm" className="text-destructive hover:text-destructive border-destructive/30" onClick={() => setDeleteTeam(team)}>
                          <Trash2 className="h-3.5 w-3.5 mr-1" />Delete
                        </Button>
                      </>
                    )}
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {/* New/Edit Team Sheet */}
      <Sheet open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); resetForm(); } }}>
        <SheetContent className="sm:max-w-md overflow-y-auto">
          <SheetHeader><SheetTitle>{editTeam ? 'Edit Team' : 'New Team'}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Team Name *</Label>
              <Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Sales Team" />
            </div>
            <div>
              <Label>Description</Label>
              <Textarea value={formDesc} onChange={e => setFormDesc(e.target.value)} placeholder="Optional" rows={2} />
            </div>
            <div>
              <Label>Manager</Label>
              <Select value={formManager} onValueChange={setFormManager}>
                <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">None</SelectItem>
                  {employees.filter(e => e.is_active !== false).map(e => (
                    <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Members</Label>
              <div className="border rounded-md max-h-48 overflow-y-auto p-2 space-y-1 mt-1">
                {employees.filter(e => e.is_active !== false).map(e => (
                  <label key={e.id} className="flex items-center gap-2 py-1 px-2 rounded hover:bg-accent/50 cursor-pointer text-sm">
                    <Checkbox checked={formMembers.has(e.id)} onCheckedChange={() => toggleMember(e.id)} />
                    <span className="text-foreground">{e.name}</span>
                    {e.department && <span className="text-xs text-muted-foreground">({e.department})</span>}
                  </label>
                ))}
              </div>
              <p className="text-xs text-muted-foreground mt-1">{formMembers.size} selected</p>
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={!formName.trim() || saving}>
                {saving ? 'Saving…' : editTeam ? 'Update' : 'Create Team'}
              </Button>
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTeam} onOpenChange={open => { if (!open) setDeleteTeam(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete team "{deleteTeam?.name}"?</AlertDialogTitle>
            <AlertDialogDescription>This will remove the team and all member associations. Expenses are not affected.</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancel</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete}>Delete</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default TeamsSection;
