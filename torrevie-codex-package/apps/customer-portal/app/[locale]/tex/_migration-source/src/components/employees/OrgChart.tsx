import React, { useEffect, useState } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Input } from '@/components/ui/input';
import { AlertTriangle, ChevronDown, ChevronRight, Users, UserCog } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';

type Person = {
  id: string;
  name: string;
  role: string | null;
  is_ceo: boolean;
  manager_id: string | null;
  type: 'profile' | 'employee';
  department: string | null;
  manager_profile_id?: string | null;
};

type TreeNode = Person & { children: TreeNode[] };

const buildTree = (people: Person[]): { roots: TreeNode[]; unassigned: Person[] } => {
  const map = new Map<string, TreeNode>();
  people.forEach(p => map.set(p.id, { ...p, children: [] }));

  const roots: TreeNode[] = [];
  const unassigned: Person[] = [];

  people.forEach(p => {
    const node = map.get(p.id)!;
    const parentId = p.type === 'profile' ? p.manager_id : p.manager_profile_id;
    if (p.is_ceo || !parentId) {
      if (p.is_ceo) {
        roots.unshift(node);
      } else {
        unassigned.push(p);
      }
    } else {
      const parent = map.get(parentId);
      if (parent) {
        parent.children.push(node);
      } else {
        unassigned.push(p);
      }
    }
  });

  if (roots.length === 0 && people.length > 0) {
    const firstProfile = people.find(p => p.type === 'profile' && !p.manager_id);
    if (firstProfile) {
      const node = map.get(firstProfile.id);
      if (node) roots.push(node);
    }
  }

  return { roots, unassigned };
};

const roleBadge = (role: string | null, isCeo: boolean) => {
  if (isCeo) return 'bg-primary/10 text-primary border-primary/30';
  if (role === 'admin') return 'bg-purple-100 text-purple-800 border-purple-200';
  if (role === 'finance') return 'bg-teal-100 text-teal-800 border-teal-200';
  if (role === 'manager') return 'bg-blue-100 text-blue-800 border-blue-200';
  return 'bg-muted text-muted-foreground border-border';
};

// Collect a person's id + all descendant ids to forbid as new managers (prevents cycles).
const collectForbidden = (people: Person[], personId: string): Set<string> => {
  const forbidden = new Set<string>([personId]);
  let added = true;
  while (added) {
    added = false;
    for (const p of people) {
      const parentId = p.type === 'profile' ? p.manager_id : p.manager_profile_id;
      if (parentId && forbidden.has(parentId) && !forbidden.has(p.id)) {
        forbidden.add(p.id);
        added = true;
      }
    }
  }
  return forbidden;
};

type ReassignProps = {
  person: Person;
  profiles: Person[];
  allPeople: Person[];
  onDone: () => void;
};

const ReassignPopover: React.FC<ReassignProps> = ({ person, profiles, allPeople, onDone }) => {
  const { user } = useAuth();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [saving, setSaving] = useState(false);

  const forbidden = collectForbidden(allPeople, person.id);
  // Employees can only report to profiles. Profiles can also only report to profiles in this app.
  const options = profiles.filter(p => !forbidden.has(p.id));
  const filtered = query
    ? options.filter(p => p.name.toLowerCase().includes(query.toLowerCase()))
    : options;

  const currentManagerId = person.type === 'profile' ? person.manager_id : (person.manager_profile_id ?? null);

  const assign = async (newManagerId: string | null) => {
    if (newManagerId === currentManagerId) { setOpen(false); return; }
    setSaving(true);
    const { error } = await (supabase as any).rpc('reassign_manager', {
      _person_id: person.id,
      _person_type: person.type,
      _new_manager_id: newManagerId,
    });
    if (error) {
      toast.error(error.message);
      setSaving(false);
      return;
    }
    toast.success(`Manager updated for ${person.name}`);
    setSaving(false);
    setOpen(false);
    onDone();
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button variant="outline" size="sm" className="h-7 px-2 text-xs" onClick={e => e.stopPropagation()}>
          <UserCog className="h-3 w-3 mr-1" />Reassign
        </Button>
      </PopoverTrigger>
      <PopoverContent className="w-72 p-0" align="end" onClick={e => e.stopPropagation()}>
        <div className="p-2 border-b">
          <Input
            placeholder="Search manager…"
            value={query}
            onChange={e => setQuery(e.target.value)}
            className="h-8 text-sm"
          />
        </div>
        <div className="max-h-64 overflow-y-auto py-1">
          <button
            disabled={saving}
            onClick={() => assign(null)}
            className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center justify-between"
          >
            <span className="text-muted-foreground italic">No manager (top-level)</span>
            {currentManagerId === null && <span className="text-xs text-primary">current</span>}
          </button>
          {filtered.length === 0 && (
            <p className="px-3 py-2 text-xs text-muted-foreground">No eligible managers</p>
          )}
          {filtered.map(p => (
            <button
              key={p.id}
              disabled={saving}
              onClick={() => assign(p.id)}
              className="w-full text-left px-3 py-1.5 text-sm hover:bg-accent flex items-center justify-between"
            >
              <span className="text-foreground">{p.name}</span>
              {currentManagerId === p.id && <span className="text-xs text-primary">current</span>}
            </button>
          ))}
        </div>
      </PopoverContent>
    </Popover>
  );
};

const TreeNodeComponent: React.FC<{
  node: TreeNode;
  level: number;
  canEdit: boolean;
  profiles: Person[];
  allPeople: Person[];
  onChanged: () => void;
}> = ({ node, level, canEdit, profiles, allPeople, onChanged }) => {
  const [expanded, setExpanded] = useState(level < 2);

  return (
    <div className={cn('ml-0', level > 0 && 'ml-6 border-l border-border pl-4')}>
      <div
        className="flex items-center gap-2 py-2 cursor-pointer hover:bg-muted/50 rounded-md px-2 -ml-2"
        onClick={() => setExpanded(!expanded)}
      >
        {node.children.length > 0 ? (
          expanded ? <ChevronDown className="h-4 w-4 text-muted-foreground" /> : <ChevronRight className="h-4 w-4 text-muted-foreground" />
        ) : <div className="w-4" />}

        <div className="h-8 w-8 rounded-full bg-primary/10 flex items-center justify-center text-primary text-xs font-semibold flex-shrink-0">
          {node.name[0]?.toUpperCase()}
        </div>

        <div className="flex-1 min-w-0">
          <div className="flex items-center gap-2 flex-wrap">
            <span className="text-sm font-medium text-foreground truncate">{node.name}</span>
            <Badge variant="outline" className={cn('text-[10px] capitalize', roleBadge(node.role, node.is_ceo))}>
              {node.is_ceo ? 'CEO' : (node.role ?? (node.type === 'employee' ? 'WhatsApp' : 'employee'))}
            </Badge>
          </div>
          {node.department && <p className="text-xs text-muted-foreground">{node.department}</p>}
        </div>

        {node.children.length > 0 && (
          <span className="text-xs text-muted-foreground flex items-center gap-0.5">
            <Users className="h-3 w-3" /> {node.children.length}
          </span>
        )}

        {canEdit && !node.is_ceo && (
          <ReassignPopover person={node} profiles={profiles} allPeople={allPeople} onDone={onChanged} />
        )}
      </div>

      {expanded && node.children.length > 0 && (
        <div>
          {node.children.map(child => (
            <TreeNodeComponent
              key={child.id}
              node={child}
              level={level + 1}
              canEdit={canEdit}
              profiles={profiles}
              allPeople={allPeople}
              onChanged={onChanged}
            />
          ))}
        </div>
      )}
    </div>
  );
};

const OrgChart = () => {
  const { selectedCompanyId, profile } = useAuth();
  const canEdit = profile?.role === 'admin' || !!profile?.super_admin;
  const [people, setPeople] = useState<Person[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadTick, setReloadTick] = useState(0);

  useEffect(() => {
    if (!selectedCompanyId) return;
    let cancelled = false;
    const load = async () => {
      setLoading(true);
      const [{ data: profiles }, { data: employees }] = await Promise.all([
        supabase.from('profiles').select('id, full_name, role, is_ceo, manager_id, company_id').eq('company_id', selectedCompanyId),
        supabase.from('employees').select('id, name, department, manager_profile_id, company_id').eq('company_id', selectedCompanyId).eq('is_active', true),
      ]);
      if (cancelled) return;

      const result: Person[] = [];
      (profiles ?? []).forEach((p: any) => {
        result.push({
          id: p.id,
          name: p.full_name ?? 'Unnamed',
          role: p.role,
          is_ceo: p.is_ceo ?? false,
          manager_id: p.manager_id ?? null,
          type: 'profile',
          department: null,
          ...(p as any),
        });
      });
      (employees ?? []).forEach((e: any) => {
        result.push({
          id: e.id,
          name: e.name,
          role: null,
          is_ceo: false,
          manager_id: null,
          manager_profile_id: e.manager_profile_id ?? null,
          type: 'employee',
          department: e.department,
          ...(e as any),
        });
      });
      setPeople(result);
      setLoading(false);
    };
    load();
    return () => { cancelled = true; };
  }, [selectedCompanyId, reloadTick]);

  if (loading) return <div className="text-center py-8 text-muted-foreground">Loading org chart…</div>;

  const { roots, unassigned } = buildTree(people);
  const profileOptions = people.filter(p => p.type === 'profile');
  const refresh = () => setReloadTick(t => t + 1);

  return (
    <div className="space-y-6">
      <Card>
        <CardContent className="p-4">
          {roots.length === 0 && unassigned.length === 0 ? (
            <p className="text-sm text-muted-foreground text-center py-8">No people found. Add employees to see the org chart.</p>
          ) : (
            <>
              {roots.map(root => (
                <TreeNodeComponent
                  key={root.id}
                  node={root}
                  level={0}
                  canEdit={canEdit}
                  profiles={profileOptions}
                  allPeople={people}
                  onChanged={refresh}
                />
              ))}
            </>
          )}
        </CardContent>
      </Card>

      {unassigned.length > 0 && (
        <Card className="border-amber-300">
          <CardContent className="p-4">
            <div className="flex items-center gap-2 mb-3">
              <AlertTriangle className="h-4 w-4 text-amber-600" />
              <h3 className="text-sm font-semibold text-amber-800">Unassigned — {unassigned.length} people</h3>
            </div>
            <div className="space-y-2">
              {unassigned.map(p => (
                <div key={p.id} className="flex items-center gap-2 py-1">
                  <div className="h-6 w-6 rounded-full bg-amber-100 flex items-center justify-center text-amber-800 text-xs font-semibold">
                    {p.name[0]?.toUpperCase()}
                  </div>
                  <span className="text-sm text-foreground flex-1">{p.name}</span>
                  <Badge variant="outline" className="text-[10px]">{p.type === 'employee' ? 'WhatsApp' : p.role ?? 'employee'}</Badge>
                  {canEdit && (
                    <ReassignPopover person={p} profiles={profileOptions} allPeople={people} onDone={refresh} />
                  )}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
};

export default OrgChart;
