import React, { useEffect, useMemo, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import {
  format, startOfMonth, endOfMonth, startOfQuarter, endOfQuarter, startOfYear,
  subMonths, subQuarters, subDays, differenceInDays, eachDayOfInterval, eachWeekOfInterval,
  parseISO, isAfter, isBefore,
} from 'date-fns';
import {
  BarChart3, Download, FileSpreadsheet, TrendingUp, TrendingDown, Copy, X,
  CalendarIcon, Filter, ArrowUpRight,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Tooltip, TooltipContent, TooltipTrigger } from '@/components/ui/tooltip';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Sheet, SheetContent, SheetHeader, SheetTitle, SheetDescription } from '@/components/ui/sheet';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { MultiSelectFilter, Option } from '@/components/reports/MultiSelectFilter';
import {
  ResponsiveContainer, AreaChart, Area, XAxis, YAxis, CartesianGrid, Tooltip as RTooltip,
  PieChart, Pie, Cell, Legend, BarChart, Bar,
} from 'recharts';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';
import * as XLSX from 'xlsx';

type Expense = {
  id: string; date: string; vendor: string | null; employee_name: string | null;
  category: string | null; amount: number; currency: string; base_amount: number | null;
  status: string | null; source: string | null; payment_method: string | null;
  notes: string | null; tax_amount: number | null; tax_id_number: string | null;
  exchange_rate: number | null; receipt_image_url: string | null;
  trip_name: string | null; employee_id: string | null; trip_id: string | null;
  company_id: string; employee_phone: string | null; expense_type: string | null;
  rejected_reason: string | null; policy_flag: boolean | null;
  approved_at: string | null; paid_at: string | null; created_at: string | null;
};

type Trip = { id: string; name: string; status: string | null; budget_aed: number | null };
type CountryConfig = { tax_authority_name: string | null; tax_name: string | null; tax_id_label: string | null; has_vat: boolean | null };
type EmployeeRow = { id: string; name: string; department: string | null; team_id?: string | null };

type Preset = 'this-month' | 'last-month' | 'this-quarter' | 'last-quarter' | 'ytd' | 'last-12' | 'custom';

const PRESETS: { id: Preset; label: string }[] = [
  { id: 'this-month', label: 'This month' },
  { id: 'last-month', label: 'Last month' },
  { id: 'this-quarter', label: 'This quarter' },
  { id: 'last-quarter', label: 'Last quarter' },
  { id: 'ytd', label: 'YTD' },
  { id: 'last-12', label: 'Last 12 months' },
];

const presetRange = (p: Preset): { from: Date; to: Date } => {
  const now = new Date();
  switch (p) {
    case 'this-month': return { from: startOfMonth(now), to: endOfMonth(now) };
    case 'last-month': { const d = subMonths(now, 1); return { from: startOfMonth(d), to: endOfMonth(d) }; }
    case 'this-quarter': return { from: startOfQuarter(now), to: endOfQuarter(now) };
    case 'last-quarter': { const d = subQuarters(now, 1); return { from: startOfQuarter(d), to: endOfQuarter(d) }; }
    case 'ytd': return { from: startOfYear(now), to: now };
    case 'last-12': return { from: subMonths(now, 12), to: now };
    default: return { from: startOfMonth(now), to: endOfMonth(now) };
  }
};

const CHART_COLORS = ['hsl(var(--primary))', '#0f9f94', '#F59E0B', '#EF4444', '#8B5CF6', '#06B6D4', '#84CC16', '#EC4899', '#F97316', '#6366F1'];

interface Filters {
  employees: string[]; teams: string[]; departments: string[]; trips: string[];
  categories: string[]; paymentMethods: string[]; sources: string[]; currencies: string[];
  statuses: string[]; minAmount: string; maxAmount: string;
  flaggedOnly: boolean; missingReceipt: boolean; reimbursableOnly: boolean;
}

const emptyFilters: Filters = {
  employees: [], teams: [], departments: [], trips: [], categories: [],
  paymentMethods: [], sources: [], currencies: [], statuses: [],
  minAmount: '', maxAmount: '', flaggedOnly: false, missingReceipt: false, reimbursableOnly: false,
};

const fmt = (n: number, cur: string) =>
  new Intl.NumberFormat(undefined, { style: 'currency', currency: cur || 'USD', maximumFractionDigits: 0 }).format(n);

const fmtPct = (n: number) => `${n > 0 ? '+' : ''}${n.toFixed(1)}%`;

const Reports = () => {
  const { profile, selectedCompanyId } = useAuth();
  const navigate = useNavigate();

  const [company, setCompany] = useState<{ base_currency: string; name: string; country_code: string } | null>(null);
  const [countryConfig, setCountryConfig] = useState<CountryConfig | null>(null);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [employees, setEmployees] = useState<EmployeeRow[]>([]);
  const [teams, setTeams] = useState<{ id: string; name: string }[]>([]);
  const [expenses, setExpenses] = useState<Expense[]>([]);
  const [prevExpenses, setPrevExpenses] = useState<Expense[]>([]);
  const [loading, setLoading] = useState(true);

  // Date range
  const [preset, setPreset] = useState<Preset>('this-month');
  const [range, setRange] = useState<{ from: Date; to: Date }>(presetRange('this-month'));
  const [filters, setFilters] = useState<Filters>(emptyFilters);
  const [grouping, setGrouping] = useState<'team' | 'department' | 'manager'>('department');

  // Drill-through
  const [drillTitle, setDrillTitle] = useState<string | null>(null);
  const [drillRows, setDrillRows] = useState<Expense[]>([]);

  const baseCurrency = company?.base_currency ?? 'USD';

  // Load static dimensions
  useEffect(() => {
    if (!selectedCompanyId) return;
    (async () => {
      const [cRes, eRes, tRes, tmRes] = await Promise.all([
        supabase.from('companies').select('base_currency, name, country_code').eq('id', selectedCompanyId).single(),
        supabase.from('employees').select('id, name, department').eq('company_id', selectedCompanyId),
        supabase.from('trips').select('id, name, status, budget_aed').eq('company_id', selectedCompanyId),
        supabase.from('teams').select('id, name').eq('company_id', selectedCompanyId),
      ]);
      setCompany(cRes.data);
      setEmployees(eRes.data ?? []);
      setTrips(tRes.data ?? []);
      setTeams(tmRes.data ?? []);
      if (cRes.data?.country_code) {
        const { data: cc } = await supabase.from('country_configs')
          .select('tax_authority_name, tax_name, tax_id_label, has_vat')
          .eq('country_code', cRes.data.country_code).single();
        setCountryConfig(cc);
      }
    })();
  }, [selectedCompanyId]);

  // Apply preset → range
  useEffect(() => {
    if (preset !== 'custom') setRange(presetRange(preset));
  }, [preset]);

  // Load expenses (current + previous period)
  useEffect(() => {
    if (!selectedCompanyId) return;
    setLoading(true);
    const days = Math.max(1, differenceInDays(range.to, range.from) + 1);
    const prevTo = subDays(range.from, 1);
    const prevFrom = subDays(prevTo, days - 1);

    Promise.all([
      supabase.from('expenses').select('*').eq('company_id', selectedCompanyId)
        .gte('date', format(range.from, 'yyyy-MM-dd'))
        .lte('date', format(range.to, 'yyyy-MM-dd'))
        .order('date', { ascending: false }),
      supabase.from('expenses').select('*').eq('company_id', selectedCompanyId)
        .gte('date', format(prevFrom, 'yyyy-MM-dd'))
        .lte('date', format(prevTo, 'yyyy-MM-dd')),
    ]).then(([cur, prev]) => {
      setExpenses((cur.data as Expense[]) ?? []);
      setPrevExpenses((prev.data as Expense[]) ?? []);
      setLoading(false);
    });
  }, [selectedCompanyId, range.from, range.to]);

  // === Apply client-side filters ===
  const empById = useMemo(() => Object.fromEntries(employees.map(e => [e.id, e])), [employees]);

  const passes = (e: Expense): boolean => {
    if (filters.employees.length && !(e.employee_id && filters.employees.includes(e.employee_id))) return false;
    if (filters.departments.length) {
      const dep = e.employee_id ? empById[e.employee_id]?.department : null;
      if (!dep || !filters.departments.includes(dep)) return false;
    }
    if (filters.trips.length && !(e.trip_id && filters.trips.includes(e.trip_id))) return false;
    if (filters.categories.length && !(e.category && filters.categories.includes(e.category))) return false;
    if (filters.paymentMethods.length && !(e.payment_method && filters.paymentMethods.includes(e.payment_method))) return false;
    if (filters.sources.length && !(e.source && filters.sources.includes(e.source))) return false;
    if (filters.currencies.length && !filters.currencies.includes(e.currency)) return false;
    if (filters.statuses.length && !(e.status && filters.statuses.includes(e.status))) return false;
    const amt = e.base_amount ?? 0;
    if (filters.minAmount && amt < Number(filters.minAmount)) return false;
    if (filters.maxAmount && amt > Number(filters.maxAmount)) return false;
    if (filters.flaggedOnly && !e.policy_flag) return false;
    if (filters.missingReceipt && e.receipt_image_url) return false;
    if (filters.reimbursableOnly && e.payment_method !== 'personal' && e.expense_type !== 'reimbursable') return false;
    return true;
  };

  const filtered = useMemo(() => expenses.filter(passes), [expenses, filters, empById]);
  const filteredPrev = useMemo(() => prevExpenses.filter(passes), [prevExpenses, filters, empById]);

  // Spend totals exclude rejected
  const spendable = (arr: Expense[]) => arr.filter(e => e.status !== 'rejected');

  // === KPIs ===
  const kpis = useMemo(() => {
    const cur = spendable(filtered);
    const prev = spendable(filteredPrev);
    const total = cur.reduce((s, e) => s + (e.base_amount ?? 0), 0);
    const totalPrev = prev.reduce((s, e) => s + (e.base_amount ?? 0), 0);
    const count = filtered.length;
    const countPrev = filteredPrev.length;
    const avg = count > 0 ? total / count : 0;
    const avgPrev = countPrev > 0 ? totalPrev / countPrev : 0;
    const outstanding = filtered.filter(e => e.status === 'approved' && !e.paid_at).reduce((s, e) => s + (e.base_amount ?? 0), 0);
    const flagged = filtered.filter(e => e.policy_flag).length;
    const flaggedPct = count > 0 ? (flagged / count) * 100 : 0;
    const flaggedPrev = countPrev > 0 ? (filteredPrev.filter(e => e.policy_flag).length / countPrev) * 100 : 0;
    const cycleArr = filtered.filter(e => e.approved_at && e.created_at)
      .map(e => differenceInDays(parseISO(e.approved_at!), parseISO(e.created_at!)));
    const cycle = cycleArr.length ? cycleArr.reduce((a, b) => a + b, 0) / cycleArr.length : 0;
    const cyclePrev = (() => {
      const a = filteredPrev.filter(e => e.approved_at && e.created_at)
        .map(e => differenceInDays(parseISO(e.approved_at!), parseISO(e.created_at!)));
      return a.length ? a.reduce((x, y) => x + y, 0) / a.length : 0;
    })();
    const delta = (a: number, b: number) => b === 0 ? null : ((a - b) / b) * 100;
    return {
      total, totalDelta: delta(total, totalPrev),
      count, countDelta: delta(count, countPrev),
      avg, avgDelta: delta(avg, avgPrev),
      outstanding,
      flaggedPct, flaggedDelta: delta(flaggedPct, flaggedPrev),
      cycle, cycleDelta: delta(cycle, cyclePrev),
    };
  }, [filtered, filteredPrev]);

  // === Trend data ===
  const trendData = useMemo(() => {
    const days = differenceInDays(range.to, range.from) + 1;
    const useWeeks = days > 60;
    const buckets = useWeeks
      ? eachWeekOfInterval({ start: range.from, end: range.to })
      : eachDayOfInterval({ start: range.from, end: range.to });
    const fmtKey = (d: Date) => format(d, useWeeks ? 'yyyy-ww' : 'yyyy-MM-dd');
    const curMap: Record<string, number> = {};
    const prevMap: Record<string, number> = {};
    spendable(filtered).forEach(e => {
      const d = parseISO(e.date);
      curMap[fmtKey(d)] = (curMap[fmtKey(d)] ?? 0) + (e.base_amount ?? 0);
    });
    // Map prev period onto current bucket index
    spendable(filteredPrev).forEach(e => {
      const d = parseISO(e.date);
      const offset = differenceInDays(d, subDays(range.from, days));
      const targetIdx = Math.floor(offset / (useWeeks ? 7 : 1));
      const target = buckets[targetIdx];
      if (target) prevMap[fmtKey(target)] = (prevMap[fmtKey(target)] ?? 0) + (e.base_amount ?? 0);
    });
    return buckets.map(d => ({
      label: format(d, useWeeks ? 'dd MMM' : 'dd MMM'),
      key: fmtKey(d),
      Current: Math.round((curMap[fmtKey(d)] ?? 0) * 100) / 100,
      Previous: Math.round((prevMap[fmtKey(d)] ?? 0) * 100) / 100,
    }));
  }, [filtered, filteredPrev, range]);

  // === Category breakdown ===
  const categoryData = useMemo(() => {
    const m: Record<string, { total: number; count: number; prev: number }> = {};
    spendable(filtered).forEach(e => {
      const k = e.category ?? 'Uncategorized';
      m[k] ??= { total: 0, count: 0, prev: 0 };
      m[k].total += e.base_amount ?? 0; m[k].count++;
    });
    spendable(filteredPrev).forEach(e => {
      const k = e.category ?? 'Uncategorized';
      m[k] ??= { total: 0, count: 0, prev: 0 };
      m[k].prev += e.base_amount ?? 0;
    });
    return Object.entries(m).map(([category, v]) => ({
      category, total: v.total, count: v.count, prev: v.prev,
      change: v.prev > 0 ? ((v.total - v.prev) / v.prev) * 100 : null,
    })).sort((a, b) => b.total - a.total);
  }, [filtered, filteredPrev]);

  const totalSpend = kpis.total;

  // === Employee data ===
  const employeeData = useMemo(() => {
    const m: Record<string, { name: string; id: string | null; count: number; total: number }> = {};
    spendable(filtered).forEach(e => {
      const k = e.employee_id ?? e.employee_name ?? 'Unknown';
      m[k] ??= { name: e.employee_name ?? 'Unknown', id: e.employee_id, count: 0, total: 0 };
      m[k].count++; m[k].total += e.base_amount ?? 0;
    });
    return Object.values(m).sort((a, b) => b.total - a.total);
  }, [filtered]);

  // === Status funnel ===
  const statusData = useMemo(() => {
    const counts: Record<string, { count: number; total: number }> = {
      pending: { count: 0, total: 0 }, approved: { count: 0, total: 0 },
      paid: { count: 0, total: 0 }, rejected: { count: 0, total: 0 },
    };
    filtered.forEach(e => {
      const s = e.status ?? 'pending';
      counts[s] ??= { count: 0, total: 0 };
      counts[s].count++; counts[s].total += e.base_amount ?? 0;
    });
    return counts;
  }, [filtered]);

  // === Team / Department grouping ===
  const groupData = useMemo(() => {
    const m: Record<string, number> = {};
    spendable(filtered).forEach(e => {
      let key = 'Unassigned';
      if (grouping === 'department') {
        const dep = e.employee_id ? empById[e.employee_id]?.department : null;
        if (dep) key = dep;
      } else if (grouping === 'team') {
        // team membership not on expense; fall back to employee→team lookup not available, use trip name as proxy
        key = e.trip_name ?? 'Unassigned';
      } else {
        key = e.employee_name ?? 'Unassigned';
      }
      m[key] = (m[key] ?? 0) + (e.base_amount ?? 0);
    });
    return Object.entries(m).map(([name, total]) => ({ name, total })).sort((a, b) => b.total - a.total).slice(0, 12);
  }, [filtered, grouping, empById]);

  // === Budget vs Actual ===
  const budgetData = useMemo(() => {
    const tripSpend: Record<string, number> = {};
    spendable(filtered).forEach(e => { if (e.trip_id) tripSpend[e.trip_id] = (tripSpend[e.trip_id] ?? 0) + (e.base_amount ?? 0); });
    return trips.map(t => ({
      id: t.id, name: t.name, status: t.status,
      budget: t.budget_aed ?? 0, spent: tripSpend[t.id] ?? 0,
      variance: (t.budget_aed ?? 0) - (tripSpend[t.id] ?? 0),
      pct: t.budget_aed ? ((tripSpend[t.id] ?? 0) / t.budget_aed) * 100 : null,
    })).filter(t => t.spent > 0 || t.budget > 0).sort((a, b) => (b.pct ?? 0) - (a.pct ?? 0));
  }, [filtered, trips]);

  const totalBudget = budgetData.reduce((s, t) => s + t.budget, 0);
  const totalSpent = budgetData.reduce((s, t) => s + t.spent, 0);

  // === Active filter chips ===
  const activeChips: { label: string; clear: () => void }[] = [];
  const addChips = (arr: string[], prefix: string, key: keyof Filters, lookup?: (v: string) => string) => {
    arr.forEach(v => activeChips.push({
      label: `${prefix}: ${lookup ? lookup(v) : v}`,
      clear: () => setFilters(f => ({ ...f, [key]: (f[key] as string[]).filter(x => x !== v) }) as Filters),
    }));
  };
  addChips(filters.employees, 'Employee', 'employees', v => empById[v]?.name ?? v);
  addChips(filters.departments, 'Dept', 'departments');
  addChips(filters.trips, 'Trip', 'trips', v => trips.find(t => t.id === v)?.name ?? v);
  addChips(filters.categories, 'Category', 'categories');
  addChips(filters.paymentMethods, 'Pay', 'paymentMethods');
  addChips(filters.sources, 'Source', 'sources');
  addChips(filters.currencies, 'Cur', 'currencies');
  addChips(filters.statuses, 'Status', 'statuses');
  if (filters.minAmount) activeChips.push({ label: `Min ${filters.minAmount}`, clear: () => setFilters(f => ({ ...f, minAmount: '' })) });
  if (filters.maxAmount) activeChips.push({ label: `Max ${filters.maxAmount}`, clear: () => setFilters(f => ({ ...f, maxAmount: '' })) });
  if (filters.flaggedOnly) activeChips.push({ label: 'Flagged only', clear: () => setFilters(f => ({ ...f, flaggedOnly: false })) });
  if (filters.missingReceipt) activeChips.push({ label: 'Missing receipt', clear: () => setFilters(f => ({ ...f, missingReceipt: false })) });
  if (filters.reimbursableOnly) activeChips.push({ label: 'Reimbursable', clear: () => setFilters(f => ({ ...f, reimbursableOnly: false })) });

  // === Drill-through ===
  const openDrill = (title: string, predicate: (e: Expense) => boolean) => {
    setDrillTitle(title);
    setDrillRows(filtered.filter(predicate));
  };

  // === Options for filters ===
  const opt = (arr: (string | null | undefined)[]): Option[] =>
    Array.from(new Set(arr.filter(Boolean) as string[])).sort().map(v => ({ value: v, label: v }));
  const employeeOptions: Option[] = employees.map(e => ({ value: e.id, label: e.name })).sort((a, b) => a.label.localeCompare(b.label));
  const tripOptions: Option[] = trips.map(t => ({ value: t.id, label: t.name }));
  const categoryOptions = opt(expenses.map(e => e.category));
  const paymentOptions = opt(expenses.map(e => e.payment_method));
  const sourceOptions = opt(expenses.map(e => e.source));
  const currencyOptions = opt(expenses.map(e => e.currency));
  const statusOptions = opt(expenses.map(e => e.status));
  const departmentOptions = opt(employees.map(e => e.department));

  // === Exports respect filters ===
  const handleExportExcel = () => {
    if (filtered.length === 0) { toast.error('No expenses to export'); return; }
    const rows = filtered.map(e => ({
      Date: e.date, Vendor: e.vendor ?? '', Employee: e.employee_name ?? '',
      Department: e.employee_id ? (empById[e.employee_id]?.department ?? '') : '',
      Trip: e.trip_name ?? '', Category: e.category ?? '', 'Payment Method': e.payment_method ?? '',
      'Original Amount': e.amount, Currency: e.currency, 'Base Amount': e.base_amount ?? '',
      'Base Currency': baseCurrency, 'Exchange Rate': e.exchange_rate ?? '',
      'Tax Amount': e.tax_amount ?? '', 'Tax ID': e.tax_id_number ?? '',
      Notes: e.notes ?? '', Status: e.status ?? 'pending',
      'Policy Flag': e.policy_flag ? 'Yes' : '', 'Rejected Reason': e.rejected_reason ?? '',
      Source: e.source ?? 'web', Receipt: e.receipt_image_url ?? '',
    }));
    const totalBase = spendable(filtered).reduce((s, e) => s + (e.base_amount ?? 0), 0);
    rows.push({ Date: '', Vendor: '', Employee: '', Department: '', Trip: '', Category: '',
      'Payment Method': 'TOTAL', 'Original Amount': '' as any, Currency: '',
      'Base Amount': Math.round(totalBase * 100) / 100, 'Base Currency': baseCurrency,
      'Exchange Rate': '' as any, 'Tax Amount': '' as any, 'Tax ID': '', Notes: '', Status: '',
      'Policy Flag': '', 'Rejected Reason': '', Source: '', Receipt: '' });
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 14) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, 'Expenses');
    XLSX.writeFile(wb, `TEX_Expenses_${company?.name?.replace(/\s+/g, '_') ?? 'Company'}_${format(new Date(), 'yyyy-MM-dd')}.xlsx`);
    toast.success(`Exported ${filtered.length} expenses`);
  };

  const handleTaxReport = () => {
    // 1. Only filing-ready statuses belong on a tax filing
    const FILING_STATUSES = new Set(['approved', 'finance_reviewed', 'paid']);
    const filingReady = filtered.filter(e => FILING_STATUSES.has(e.status));
    // 2. Only rows with a TRN qualify for a VAT filing
    const taxExpenses = filingReady.filter(e => e.tax_id_number && e.tax_id_number.trim() !== '');
    if (taxExpenses.length === 0) {
      toast.error('No approved or paid tax records in this period');
      return;
    }
    // 3. Dedup identical tax invoices — prefer the most-final status
    const STATUS_RANK: Record<string, number> = { paid: 3, finance_reviewed: 2, approved: 1 };
    const seen = new Map<string, typeof taxExpenses[number]>();
    for (const e of taxExpenses) {
      const key = [
        e.date ?? '',
        (e.vendor ?? '').trim().toLowerCase(),
        (e.tax_id_number ?? '').trim(),
        e.amount ?? '',
        e.currency ?? '',
        (e.employee_name ?? '').trim().toLowerCase(),
      ].join('|');
      const existing = seen.get(key);
      if (!existing || (STATUS_RANK[e.status] ?? 0) > (STATUS_RANK[existing.status] ?? 0)) {
        seen.set(key, e);
      }
    }
    const deduped = Array.from(seen.values());
    const dupCount = taxExpenses.length - deduped.length;

    const taxName = countryConfig?.tax_name ?? 'VAT';
    const taxIdLabel = countryConfig?.tax_id_label ?? 'Tax ID';
    const taxAuthority = countryConfig?.tax_authority_name ?? 'Tax Authority';
    const rows = deduped.map(e => ({
      'Tax Period': e.date ? format(parseISO(e.date), 'MMM yyyy') : '',
      'Supplier Name': e.vendor ?? '', [taxIdLabel]: e.tax_id_number ?? '',
      'Invoice Date': e.date, [`Invoice Amount (${baseCurrency})`]: e.base_amount ?? e.amount,
      [`${taxName} Amount (${baseCurrency})`]: e.tax_amount ?? 0,
      'Expense Category': e.category ?? '', Employee: e.employee_name ?? '', Status: e.status,
    }));
    const ws = XLSX.utils.json_to_sheet(rows);
    ws['!cols'] = Object.keys(rows[0]).map(k => ({ wch: Math.max(k.length + 2, 16) }));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, `${taxName} Report`);
    XLSX.writeFile(wb, `TEX_${taxAuthority.replace(/\s+/g, '_')}_Report_${format(range.from, 'yyyy-MM')}.xlsx`);
    toast.success(
      dupCount > 0
        ? `Tax report exported — ${deduped.length} invoice${deduped.length === 1 ? '' : 's'} (collapsed ${dupCount} duplicate${dupCount === 1 ? '' : 's'})`
        : `Tax report exported — ${deduped.length} invoice${deduped.length === 1 ? '' : 's'}`
    );
  };

  const handleCopySummary = () => {
    const lines = [
      `${company?.name ?? 'Company'} — Expense Report`,
      `Period: ${format(range.from, 'dd MMM yyyy')} – ${format(range.to, 'dd MMM yyyy')}`,
      ``,
      `Total Spend: ${fmt(kpis.total, baseCurrency)}${kpis.totalDelta !== null ? ` (${fmtPct(kpis.totalDelta)} vs prev)` : ''}`,
      `Expenses: ${kpis.count}${kpis.countDelta !== null ? ` (${fmtPct(kpis.countDelta)})` : ''}`,
      `Avg per Expense: ${fmt(kpis.avg, baseCurrency)}`,
      `Reimbursable Outstanding: ${fmt(kpis.outstanding, baseCurrency)}`,
      `Policy-Flagged: ${kpis.flaggedPct.toFixed(1)}%`,
      `Avg Approval Cycle: ${kpis.cycle.toFixed(1)} days`,
    ];
    navigator.clipboard.writeText(lines.join('\n'));
    toast.success('Summary copied to clipboard');
  };

  const showTaxReport = countryConfig?.has_vat !== false;
  const rangeLabel = `${format(range.from, 'dd MMM')} – ${format(range.to, 'dd MMM yyyy')}`;

  // === Render ===
  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Reports</h1>
          <p className="text-xs text-muted-foreground mt-0.5">Period: {rangeLabel}</p>
        </div>
        <div className="flex items-center gap-2 flex-wrap">
          <Button onClick={handleCopySummary} size="sm" variant="ghost"><Copy className="h-4 w-4 mr-1.5" />Copy summary</Button>
          <Button onClick={handleExportExcel} size="sm"><FileSpreadsheet className="h-4 w-4 mr-1.5" />Excel</Button>
          {showTaxReport ? (
            <Tooltip>
              <TooltipTrigger asChild>
                <Button onClick={handleTaxReport} size="sm" variant="outline"><Download className="h-4 w-4 mr-1.5" />{countryConfig?.tax_name ?? 'Tax'} Report</Button>
              </TooltipTrigger>
              <TooltipContent>Includes approved & paid invoices only. Pending and rejected are excluded.</TooltipContent>
            </Tooltip>
          ) : (
            <Tooltip><TooltipTrigger asChild><Button size="sm" variant="outline" disabled><Download className="h-4 w-4 mr-1.5" />Tax Report</Button></TooltipTrigger>
              <TooltipContent>Tax reporting is not applicable for your country.</TooltipContent></Tooltip>
          )}
        </div>
      </div>

      {/* Date range + presets */}
      <Card>
        <CardContent className="p-3 space-y-3">
          <div className="flex items-center gap-2 flex-wrap">
            {PRESETS.map(p => (
              <Button key={p.id} size="sm" variant={preset === p.id ? 'default' : 'outline'}
                className="h-8 text-xs" onClick={() => setPreset(p.id)}>{p.label}</Button>
            ))}
            <Popover>
              <PopoverTrigger asChild>
                <Button size="sm" variant={preset === 'custom' ? 'default' : 'outline'} className="h-8 text-xs">
                  <CalendarIcon className="h-3 w-3 mr-1.5" />Custom: {rangeLabel}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0 bg-popover" align="end">
                <Calendar mode="range" selected={{ from: range.from, to: range.to }}
                  onSelect={(r) => {
                    if (r?.from && r?.to) { setPreset('custom'); setRange({ from: r.from, to: r.to }); }
                  }}
                  numberOfMonths={2} className="pointer-events-auto" />
              </PopoverContent>
            </Popover>
          </div>

          {/* Filter bar */}
          <div className="flex items-center gap-2 flex-wrap border-t pt-3">
            <div className="flex items-center gap-1 text-xs text-muted-foreground mr-1">
              <Filter className="h-3 w-3" />Filters
            </div>
            <MultiSelectFilter label="Employee" options={employeeOptions} selected={filters.employees} onChange={v => setFilters(f => ({ ...f, employees: v }))} />
            <MultiSelectFilter label="Department" options={departmentOptions} selected={filters.departments} onChange={v => setFilters(f => ({ ...f, departments: v }))} />
            <MultiSelectFilter label="Trip" options={tripOptions} selected={filters.trips} onChange={v => setFilters(f => ({ ...f, trips: v }))} />
            <MultiSelectFilter label="Category" options={categoryOptions} selected={filters.categories} onChange={v => setFilters(f => ({ ...f, categories: v }))} />
            <MultiSelectFilter label="Payment" options={paymentOptions} selected={filters.paymentMethods} onChange={v => setFilters(f => ({ ...f, paymentMethods: v }))} />
            <MultiSelectFilter label="Source" options={sourceOptions} selected={filters.sources} onChange={v => setFilters(f => ({ ...f, sources: v }))} />
            <MultiSelectFilter label="Currency" options={currencyOptions} selected={filters.currencies} onChange={v => setFilters(f => ({ ...f, currencies: v }))} />
            <MultiSelectFilter label="Status" options={statusOptions} selected={filters.statuses} onChange={v => setFilters(f => ({ ...f, statuses: v }))} />
            <Input type="number" placeholder="Min" value={filters.minAmount} onChange={e => setFilters(f => ({ ...f, minAmount: e.target.value }))} className="h-9 w-20 text-xs" />
            <Input type="number" placeholder="Max" value={filters.maxAmount} onChange={e => setFilters(f => ({ ...f, maxAmount: e.target.value }))} className="h-9 w-20 text-xs" />
            <div className="flex items-center gap-1.5 ml-1">
              <Switch id="flag" checked={filters.flaggedOnly} onCheckedChange={v => setFilters(f => ({ ...f, flaggedOnly: v }))} />
              <Label htmlFor="flag" className="text-xs cursor-pointer">Flagged</Label>
            </div>
            <div className="flex items-center gap-1.5">
              <Switch id="rec" checked={filters.missingReceipt} onCheckedChange={v => setFilters(f => ({ ...f, missingReceipt: v }))} />
              <Label htmlFor="rec" className="text-xs cursor-pointer">No receipt</Label>
            </div>
            {activeChips.length > 0 && (
              <Button variant="ghost" size="sm" className="h-8 text-xs ml-auto" onClick={() => setFilters(emptyFilters)}>Clear all</Button>
            )}
          </div>

          {activeChips.length > 0 && (
            <div className="flex items-center gap-1.5 flex-wrap pt-1">
              {activeChips.map((c, i) => (
                <Badge key={i} variant="secondary" className="gap-1 pr-1 text-[10px]">
                  {c.label}
                  <button onClick={c.clear} className="hover:bg-muted rounded-sm p-0.5"><X className="h-3 w-3" /></button>
                </Badge>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {loading ? (
        <div className="text-center py-16 text-muted-foreground">Loading reports…</div>
      ) : filtered.length === 0 ? (
        <Card><CardContent className="py-16 text-center">
          <BarChart3 className="h-12 w-12 text-muted-foreground mx-auto mb-3" />
          <p className="text-muted-foreground">No expenses match the current filters.</p>
        </CardContent></Card>
      ) : (
        <>
          {/* KPI strip */}
          <div className="grid grid-cols-2 md:grid-cols-3 lg:grid-cols-6 gap-3">
            <KpiCard title="Total Spend" value={fmt(kpis.total, baseCurrency)} delta={kpis.totalDelta} invertDelta />
            <KpiCard title="Expenses" value={kpis.count.toString()} delta={kpis.countDelta} invertDelta />
            <KpiCard title="Avg / Expense" value={fmt(kpis.avg, baseCurrency)} delta={kpis.avgDelta} invertDelta />
            <KpiCard title="Outstanding" value={fmt(kpis.outstanding, baseCurrency)} delta={null} />
            <KpiCard title="Policy-Flagged" value={`${kpis.flaggedPct.toFixed(1)}%`} delta={kpis.flaggedDelta} invertDelta />
            <KpiCard title="Approval Cycle" value={`${kpis.cycle.toFixed(1)}d`} delta={kpis.cycleDelta} invertDelta />
          </div>

          {/* Charts row 1: trend + category donut */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card className="lg:col-span-2">
              <CardHeader className="pb-2"><CardTitle className="text-base">Spend Trend</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <AreaChart data={trendData}>
                    <defs>
                      <linearGradient id="cur" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="hsl(var(--primary))" stopOpacity={0.4} />
                        <stop offset="95%" stopColor="hsl(var(--primary))" stopOpacity={0} />
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="label" tick={{ fontSize: 11 }} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RTooltip formatter={(v: number) => fmt(v, baseCurrency)} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Area type="monotone" dataKey="Previous" stroke="hsl(var(--muted-foreground))" fill="transparent" strokeDasharray="4 4" />
                    <Area type="monotone" dataKey="Current" stroke="hsl(var(--primary))" fill="url(#cur)" strokeWidth={2} />
                  </AreaChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Spend by Category</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={260}>
                  <PieChart>
                    <Pie data={categoryData} dataKey="total" nameKey="category" innerRadius={50} outerRadius={90}
                      onClick={(d: any) => openDrill(`Category: ${d.category}`, e => (e.category ?? 'Uncategorized') === d.category)}
                      style={{ cursor: 'pointer' }}>
                      {categoryData.map((_, i) => <Cell key={i} fill={CHART_COLORS[i % CHART_COLORS.length]} />)}
                    </Pie>
                    <RTooltip formatter={(v: number) => fmt(v, baseCurrency)} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }} />
                    <Legend wrapperStyle={{ fontSize: 11 }} />
                  </PieChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Charts row 2: top employees + status funnel + group */}
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Top Employees</CardTitle></CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={employeeData.slice(0, 10)} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={90} />
                    <RTooltip formatter={(v: number) => fmt(v, baseCurrency)} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }} />
                    <Bar dataKey="total" fill="hsl(var(--primary))" radius={[0, 4, 4, 0]}
                      onClick={(d: any) => openDrill(`Employee: ${d.name}`, e => e.employee_name === d.name)}
                      style={{ cursor: 'pointer' }} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Status Funnel</CardTitle></CardHeader>
              <CardContent className="space-y-2 pt-2">
                {(['pending', 'approved', 'paid', 'rejected'] as const).map((s, i) => {
                  const max = Math.max(...Object.values(statusData).map(x => x.count), 1);
                  const v = statusData[s];
                  const pct = (v.count / max) * 100;
                  const color = s === 'rejected' ? 'bg-destructive' : s === 'paid' ? 'bg-green-500' : s === 'approved' ? 'bg-primary' : 'bg-warning';
                  return (
                    <button key={s} className="w-full text-left group" onClick={() => openDrill(`Status: ${s}`, e => (e.status ?? 'pending') === s)}>
                      <div className="flex justify-between text-xs mb-1">
                        <span className="capitalize font-medium">{s}</span>
                        <span className="text-muted-foreground">{v.count} · {fmt(v.total, baseCurrency)}</span>
                      </div>
                      <div className="h-3 bg-muted rounded overflow-hidden">
                        <div className={cn('h-full transition-all group-hover:opacity-80', color)} style={{ width: `${pct}%` }} />
                      </div>
                    </button>
                  );
                })}
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">By Group</CardTitle>
                <Tabs value={grouping} onValueChange={(v) => setGrouping(v as any)}>
                  <TabsList className="h-7">
                    <TabsTrigger value="department" className="text-xs h-6 px-2">Dept</TabsTrigger>
                    <TabsTrigger value="team" className="text-xs h-6 px-2">Trip</TabsTrigger>
                    <TabsTrigger value="manager" className="text-xs h-6 px-2">Person</TabsTrigger>
                  </TabsList>
                </Tabs>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={280}>
                  <BarChart data={groupData}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis dataKey="name" tick={{ fontSize: 10 }} angle={-30} textAnchor="end" height={60} />
                    <YAxis tick={{ fontSize: 11 }} />
                    <RTooltip formatter={(v: number) => fmt(v, baseCurrency)} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }} />
                    <Bar dataKey="total" fill="#0f9f94" radius={[4, 4, 0, 0]} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          </div>

          {/* Budget vs Actual */}
          {budgetData.length > 0 && (
            <Card>
              <CardHeader className="pb-2 flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-base">Budget vs Actual</CardTitle>
                <div className="text-xs text-muted-foreground">
                  Total budget {fmt(totalBudget, baseCurrency)} · Spent {fmt(totalSpent, baseCurrency)} ·
                  <span className={cn('ml-1 font-semibold', totalSpent > totalBudget ? 'text-destructive' : 'text-green-600')}>
                    {totalBudget > 0 ? `${((totalSpent / totalBudget) * 100).toFixed(0)}% used` : '—'}
                  </span>
                </div>
              </CardHeader>
              <CardContent>
                <ResponsiveContainer width="100%" height={Math.max(220, budgetData.length * 36)}>
                  <BarChart data={budgetData} layout="vertical" margin={{ left: 8 }}>
                    <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                    <XAxis type="number" tick={{ fontSize: 11 }} />
                    <YAxis type="category" dataKey="name" tick={{ fontSize: 11 }} width={120} />
                    <RTooltip formatter={(v: number) => fmt(v, baseCurrency)} contentStyle={{ background: 'hsl(var(--popover))', border: '1px solid hsl(var(--border))' }} />
                    <Legend wrapperStyle={{ fontSize: 12 }} />
                    <Bar dataKey="budget" fill="hsl(var(--muted-foreground))" name="Budget" radius={[0, 4, 4, 0]} />
                    <Bar dataKey="spent" fill="hsl(var(--primary))" name="Spent" radius={[0, 4, 4, 0]}
                      onClick={(d: any) => openDrill(`Trip: ${d.name}`, e => e.trip_id === d.id)} style={{ cursor: 'pointer' }} />
                  </BarChart>
                </ResponsiveContainer>
              </CardContent>
            </Card>
          )}

          {/* Tables */}
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Spend by Employee</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Employee</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Total ({baseCurrency})</TableHead>
                    <TableHead className="text-right">% of Total</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {employeeData.map(e => (
                      <TableRow key={e.name} className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openDrill(`Employee: ${e.name}`, ex => ex.employee_name === e.name)}>
                        <TableCell className="font-medium">{e.name}</TableCell>
                        <TableCell className="text-right">{e.count}</TableCell>
                        <TableCell className="text-right">{fmt(e.total, baseCurrency)}</TableCell>
                        <TableCell className="text-right">{totalSpend > 0 ? ((e.total / totalSpend) * 100).toFixed(1) : 0}%</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
            <Card>
              <CardHeader className="pb-2"><CardTitle className="text-base">Spend by Category</CardTitle></CardHeader>
              <CardContent className="p-0">
                <Table>
                  <TableHeader><TableRow>
                    <TableHead>Category</TableHead>
                    <TableHead className="text-right">Count</TableHead>
                    <TableHead className="text-right">Total</TableHead>
                    <TableHead className="text-right">vs Prev</TableHead>
                  </TableRow></TableHeader>
                  <TableBody>
                    {categoryData.map(c => (
                      <TableRow key={c.category} className="cursor-pointer hover:bg-muted/50"
                        onClick={() => openDrill(`Category: ${c.category}`, e => (e.category ?? 'Uncategorized') === c.category)}>
                        <TableCell className="font-medium">{c.category}</TableCell>
                        <TableCell className="text-right">{c.count}</TableCell>
                        <TableCell className="text-right">{fmt(c.total, baseCurrency)}</TableCell>
                        <TableCell className="text-right">
                          {c.change !== null ? (
                            <span className={cn('text-xs font-medium inline-flex items-center gap-0.5', c.change > 0 ? 'text-destructive' : 'text-green-600')}>
                              {c.change > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
                              {Math.abs(c.change).toFixed(1)}%
                            </span>
                          ) : <span className="text-xs text-muted-foreground">New</span>}
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          </div>
        </>
      )}

      {/* Drill-through */}
      <Sheet open={drillTitle !== null} onOpenChange={(o) => !o && setDrillTitle(null)}>
        <SheetContent className="w-full sm:max-w-2xl overflow-y-auto">
          <SheetHeader>
            <SheetTitle>{drillTitle}</SheetTitle>
            <SheetDescription>
              {drillRows.length} expense{drillRows.length === 1 ? '' : 's'} · {fmt(spendable(drillRows).reduce((s, e) => s + (e.base_amount ?? 0), 0), baseCurrency)}
            </SheetDescription>
          </SheetHeader>
          <div className="mt-4">
            <Button size="sm" variant="outline" onClick={() => navigate('/expenses')}>
              <ArrowUpRight className="h-3 w-3 mr-1.5" />Open in Expenses
            </Button>
          </div>
          <div className="mt-4 border rounded-md">
            <Table>
              <TableHeader><TableRow>
                <TableHead>Date</TableHead><TableHead>Vendor</TableHead><TableHead>Employee</TableHead>
                <TableHead>Status</TableHead><TableHead className="text-right">Amount</TableHead>
              </TableRow></TableHeader>
              <TableBody>
                {drillRows.map(e => (
                  <TableRow key={e.id}>
                    <TableCell className="text-xs">{e.date}</TableCell>
                    <TableCell className="text-xs">{e.vendor ?? '—'}</TableCell>
                    <TableCell className="text-xs">{e.employee_name ?? '—'}</TableCell>
                    <TableCell><Badge variant="outline" className="text-[10px] capitalize">{e.status ?? 'pending'}</Badge></TableCell>
                    <TableCell className="text-right text-xs font-medium">{fmt(e.base_amount ?? 0, baseCurrency)}</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </SheetContent>
      </Sheet>
    </div>
  );
};

// === KPI Card ===
const KpiCard: React.FC<{ title: string; value: string; delta: number | null; invertDelta?: boolean }> = ({ title, value, delta, invertDelta }) => {
  const isGood = delta === null ? null : invertDelta ? delta < 0 : delta > 0;
  return (
    <Card>
      <CardContent className="p-3">
        <div className="text-[10px] text-muted-foreground uppercase tracking-wide font-medium">{title}</div>
        <div className="text-xl font-bold mt-1 truncate">{value}</div>
        {delta !== null && Number.isFinite(delta) ? (
          <div className={cn('text-[10px] mt-1 inline-flex items-center gap-0.5 font-medium',
            isGood === null ? 'text-muted-foreground' : isGood ? 'text-green-600' : 'text-destructive')}>
            {delta > 0 ? <TrendingUp className="h-3 w-3" /> : <TrendingDown className="h-3 w-3" />}
            {Math.abs(delta).toFixed(1)}% vs prev
          </div>
        ) : <div className="text-[10px] mt-1 text-muted-foreground">—</div>}
      </CardContent>
    </Card>
  );
};

export default Reports;
