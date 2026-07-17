import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';
import { Search, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { cn } from '@/lib/utils';

type AuditEntry = {
  id: string; action: string; table_name: string; record_id: string | null;
  user_id: string | null; company_id: string | null; created_at: string | null;
  new_values: any; old_values: any; ip_address: string | null;
};

const ACTION_COLORS: Record<string, string> = {
  create: 'bg-green-100 text-green-800 border-green-200',
  update: 'bg-blue-100 text-blue-800 border-blue-200',
  delete: 'bg-red-100 text-red-800 border-red-200',
  approve: 'bg-green-100 text-green-800 border-green-200',
  reject: 'bg-red-100 text-red-800 border-red-200',
  system: 'bg-muted text-muted-foreground border-border',
};

const AuditLog = () => {
  const { profile, selectedCompanyId } = useAuth();
  const isSuperAdmin = profile?.super_admin;

  const [entries, setEntries] = useState<AuditEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [userNames, setUserNames] = useState<Record<string, string>>({});
  const [companyNames, setCompanyNames] = useState<Record<string, string>>({});

  // Filters
  const [actionFilter, setActionFilter] = useState('all');
  const [dateFrom, setDateFrom] = useState<Date | undefined>();
  const [dateTo, setDateTo] = useState<Date | undefined>();

  const fetchEntries = async () => {
    setLoading(true);
    let q = supabase.from('audit_log').select('*').order('created_at', { ascending: false }).limit(200);

    if (!isSuperAdmin && selectedCompanyId) {
      q = q.eq('company_id', selectedCompanyId);
    }
    if (actionFilter !== 'all') q = q.eq('action', actionFilter);
    if (dateFrom) q = q.gte('created_at', dateFrom.toISOString());
    if (dateTo) {
      const end = new Date(dateTo);
      end.setHours(23, 59, 59, 999);
      q = q.lte('created_at', end.toISOString());
    }

    const { data } = await q;
    const items = (data ?? []) as AuditEntry[];
    setEntries(items);

    // Fetch user names
    const userIds = [...new Set(items.map(e => e.user_id).filter(Boolean))] as string[];
    if (userIds.length > 0) {
      const { data: profiles } = await supabase.from('profiles').select('id, full_name').in('id', userIds);
      const names: Record<string, string> = {};
      (profiles ?? []).forEach(p => { names[p.id] = p.full_name ?? 'Unknown'; });
      setUserNames(names);
    }

    // Fetch company names for super admin
    if (isSuperAdmin) {
      const compIds = [...new Set(items.map(e => e.company_id).filter(Boolean))] as string[];
      if (compIds.length > 0) {
        const { data: comps } = await supabase.from('companies').select('id, name').in('id', compIds);
        const cNames: Record<string, string> = {};
        (comps ?? []).forEach(c => { cNames[c.id] = c.name; });
        setCompanyNames(cNames);
      }
    }

    setLoading(false);
  };

  useEffect(() => { fetchEntries(); }, [selectedCompanyId, actionFilter, dateFrom, dateTo]);

  const clearFilters = () => { setActionFilter('all'); setDateFrom(undefined); setDateTo(undefined); };
  const hasFilters = actionFilter !== 'all' || dateFrom || dateTo;

  return (
    <div className="bg-card rounded-lg border p-5">
      <h2 className="text-lg font-semibold text-foreground mb-4">Audit Log</h2>

      {/* Filters */}
      <div className="flex flex-wrap gap-3 mb-4 items-end">
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">Action</label>
          <Select value={actionFilter} onValueChange={setActionFilter}>
            <SelectTrigger className="w-36"><SelectValue /></SelectTrigger>
            <SelectContent>
              <SelectItem value="all">All actions</SelectItem>
              <SelectItem value="create">Create</SelectItem>
              <SelectItem value="update">Update</SelectItem>
              <SelectItem value="delete">Delete</SelectItem>
              <SelectItem value="approve">Approve</SelectItem>
              <SelectItem value="reject">Reject</SelectItem>
              <SelectItem value="system">System</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">From</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('w-36 justify-start text-left font-normal', !dateFrom && 'text-muted-foreground')}>
                {dateFrom ? format(dateFrom, 'dd MMM yyyy') : 'Pick date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateFrom} onSelect={setDateFrom} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        <div>
          <label className="text-xs font-medium text-muted-foreground mb-1 block">To</label>
          <Popover>
            <PopoverTrigger asChild>
              <Button variant="outline" className={cn('w-36 justify-start text-left font-normal', !dateTo && 'text-muted-foreground')}>
                {dateTo ? format(dateTo, 'dd MMM yyyy') : 'Pick date'}
              </Button>
            </PopoverTrigger>
            <PopoverContent className="w-auto p-0" align="start">
              <Calendar mode="single" selected={dateTo} onSelect={setDateTo} initialFocus className="p-3 pointer-events-auto" />
            </PopoverContent>
          </Popover>
        </div>
        {hasFilters && (
          <Button variant="ghost" size="sm" onClick={clearFilters}><X className="h-4 w-4 mr-1" />Clear</Button>
        )}
      </div>

      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>Date/Time</TableHead>
            <TableHead>User</TableHead>
            {isSuperAdmin && <TableHead>Company</TableHead>}
            <TableHead>Action</TableHead>
            <TableHead>Record Type</TableHead>
            <TableHead>Details</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {loading ? (
            <TableRow><TableCell colSpan={isSuperAdmin ? 6 : 5} className="text-center py-8 text-muted-foreground">Loading…</TableCell></TableRow>
          ) : entries.length === 0 ? (
            <TableRow><TableCell colSpan={isSuperAdmin ? 6 : 5} className="text-center py-8 text-muted-foreground">No audit entries found</TableCell></TableRow>
          ) : entries.map(entry => (
            <TableRow key={entry.id}>
              <TableCell className="whitespace-nowrap text-xs">
                {entry.created_at ? format(new Date(entry.created_at), 'dd MMM yyyy HH:mm') : '—'}
              </TableCell>
              <TableCell className="text-sm">
                {entry.user_id ? userNames[entry.user_id] ?? '…' : <span className="text-muted-foreground">System</span>}
              </TableCell>
              {isSuperAdmin && (
                <TableCell className="text-sm">{entry.company_id ? companyNames[entry.company_id] ?? '…' : '—'}</TableCell>
              )}
              <TableCell>
                <Badge variant="outline" className={cn('capitalize text-xs', ACTION_COLORS[entry.action] ?? '')}>
                  {entry.action}
                </Badge>
              </TableCell>
              <TableCell className="capitalize text-sm">{entry.table_name.replace(/_/g, ' ')}</TableCell>
              <TableCell className="text-xs text-muted-foreground max-w-xs truncate">
                {entry.new_values ? JSON.stringify(entry.new_values).slice(0, 120) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
};

export default AuditLog;
