import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { apiRequest } from '@/lib/api';
import { Shield, Plus, Building2, UserPlus, Mail, RefreshCw, Pencil, Trash2, Copy } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import { DialogDescription, DialogFooter } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';

const COMPANY_PLANS = [
  { value: 'trial', label: 'Trial' },
  { value: 'starter', label: 'Starter' },
  { value: 'business', label: 'Business' },
  { value: 'enterprise', label: 'Enterprise' },
];

interface CountryConfig {
  country_code: string;
  country_name: string;
  base_currency: string;
}

interface Company {
  id: string;
  name: string;
  country_code: string;
  base_currency: string;
  plan: string | null;
  created_at: string | null;
}

interface AdminUser {
  id: string;
  full_name: string | null;
  role: string | null;
  super_admin?: boolean | null;
  company_id: string | null;
  email?: string;
  membership_company_ids?: string[];
  manager_id?: string | null;
}

type InviteResult = {
  email: string;
  emailSent: boolean;
  actionLink?: string;
};

const AdminPanel = () => {
  const { profile } = useAuth();
  const [companies, setCompanies] = useState<Company[]>([]);
  const [admins, setAdmins] = useState<AdminUser[]>([]);
  const [countries, setCountries] = useState<CountryConfig[]>([]);
  const [loading, setLoading] = useState(true);

  // New company form
  const [showNewCompany, setShowNewCompany] = useState(false);
  const [newCompanyName, setNewCompanyName] = useState('');
  const [newCompanyCountry, setNewCompanyCountry] = useState('');
  const [creatingCompany, setCreatingCompany] = useState(false);

  // Invite user form
  const [showInvite, setShowInvite] = useState(false);
  const [inviteEmail, setInviteEmail] = useState('');
  const [inviteFullName, setInviteFullName] = useState('');
  const [inviteAccessLevel, setInviteAccessLevel] = useState<'super_admin' | 'company'>('company');
  const [inviteCompanyId, setInviteCompanyId] = useState('');
  const [inviteRole, setInviteRole] = useState('admin');
  const [inviteManagerId, setInviteManagerId] = useState('');
  const [inviting, setInviting] = useState(false);
  const [reinviting, setReinviting] = useState<string | null>(null);
  const [inviteResult, setInviteResult] = useState<InviteResult | null>(null);

  // Edit user form
  const [showEdit, setShowEdit] = useState(false);
  const [editUser, setEditUser] = useState<AdminUser | null>(null);
  const [editFullName, setEditFullName] = useState('');
  const [editAccessLevel, setEditAccessLevel] = useState<'super_admin' | 'company'>('company');
  const [editCompanyId, setEditCompanyId] = useState('');
  const [editMembershipCompanyIds, setEditMembershipCompanyIds] = useState<string[]>([]);
  const [editRole, setEditRole] = useState('');
  const [saving, setSaving] = useState(false);
  const [userToDelete, setUserToDelete] = useState<AdminUser | null>(null);
  const [deletingUserId, setDeletingUserId] = useState<string | null>(null);
  const [updatingCompanyPlanId, setUpdatingCompanyPlanId] = useState<string | null>(null);

  const loadData = async () => {
    setLoading(true);
    try {
      const data = await apiRequest<{
        companies: Company[];
        admins: AdminUser[];
        countries: CountryConfig[];
      }>('/api/tex/admin/bootstrap');
      setCompanies(data.companies);
      setAdmins(data.admins);
      setCountries(data.countries);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to load admin data');
    }
    setLoading(false);
  };

  useEffect(() => { loadData(); }, []);

  const handleCreateCompany = async () => {
    if (!newCompanyName || !newCompanyCountry) return;
    setCreatingCompany(true);
    const config = countries.find(c => c.country_code === newCompanyCountry);
    if (!config) { setCreatingCompany(false); return; }

    try {
      await apiRequest('/api/tex/admin/companies', {
        method: 'POST',
        body: JSON.stringify({
          name: newCompanyName,
          country_code: newCompanyCountry,
        }),
      });
      toast.success(`Company "${newCompanyName}" created`);
      setNewCompanyName('');
      setNewCompanyCountry('');
      setShowNewCompany(false);
      loadData();
    } catch (error) {
      toast.error((error as Error).message);
    }
    setCreatingCompany(false);
  };

  const handleInviteUser = async () => {
    if (!inviteEmail || (inviteAccessLevel === 'company' && (!inviteCompanyId || !inviteRole))) return;

    // Validate domain
    if (!inviteEmail.endsWith('@torrevie.com') && !inviteEmail.endsWith('.torrevie.com')) {
      // Allow any domain for now but warn - can be restricted
    }

    setInviting(true);
    try {
      const data = await apiRequest<{ sent: boolean; actionLink?: string }>('/api/tex/admin/users/invite', {
        method: 'POST',
        body: JSON.stringify({
          email: inviteEmail,
          full_name: inviteFullName,
          super_admin: inviteAccessLevel === 'super_admin',
          company_id: inviteCompanyId || null,
          role: inviteAccessLevel === 'super_admin' ? 'admin' : inviteRole,
          manager_id: inviteAccessLevel === 'company' && inviteManagerId && inviteManagerId !== '__none__' ? inviteManagerId : null,
          return_link: true,
        }),
      });
      setInviteResult({ email: inviteEmail, emailSent: data.sent, actionLink: data.actionLink });
      toast.success(data.sent ? `Invitation sent to ${inviteEmail}` : 'Invitation link created');
      setInviteEmail('');
      setInviteFullName('');
      setInviteAccessLevel('company');
      setInviteCompanyId('');
      setInviteRole('admin');
      setInviteManagerId('');
      setShowInvite(false);
      loadData();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to invite user');
    }
    setInviting(false);
  };

  const copyInviteLink = async () => {
    if (!inviteResult?.actionLink) return;
    try {
      await navigator.clipboard.writeText(inviteResult.actionLink);
      toast.success('Invitation link copied');
    } catch {
      toast.error('Could not copy invitation link');
    }
  };

  const handleReinvite = async (user: AdminUser) => {
    if (!user.email) {
      toast.error('No email found for this user');
      return;
    }
    setReinviting(user.id);
    try {
      const data = await apiRequest<{ sent: boolean; resetLink?: string }>('/api/auth/request-password-reset', {
        method: 'POST',
        body: JSON.stringify({ target_user_id: user.id, email: user.email, return_link: true }),
      });
      setInviteResult({ email: user.email, emailSent: data.sent, actionLink: data.resetLink });
      toast.success(data.sent ? `Password reset email sent to ${user.email}` : 'Password reset link created');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to re-invite user');
    }
    setReinviting(null);
  };

  const openEditUser = (user: AdminUser) => {
    setEditUser(user);
    setEditFullName(user.full_name || '');
    setEditAccessLevel(user.super_admin ? 'super_admin' : 'company');
    setEditCompanyId(user.company_id || '');
    setEditMembershipCompanyIds(user.membership_company_ids?.length ? user.membership_company_ids : (user.company_id ? [user.company_id] : []));
    setEditRole(user.role || 'employee');
    setShowEdit(true);
  };

  const handleSaveUser = async () => {
    if (!editUser) return;
    setSaving(true);
    const isPlatformSuperAdmin = editAccessLevel === 'super_admin';
    const membershipIds = editCompanyId && !editMembershipCompanyIds.includes(editCompanyId)
      ? [editCompanyId, ...editMembershipCompanyIds]
      : editMembershipCompanyIds;
    try {
      const data = await apiRequest<{ user: AdminUser }>(`/api/tex/admin/users/${editUser.id}`, {
        method: 'PATCH',
        body: JSON.stringify({
          full_name: editFullName,
          super_admin: isPlatformSuperAdmin,
          company_id: editCompanyId || null,
          role: isPlatformSuperAdmin ? 'admin' : editRole,
          membership_company_ids: isPlatformSuperAdmin ? [] : membershipIds,
        }),
      });
      setAdmins((current) => current.map((item) => (item.id === editUser.id ? { ...item, ...data.user } : item)));
      toast.success('User updated');
      setShowEdit(false);
      setEditUser(null);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to update user');
    } finally {
      setSaving(false);
    }
  };

  const toggleEditMembership = (companyId: string, checked: boolean) => {
    setEditMembershipCompanyIds((current) => {
      if (checked) return current.includes(companyId) ? current : [...current, companyId];
      if (companyId === editCompanyId) setEditCompanyId('');
      return current.filter((id) => id !== companyId);
    });
  };

  const handleDeleteUser = async () => {
    if (!userToDelete) return;

    if (userToDelete.id === profile?.id) {
      toast.error('You cannot delete your own account');
      setUserToDelete(null);
      return;
    }

    setDeletingUserId(userToDelete.id);
    const { data, error } = await supabase.functions.invoke('delete-user', {
      body: { user_id: userToDelete.id },
    });

    setDeletingUserId(null);

    if (error || data?.error) {
      toast.error(data?.error || error?.message || 'Failed to delete user');
      return;
    }

    toast.success(`Deleted ${userToDelete.email || userToDelete.full_name || 'user'}`);
    setUserToDelete(null);
    loadData();
  };

  const handleCompanyPlanChange = async (company: Company, plan: string) => {
    const previousPlan = company.plan ?? 'trial';
    if (plan === previousPlan) return;
    setUpdatingCompanyPlanId(company.id);
    try {
      const data = await apiRequest<{ company: Company }>(`/api/tex/admin/companies/${company.id}/plan`, {
        method: 'PATCH',
        body: JSON.stringify({ plan }),
      });
      setCompanies((current) => current.map((item) => (item.id === company.id ? data.company : item)));
      toast.success(`${company.name} plan updated to ${plan}`);
    } catch (error) {
      toast.error((error as Error).message || 'Failed to update company plan');
    } finally {
      setUpdatingCompanyPlanId(null);
    }
  };

  const getCompanyName = (companyId: string | null) => {
    if (!companyId) return '—';
    return companies.find(c => c.id === companyId)?.name || companyId.slice(0, 8);
  };

  const getAccessLabel = (user: AdminUser) => user.super_admin ? 'Platform Super Admin' : (user.role || 'employee');

  if (!profile?.super_admin) {
    return (
      <div className="text-center py-20 text-muted-foreground">
        <Shield className="h-12 w-12 mx-auto mb-4 opacity-50" />
        <p>Super admin access required</p>
      </div>
    );
  }

  if (loading) return <div className="flex items-center justify-center py-20 text-muted-foreground">Loading…</div>;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-foreground">Admin Panel</h1>
        <div className="flex gap-2">
          <Button
            variant="outline"
            size="sm"
            className="gap-2"
            onClick={async () => {
              toast.info('Seeding demo tenant…');
              const { data, error } = await supabase.functions.invoke('seed-demo-users');
              if (error) { toast.error(error.message); return; }
              if ((data as any)?.error) { toast.error((data as any).error); return; }
              toast.success(`Demo ready — password: ${(data as any).password}`);
            }}
          >
            Seed Demo Tenant
          </Button>
          <Dialog open={showNewCompany} onOpenChange={setShowNewCompany}>
            <DialogTrigger asChild>
              <Button variant="outline" size="sm" className="gap-2">
                <Building2 className="h-4 w-4" /> New Company
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Create New Company</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Company Name</Label>
                  <Input
                    placeholder="Acme Corp"
                    value={newCompanyName}
                    onChange={e => setNewCompanyName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Country</Label>
                  <Select value={newCompanyCountry} onValueChange={setNewCompanyCountry}>
                    <SelectTrigger><SelectValue placeholder="Select country" /></SelectTrigger>
                    <SelectContent>
                      {countries.map(c => (
                        <SelectItem key={c.country_code} value={c.country_code}>
                          {c.country_name} ({c.base_currency})
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleCreateCompany} disabled={!newCompanyName || !newCompanyCountry || creatingCompany} className="w-full">
                  {creatingCompany ? 'Creating…' : 'Create Company'}
                </Button>
              </div>
            </DialogContent>
          </Dialog>

          <Dialog open={showInvite} onOpenChange={setShowInvite}>
            <DialogTrigger asChild>
              <Button size="sm" className="gap-2">
                <UserPlus className="h-4 w-4" /> Invite User
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle>Invite User</DialogTitle>
              </DialogHeader>
              <div className="space-y-4 pt-2">
                <div>
                  <Label>Email</Label>
                  <Input
                    type="email"
                    placeholder="user@torrevie.com"
                    value={inviteEmail}
                    onChange={e => setInviteEmail(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Full Name</Label>
                  <Input
                    placeholder="Ahmed Al Farsi"
                    value={inviteFullName}
                    onChange={e => setInviteFullName(e.target.value)}
                  />
                </div>
                <div>
                  <Label>Access Level</Label>
                  <Select value={inviteAccessLevel} onValueChange={value => setInviteAccessLevel(value as 'super_admin' | 'company')}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="company">Company User</SelectItem>
                      <SelectItem value="super_admin">Platform Super Admin</SelectItem>
                    </SelectContent>
                  </Select>
                  {inviteAccessLevel === 'super_admin' && (
                    <p className="text-xs text-muted-foreground mt-1">
                      Can create tenants, manage plans, and assign users across all companies.
                    </p>
                  )}
                </div>
                <div>
                  <Label>{inviteAccessLevel === 'super_admin' ? 'Default Company (optional)' : 'Company'}</Label>
                  <Select value={inviteCompanyId} onValueChange={setInviteCompanyId}>
                    <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                    <SelectContent>
                      {companies.map(c => (
                        <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Customer Role</Label>
                  <Select value={inviteRole} onValueChange={setInviteRole}>
                    <SelectTrigger><SelectValue /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="admin">Admin</SelectItem>
                      <SelectItem value="finance">Finance</SelectItem>
                      <SelectItem value="manager">Manager</SelectItem>
                      <SelectItem value="coordinator">Coordinator</SelectItem>
                      <SelectItem value="employee">Employee</SelectItem>
                    </SelectContent>
                  </Select>
                </div>
                <div>
                  <Label>Manager (optional)</Label>
                  <Select value={inviteManagerId || '__none__'} onValueChange={setInviteManagerId}>
                    <SelectTrigger><SelectValue placeholder="No manager" /></SelectTrigger>
                    <SelectContent>
                      <SelectItem value="__none__">No manager</SelectItem>
                      {admins
                        .filter(a => (a.company_id === inviteCompanyId || a.membership_company_ids?.includes(inviteCompanyId)) && a.full_name)
                        .map(a => (
                          <SelectItem key={a.id} value={a.id}>{a.full_name} ({a.role ?? 'employee'})</SelectItem>
                        ))}
                    </SelectContent>
                  </Select>
                </div>
                <Button onClick={handleInviteUser} disabled={!inviteEmail || (inviteAccessLevel === 'company' && !inviteCompanyId) || inviting} className="w-full">
                  {inviting ? 'Sending invite…' : 'Send Invitation'}
                </Button>
                <p className="text-xs text-muted-foreground flex items-center gap-1">
                  <Mail className="h-3 w-3" /> An email invitation will be sent to the user
                </p>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Companies Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <Building2 className="h-4 w-4" /> Companies ({companies.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Country</TableHead>
                <TableHead>Currency</TableHead>
                <TableHead>Plan</TableHead>
                <TableHead>Users</TableHead>
                <TableHead>Created</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {companies.map(c => {
                const userCount = admins.filter(a => a.company_id === c.id || a.membership_company_ids?.includes(c.id)).length;
                return (
                  <TableRow key={c.id}>
                    <TableCell className="font-medium">{c.name}</TableCell>
                    <TableCell>{c.country_code}</TableCell>
                    <TableCell>{c.base_currency}</TableCell>
                    <TableCell>
                      <Select
                        value={c.plan ?? 'trial'}
                        onValueChange={(plan) => handleCompanyPlanChange(c, plan)}
                        disabled={updatingCompanyPlanId === c.id}
                      >
                        <SelectTrigger className="h-8 w-[132px]">
                          <SelectValue />
                        </SelectTrigger>
                        <SelectContent>
                          {COMPANY_PLANS.map((plan) => (
                            <SelectItem key={plan.value} value={plan.value}>{plan.label}</SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                    </TableCell>
                    <TableCell>{userCount}</TableCell>
                    <TableCell className="text-xs text-muted-foreground">
                      {c.created_at ? format(new Date(c.created_at), 'dd MMM yyyy') : '—'}
                    </TableCell>
                  </TableRow>
                );
              })}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Users Table */}
      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="text-base flex items-center gap-2">
            <UserPlus className="h-4 w-4" /> Users ({admins.length})
          </CardTitle>
        </CardHeader>
        <CardContent className="p-0">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>Name</TableHead>
                <TableHead>Email</TableHead>
                <TableHead>Role</TableHead>
                <TableHead>Company</TableHead>
                <TableHead className="w-[140px]">Actions</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {admins.map(a => (
                <TableRow key={a.id}>
                  <TableCell className="font-medium">{a.full_name || '—'}</TableCell>
                  <TableCell className="text-sm text-muted-foreground">{a.email || '—'}</TableCell>
                  <TableCell><Badge variant="outline" className="capitalize text-xs">{getAccessLabel(a)}</Badge></TableCell>
                  <TableCell>{a.super_admin ? 'All tenants' : getCompanyName(a.company_id)}</TableCell>
                  <TableCell>
                    <div className="flex gap-1">
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs"
                        onClick={() => openEditUser(a)}
                      >
                        <Pencil className="h-3 w-3" />
                        Edit
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs"
                        disabled={reinviting === a.id}
                        onClick={() => handleReinvite(a)}
                      >
                        <RefreshCw className={`h-3 w-3 ${reinviting === a.id ? 'animate-spin' : ''}`} />
                        {reinviting === a.id ? '…' : 'Re-invite'}
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="gap-1 text-xs"
                        disabled={deletingUserId === a.id || a.id === profile?.id}
                        onClick={() => setUserToDelete(a)}
                      >
                        <Trash2 className="h-3 w-3" />
                        {a.id === profile?.id ? 'Current user' : deletingUserId === a.id ? 'Deleting…' : 'Delete'}
                      </Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </CardContent>
      </Card>

      {/* Edit User Dialog */}
      <Dialog open={showEdit} onOpenChange={setShowEdit}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Edit User</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 pt-2">
            <div>
              <Label>Full Name</Label>
              <Input
                value={editFullName}
                onChange={e => setEditFullName(e.target.value)}
              />
            </div>
            <div>
              <Label>Access Level</Label>
              <Select value={editAccessLevel} onValueChange={value => setEditAccessLevel(value as 'super_admin' | 'company')}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="company">Company User</SelectItem>
                  <SelectItem value="super_admin">Platform Super Admin</SelectItem>
                </SelectContent>
              </Select>
              {editAccessLevel === 'super_admin' && (
                <p className="text-xs text-muted-foreground mt-1">
                  This user can open Admin Panel and onboard tenants.
                </p>
              )}
            </div>
            <div>
              <Label>{editAccessLevel === 'super_admin' ? 'Default Company (optional)' : 'Default Company'}</Label>
              <Select value={editCompanyId} onValueChange={setEditCompanyId}>
                <SelectTrigger><SelectValue placeholder="Select company" /></SelectTrigger>
                <SelectContent>
                  {companies
                    .filter((company) => editAccessLevel === 'super_admin' || editMembershipCompanyIds.includes(company.id))
                    .map(c => (
                    <SelectItem key={c.id} value={c.id}>{c.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>Company Access</Label>
              <div className="mt-2 max-h-48 space-y-2 overflow-y-auto rounded-md border p-3">
                {companies.map((company) => {
                  const checked = editMembershipCompanyIds.includes(company.id);
                  return (
                    <label key={company.id} className="flex items-center gap-2 text-sm">
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={(event) => toggleEditMembership(company.id, event.target.checked)}
                        className="h-4 w-4 rounded border-border"
                      />
                      <span>{company.name}</span>
                      <span className="ml-auto text-xs text-muted-foreground">{company.country_code}</span>
                    </label>
                  );
                })}
              </div>
            </div>
            <div>
              <Label>Customer Role</Label>
              <Select value={editRole} onValueChange={setEditRole}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="admin">Admin</SelectItem>
                  <SelectItem value="finance">Finance</SelectItem>
                  <SelectItem value="manager">Manager</SelectItem>
                  <SelectItem value="coordinator">Coordinator</SelectItem>
                  <SelectItem value="employee">Employee</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button onClick={handleSaveUser} disabled={saving || (editAccessLevel === 'company' && !editCompanyId)} className="w-full">
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      <AlertDialog open={!!userToDelete} onOpenChange={(open) => !open && setUserToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Delete user?</AlertDialogTitle>
            <AlertDialogDescription>
              This removes the account so you can send a fresh invitation to{' '}
              <span className="font-medium text-foreground">{userToDelete?.email || userToDelete?.full_name || 'this user'}</span>.
              Any approval history will be kept, but the user will lose access immediately.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!deletingUserId}>Cancel</AlertDialogCancel>
            <AlertDialogAction
              disabled={!!deletingUserId}
              onClick={(event) => {
                event.preventDefault();
                handleDeleteUser();
              }}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deletingUserId ? 'Deleting…' : 'Delete user'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <Dialog open={!!inviteResult} onOpenChange={(open) => { if (!open) setInviteResult(null); }}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>{inviteResult?.emailSent ? 'Invitation sent' : 'Invitation link ready'}</DialogTitle>
            <DialogDescription>
              {inviteResult?.emailSent
                ? `The email was sent to ${inviteResult?.email}.`
                : `Email delivery is not configured yet. Copy this link and send it to ${inviteResult?.email}.`}
            </DialogDescription>
          </DialogHeader>
          <div className="rounded-lg border bg-muted/30 p-3 text-sm">
            <div className="flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Destination</span>
              <span className="font-medium break-all text-right">{inviteResult?.email}</span>
            </div>
            <div className="mt-2 flex items-center justify-between gap-3">
              <span className="text-muted-foreground">Delivery status</span>
              <Badge variant="outline">{inviteResult?.emailSent ? 'Email sent' : 'Copy link'}</Badge>
            </div>
          </div>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setInviteResult(null)}>Close</Button>
            <Button onClick={copyInviteLink} disabled={!inviteResult?.actionLink}>
              <Copy className="h-4 w-4 mr-1" />Copy link
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default AdminPanel;
