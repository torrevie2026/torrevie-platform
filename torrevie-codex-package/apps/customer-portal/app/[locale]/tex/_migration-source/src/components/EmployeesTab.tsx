import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { apiRequest } from '@/lib/api';
import { Users, Plus, Pencil, UserX, UserCheck, Info, Mail, Send, KeyRound, Copy, Laptop } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Switch } from '@/components/ui/switch';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

type Employee = {
  id: string; name: string; phone_number: string; department: string | null;
  is_active: boolean | null; company_id: string; created_at: string | null;
  manager_profile_id: string | null; monthly_salary: number | null;
};

type ProfileUser = {
  id: string; email?: string; full_name: string | null; role: string | null; is_ceo: boolean;
  manager_id: string | null;
};

type ResetResult = {
  email: string;
  emailSent: boolean;
  actionLink?: string;
};

const EmployeesTab = () => {
  const { user, profile, selectedCompanyId, companies } = useAuth();
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [profileUsers, setProfileUsers] = useState<ProfileUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [showForm, setShowForm] = useState(false);
  const [editEmployee, setEditEmployee] = useState<Employee | null>(null);
  const [deactivateEmployee, setDeactivateEmployee] = useState<Employee | null>(null);
  const [expenseCounts, setExpenseCounts] = useState<Record<string, number>>({});
  const [departments, setDepartments] = useState<string[]>([]);

  const [formName, setFormName] = useState('');
  const [formPhone, setFormPhone] = useState('');
  const [formDept, setFormDept] = useState('');
  const [formSalary, setFormSalary] = useState('');
  const [formManagerId, setFormManagerId] = useState('');
  const [saving, setSaving] = useState(false);

  // Edit web user state
  const [showEditWebUser, setShowEditWebUser] = useState(false);
  const [editWebUser, setEditWebUser] = useState<ProfileUser | null>(null);
  const [webUserManagerId, setWebUserManagerId] = useState('');
  const [webUserRole, setWebUserRole] = useState('');
  const [webUserIsCeo, setWebUserIsCeo] = useState(false);
  const [webUserName, setWebUserName] = useState('');
  const [savingWebUser, setSavingWebUser] = useState(false);

  // Invite web user state
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [inviteRole, setInviteRole] = useState('coordinator');
  const [inviteManagerId, setInviteManagerId] = useState('__none__');
  const [inviting, setInviting] = useState(false);

  const [resetResult, setResetResult] = useState<ResetResult | null>(null);

  const isAdmin = profile?.role === 'admin' || profile?.super_admin;
  const companyCurrency = companies?.find(company => company.id === selectedCompanyId)?.base_currency || 'AED';

  const handleInvite = async () => {
    if (!inviteEmail.trim() || !selectedCompanyId) return;
    setInviting(true);
    try {
      const data = await apiRequest<{ sent: boolean; actionLink?: string }>('/api/tex/people/users/invite', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail.trim(),
          full_name: inviteName.trim(),
          role: inviteRole,
          company_id: selectedCompanyId,
          manager_id: inviteManagerId !== '__none__' ? inviteManagerId : null,
          return_link: true,
        }),
      });
      setResetResult({ email: inviteEmail.trim(), emailSent: data.sent, actionLink: data.actionLink });
      toast.success(data.sent ? `Invitation sent to ${inviteEmail}` : 'Invitation link created');
      setShowInvite(false);
      setInviteEmail(''); setInviteName(''); setInviteRole('coordinator'); setInviteManagerId('__none__');
      fetchData();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to invite user');
    } finally {
      setInviting(false);
    }
  };

  const sendPasswordReset = async (p: ProfileUser) => {
    if (!confirm(`Send a password reset link to ${p.full_name ?? 'this user'}?`)) return;
    try {
      const data = await apiRequest<{ sent: boolean; resetLink?: string }>('/api/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ target_user_id: p.id, email: p.email, return_link: true }),
      });
      const email = p.email || 'the user email';
      setResetResult({ email, emailSent: !!data.sent, actionLink: data.resetLink });
      toast.success(data.sent ? 'Reset email sent.' : 'Reset link created.');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to send reset');
      return;
    }
  };

  const copyResetLink = async () => {
    if (!resetResult?.actionLink) return;
    try {
      await navigator.clipboard.writeText(resetResult.actionLink);
      toast.success('Reset link copied');
    } catch {
      toast.error('Could not copy reset link');
    }
  };

  const resetForm = () => { setFormName(''); setFormPhone(''); setFormDept(''); setFormSalary(''); setFormManagerId('__none__'); setEditEmployee(null); };

  const fetchData = async () => {
    if (!selectedCompanyId) return;
    setLoading(true);
    try {
      const data = await apiRequest<{
        employees: Employee[];
        profiles: ProfileUser[];
        expenseCounts: Array<{ employee_id: string; count: number }>;
      }>(`/api/tex/people/bootstrap?company_id=${encodeURIComponent(selectedCompanyId)}`);
      const counts: Record<string, number> = {};
      data.expenseCounts.forEach((row) => { if (row.employee_id) counts[row.employee_id] = row.count; });
      setEmployees(data.employees);
      setProfileUsers(data.profiles);
      setExpenseCounts(counts);
      setDepartments([...new Set(data.employees.map(e => e.department).filter(Boolean))] as string[]);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load people');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { fetchData(); }, [selectedCompanyId]);

  const openEdit = (emp: Employee) => {
    setEditEmployee(emp); setFormName(emp.name); setFormPhone(emp.phone_number);
    setFormDept(emp.department ?? ''); setFormSalary(emp.monthly_salary != null && emp.monthly_salary > 0 ? String(emp.monthly_salary) : ''); setFormManagerId((emp as any).manager_profile_id || '__none__');
    setShowForm(true);
  };

  const getManagerName = (managerId: string | null) => {
    if (!managerId) return '-';
    const mgr = profileUsers.find(p => p.id === managerId);
    return mgr?.full_name ?? '-';
  };

  const handleSave = async () => {
    if (!formName.trim() || !formPhone.trim() || !selectedCompanyId || !user) return;
    setSaving(true);
    const payload: any = {
      name: formName.trim(), phone_number: formPhone.trim(),
      department: formDept.trim() || null, company_id: selectedCompanyId,
      monthly_salary: formSalary ? parseFloat(formSalary) : 0,
      manager_profile_id: (formManagerId && formManagerId !== '__none__') ? formManagerId : null,
    };
    if (editEmployee) {
      try {
        await apiRequest(`/api/tex/people/employees/${editEmployee.id}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
      } catch (error) {
        toast.error((error as Error).message || 'Failed to update employee');
        setSaving(false);
        return;
      }
    } else {
      try {
        await apiRequest<{ employee: Employee }>('/api/tex/people/employees', {
          method: 'POST',
          body: JSON.stringify(payload),
        });
      } catch (error) {
        toast.error((error as Error).message || 'Failed to add employee');
        setSaving(false);
        return;
      }
    }
    toast.success(editEmployee ? 'Employee updated' : 'Employee added');
    setShowForm(false); resetForm(); fetchData(); setSaving(false);
  };

  const handleDeactivate = async () => {
    if (!deactivateEmployee || !user || !selectedCompanyId) return;
    const newActive = !deactivateEmployee.is_active;
    try {
      await apiRequest(`/api/tex/people/employees/${deactivateEmployee.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          name: deactivateEmployee.name,
          phone_number: deactivateEmployee.phone_number,
          department: deactivateEmployee.department,
          monthly_salary: deactivateEmployee.monthly_salary ?? 0,
          manager_profile_id: deactivateEmployee.manager_profile_id,
          is_active: newActive,
        }),
      });
      toast.success(newActive ? 'Employee reactivated' : 'Employee deactivated');
      setDeactivateEmployee(null); fetchData();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to update employee');
    }
  };

  const openEditWebUser = (p: ProfileUser) => {
    setEditWebUser(p);
    setWebUserManagerId(p.manager_id || '__none__');
    setWebUserRole(p.role ?? 'employee');
    setWebUserIsCeo(p.is_ceo);
    setWebUserName(p.full_name ?? '');
    setShowEditWebUser(true);
  };

  const handleSaveWebUser = async () => {
    if (!editWebUser || !user || !selectedCompanyId) return;
    const trimmedName = webUserName.trim();
    if (!trimmedName) { toast.error('Name is required'); return; }
    setSavingWebUser(true);
    const managerId = (webUserManagerId && webUserManagerId !== '__none__') ? webUserManagerId : null;
    const { error } = await (supabase as any).rpc('admin_update_profile', {
      _profile_id: editWebUser.id,
      _role: webUserRole,
      _is_ceo: webUserIsCeo,
      _manager_id: webUserIsCeo ? null : managerId,
      _full_name: trimmedName,
    });
    if (error) { toast.error(error.message); setSavingWebUser(false); return; }
    toast.success('User updated');
    setShowEditWebUser(false); setEditWebUser(null); setSavingWebUser(false); fetchData();
  };

  const activeCount = employees.filter(e => e.is_active !== false).length;
  const webUserCount = profileUsers.length;

  return (
    <div>
      <div className="flex items-center justify-between mb-4">
        <p className="text-sm text-muted-foreground">{webUserCount} web users | {activeCount} WhatsApp employees</p>
        <Button size="sm" onClick={() => { resetForm(); setShowForm(true); }}><Plus className="h-4 w-4 mr-1" />Add Employee</Button>
      </div>
      <div className="flex items-start gap-2 bg-primary/5 border border-primary/20 rounded-lg p-3 mb-4">
        <Info className="h-4 w-4 text-primary mt-0.5 shrink-0" />
        <p className="text-sm text-foreground">WhatsApp employees submit expenses by sending receipts via WhatsApp. Web users log in to TEX directly.</p>
      </div>

      {/* Web users section */}
      <div className="mb-6">
        <div className="flex items-center justify-between mb-2">
          <h3 className="text-sm font-semibold text-foreground">Web Users</h3>
          {isAdmin && (
            <Button size="sm" variant="outline" onClick={() => setShowInvite(true)}>
              <Mail className="h-4 w-4 mr-1" />Invite Web User
            </Button>
          )}
        </div>
        {profileUsers.length === 0 ? (
          <div className="bg-card rounded-lg border p-6 text-center text-sm text-muted-foreground">
            No web users yet. Click "Invite Web User" to add one.
          </div>
        ) : (
          <div className="bg-card rounded-lg border overflow-hidden">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Name</TableHead><TableHead>Role</TableHead><TableHead>Reports to</TableHead><TableHead>Type</TableHead><TableHead></TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {profileUsers.map(p => (
                  <TableRow key={p.id}>
                    <TableCell className="font-medium">
                      {p.full_name ?? '-'}
                      {p.is_ceo && <Badge className="ml-2 text-[10px] bg-primary/10 text-primary border-primary/30" variant="outline">CEO</Badge>}
                    </TableCell>
                    <TableCell><Badge variant="outline" className="text-xs capitalize">{p.role ?? 'employee'}</Badge></TableCell>
                    <TableCell className="text-sm">{getManagerName(p.manager_id)}</TableCell>
                    <TableCell><Badge variant="outline" className="text-xs inline-flex items-center gap-1"><Laptop className="h-3 w-3" /> Web</Badge></TableCell>
                    <TableCell>
                      <div className="flex items-center gap-1">
                        <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEditWebUser(p)} title="Edit">
                          <Pencil className="h-3.5 w-3.5" />
                        </Button>
                        <Button
                          variant="ghost"
                          size="icon"
                          className="h-7 w-7"
                          title="Send password reset"
                          onClick={() => sendPasswordReset(p)}
                        >
                          <KeyRound className="h-3.5 w-3.5" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        )}
      </div>

      {/* WhatsApp employees section */}
      <h3 className="text-sm font-semibold text-foreground mb-2">WhatsApp Employees</h3>
      <div className="bg-card rounded-lg border overflow-hidden">
        <Table>
          <TableHeader><TableRow>
            <TableHead>Name</TableHead><TableHead>Department</TableHead><TableHead>Phone</TableHead>
            <TableHead>Reports to</TableHead><TableHead className="text-right">Monthly Salary</TableHead><TableHead className="text-right">Expenses</TableHead><TableHead>Status</TableHead><TableHead></TableHead>
          </TableRow></TableHeader>
          <TableBody>
            {loading ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8 text-muted-foreground">Loading...</TableCell></TableRow>
            ) : employees.length === 0 ? (
              <TableRow><TableCell colSpan={8} className="text-center py-8"><Users className="h-8 w-8 text-muted-foreground mx-auto mb-2" /><p className="text-muted-foreground">No WhatsApp employees yet</p></TableCell></TableRow>
            ) : employees.map(emp => (
              <TableRow key={emp.id} className={cn(emp.is_active === false && 'opacity-50')}>
                <TableCell className="font-medium">{emp.name}</TableCell>
                <TableCell>{emp.department ?? '-'}</TableCell>
                <TableCell className="font-mono text-sm">{emp.phone_number}</TableCell>
                <TableCell className="text-sm">{getManagerName((emp as any).manager_profile_id)}</TableCell>
                <TableCell className="text-right">{(emp.monthly_salary ?? 0) > 0 ? `${(emp.monthly_salary ?? 0).toFixed(2)} ${companyCurrency}` : '-'}</TableCell>
                <TableCell className="text-right">{expenseCounts[emp.id] ?? 0}</TableCell>
                <TableCell><Badge variant="outline" className={cn('text-xs', emp.is_active !== false ? 'bg-green-100 text-green-800 border-green-200' : 'bg-muted text-muted-foreground')}>{emp.is_active !== false ? 'Active' : 'Inactive'}</Badge></TableCell>
                <TableCell><div className="flex gap-1">
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => openEdit(emp)}><Pencil className="h-3.5 w-3.5" /></Button>
                  <Button variant="ghost" size="icon" className="h-7 w-7" onClick={() => setDeactivateEmployee(emp)}>{emp.is_active !== false ? <UserX className="h-3.5 w-3.5" /> : <UserCheck className="h-3.5 w-3.5" />}</Button>
                </div></TableCell>
              </TableRow>
            ))}
          </TableBody>
        </Table>
      </div>

      <Sheet open={showForm} onOpenChange={open => { if (!open) { setShowForm(false); resetForm(); } }}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader><SheetTitle>{editEmployee ? 'Edit Employee' : 'Add Employee'}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            <div><Label>Full Name *</Label><Input value={formName} onChange={e => setFormName(e.target.value)} placeholder="e.g. Ahmed Al Maktoum" /></div>
            <div><Label>Phone Number *</Label><Input value={formPhone} onChange={e => setFormPhone(e.target.value)} placeholder="e.g. 971501234567" className="font-mono" /><p className="text-xs text-muted-foreground mt-1">Must match their WhatsApp number exactly.</p></div>
            <div><Label>Department</Label>
              <Input value={formDept} onChange={e => setFormDept(e.target.value)} placeholder="e.g. Sales" list="dept-list" />
              {departments.length > 0 && <datalist id="dept-list">{departments.map(d => <option key={d} value={d} />)}</datalist>}
            </div>
            <div>
              <Label>Monthly Salary ({companyCurrency})</Label>
              <Input type="text" inputMode="decimal" value={formSalary} onChange={e => setFormSalary(e.target.value.replace(/[^0-9.]/g, ''))} placeholder="0.00" />
              <p className="text-xs text-muted-foreground mt-1">Included automatically in the employee's monthly Finance Review settlement.</p>
            </div>
            <div>
              <Label>Reports to</Label>
              <Select value={formManagerId} onValueChange={setFormManagerId}>
                <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No manager</SelectItem>
                  {profileUsers.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? 'Unnamed'} ({p.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSave} disabled={!formName.trim() || !formPhone.trim() || saving}>{saving ? 'Saving...' : editEmployee ? 'Update' : 'Add Employee'}</Button>
              <Button variant="outline" onClick={() => { setShowForm(false); resetForm(); }}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      <AlertDialog open={!!deactivateEmployee} onOpenChange={open => { if (!open) setDeactivateEmployee(null); }}>
        <AlertDialogContent><AlertDialogHeader>
          <AlertDialogTitle>{deactivateEmployee?.is_active !== false ? `Deactivate ${deactivateEmployee?.name}?` : `Reactivate ${deactivateEmployee?.name}?`}</AlertDialogTitle>
          <AlertDialogDescription>{deactivateEmployee?.is_active !== false ? 'Deactivated employees will no longer be able to submit expenses.' : 'This employee will be able to submit expenses again.'}</AlertDialogDescription>
        </AlertDialogHeader><AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction onClick={handleDeactivate}>{deactivateEmployee?.is_active !== false ? 'Deactivate' : 'Reactivate'}</AlertDialogAction>
        </AlertDialogFooter></AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!resetResult} onOpenChange={open => { if (!open) setResetResult(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>Password reset ready</DialogTitle>
            <DialogDescription>
              The reset email was prepared for {resetResult?.email ?? 'this user'}.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            <div className="rounded-lg border bg-muted/30 p-3 text-sm">
              <div className="flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Destination</span>
                <span className="font-medium break-all text-right">{resetResult?.email}</span>
              </div>
              <div className="mt-2 flex items-center justify-between gap-3">
                <span className="text-muted-foreground">Delivery status</span>
                <Badge variant="outline">{resetResult?.emailSent ? 'Email sent' : 'Backup link only'}</Badge>
              </div>
            </div>
            <p className="text-sm text-muted-foreground">
              If the email does not arrive, copy the reset link and send it to the user directly. The link is not shown on screen.
            </p>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setResetResult(null)}>Close</Button>
            <Button onClick={copyResetLink} disabled={!resetResult?.actionLink}>
              <Copy className="h-4 w-4 mr-1" />Copy reset link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Edit Web User Sheet */}
      <Sheet open={showEditWebUser} onOpenChange={open => { if (!open) { setShowEditWebUser(false); setEditWebUser(null); } }}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader><SheetTitle>Edit {editWebUser?.full_name ?? 'User'}</SheetTitle></SheetHeader>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Name</Label>
              <Input value={webUserName} onChange={e => setWebUserName(e.target.value)} placeholder="Full name" maxLength={120} />
            </div>
            <div>
              <Label>Reports to (Manager)</Label>
              <Select value={webUserManagerId} onValueChange={setWebUserManagerId}>
                <SelectTrigger><SelectValue placeholder="Select manager" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No manager</SelectItem>
                  {profileUsers.filter(p => p.id !== editWebUser?.id).map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? 'Unnamed'} ({p.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Role</Label>
              <Select value={webUserRole} onValueChange={setWebUserRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="coordinator">Coordinator (manage trips & legs)</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-3">
              <Switch checked={webUserIsCeo} onCheckedChange={setWebUserIsCeo} />
              <Label>CEO / Owner (expenses skip manager approval)</Label>
            </div>
            {webUserIsCeo && (
              <p className="text-xs text-muted-foreground">CEO expenses go directly to finance. Manager will be cleared.</p>
            )}
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleSaveWebUser} disabled={savingWebUser}>
                {savingWebUser ? 'Saving...' : 'Save Changes'}
              </Button>
              <Button variant="outline" onClick={() => { setShowEditWebUser(false); setEditWebUser(null); }}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>

      {/* Invite Web User Sheet */}
      <Sheet open={showInvite} onOpenChange={open => { if (!open) setShowInvite(false); }}>
        <SheetContent className="sm:max-w-md">
          <SheetHeader><SheetTitle>Invite Web User</SheetTitle></SheetHeader>
          <p className="text-xs text-muted-foreground mt-2">
            They'll receive an email to set their password. Coordinators can manage trips and legs but cannot approve expenses or change settings.
          </p>
          <div className="mt-4 space-y-4">
            <div>
              <Label>Full Name</Label>
              <Input value={inviteName} onChange={e => setInviteName(e.target.value)} placeholder="e.g. Sara Khan" maxLength={120} />
            </div>
            <div>
              <Label>Email *</Label>
              <Input type="email" value={inviteEmail} onChange={e => setInviteEmail(e.target.value)} placeholder="name@company.com" />
            </div>
            <div>
              <Label>Role</Label>
              <Select value={inviteRole} onValueChange={setInviteRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="employee">Employee</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="coordinator">Coordinator (manage trips & legs)</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="admin">Admin</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Reports to (optional)</Label>
              <Select value={inviteManagerId} onValueChange={setInviteManagerId}>
                <SelectTrigger><SelectValue placeholder="No manager" /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="__none__">No manager</SelectItem>
                  {profileUsers.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.full_name ?? 'Unnamed'} ({p.role})</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex gap-2 pt-2">
              <Button className="flex-1" onClick={handleInvite} disabled={!inviteEmail.trim() || inviting}>
                <Send className="h-4 w-4 mr-1" />{inviting ? 'Sending...' : 'Send Invite'}
              </Button>
              <Button variant="outline" onClick={() => setShowInvite(false)}>Cancel</Button>
            </div>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default EmployeesTab;
