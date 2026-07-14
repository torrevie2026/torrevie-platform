import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { apiRequest } from '@/lib/api';
import { useAuth } from '@/contexts/AuthContext';
import { useOffline } from '@/contexts/OfflineContext';
import { addToOfflineQueue } from '@/lib/offlineQueue';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { Badge } from '@/components/ui/badge';
import { toast } from 'sonner';
import { format } from 'date-fns';
import { CalendarIcon, Lock, AlertTriangle, Loader2, WifiOff, Save } from 'lucide-react';
import { cn } from '@/lib/utils';
import ReceiptUpload from '@/components/ReceiptUpload';
import DuplicateWarning from '@/components/expenses/DuplicateWarning';
import type { DuplicateMatch } from '@/lib/duplicateDetection';
import { describeDateWarning, MAX_PAST_DAYS, MAX_FUTURE_DAYS, type DateWarning } from '@/lib/dateSanity';

interface CountryConfig {
  base_currency: string;
  currency_name: string;
  currency_symbol: string;
  has_vat: boolean | null;
  tax_name: string | null;
  tax_id_label: string | null;
  vat_rate: number;
}

interface CurrencyPeg {
  from_currency: string;
  to_currency: string;
  rate: number;
}

interface Trip {
  id: string;
  name: string;
  enforce_currency: boolean | null;
  enforced_currency: string | null;
  team_id: string | null;
}

interface Employee {
  id: string;
  name: string;
  phone_number: string;
}

interface SpendPolicy {
  category: string;
  daily_limit: number | null;
  monthly_limit: number | null;
  requires_notes_above: number | null;
  is_blocked: boolean | null;
}

interface ParsedReceipt {
  vendor?: string | null;
  date?: string | null;
  amount?: number | string | null;
  currency?: string | null;
  category?: string | null;
  payment_method?: string | null;
  notes?: string | null;
  tax_id_number?: string | null;
  tax_amount?: number | string | null;
  confidence?: number | null;
  date_warning?: DateWarning | null;
}

// Categories are loaded per-tenant via useExpenseCategoryNames(selectedCompanyId)
const PAYMENT_METHODS = ['Corporate Card', 'Personal Card', 'Cash', 'Bank Transfer'];

const ALL_CURRENCIES = [
  'AED', 'SAR', 'BHD', 'OMR', 'KWD', 'QAR', 'EGP', 'JOD',
  'ZAR', 'KES', 'NGN', 'MAD', 'GBP', 'EUR', 'USD', 'INR',
  'PKR', 'TRY', 'SGD', 'AUD', 'CAD', 'CHF', 'CNY', 'JPY',
];

const fileToDataUrl = (file: File) => new Promise<string>((resolve, reject) => {
  const reader = new FileReader();
  reader.onload = () => resolve(String(reader.result || ''));
  reader.onerror = () => reject(reader.error || new Error('Could not read receipt file'));
  reader.readAsDataURL(file);
});

const NewExpense = () => {
  const { user, profile, selectedCompanyId, companies } = useAuth();
  const { isOnline, refreshPendingCount } = useOffline();
  const navigate = useNavigate();
  const [categories, setCategories] = useState<string[]>([]);

  // Offline receipt capture
  const [offlineReceiptBase64, setOfflineReceiptBase64] = useState<string | null>(null);
  const [offlineReceiptFilename, setOfflineReceiptFilename] = useState<string | null>(null);

  // Company config
  const [companyConfig, setCompanyConfig] = useState<{ country_code: string; base_currency: string } | null>(null);
  const [countryConfig, setCountryConfig] = useState<CountryConfig | null>(null);
  const [pegs, setPegs] = useState<CurrencyPeg[]>([]);
  const [trips, setTrips] = useState<Trip[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [policies, setPolicies] = useState<SpendPolicy[]>([]);

  // Form state
  const [receiptUrl, setReceiptUrl] = useState<string>('');
  const [vendor, setVendor] = useState('');
  const [date, setDate] = useState<Date>(new Date());
  const [amount, setAmount] = useState('');
  const [currency, setCurrency] = useState('');
  const [category, setCategory] = useState('');
  const [paymentMethod, setPaymentMethod] = useState('');
  const [tripId, setTripId] = useState('none');
  const [enforcedCurrencyInfo, setEnforcedCurrencyInfo] = useState<string | null>(null);
  const [employeeTeamName, setEmployeeTeamName] = useState<string | null>(null);
  const [employeeId, setEmployeeId] = useState('myself');
  const [notes, setNotes] = useState('');
  const [taxIdNumber, setTaxIdNumber] = useState('');
  const [taxAmount, setTaxAmount] = useState('');

  // AI parsing state
  const [parsing, setParsing] = useState(false);
  const [autoFilledFields, setAutoFilledFields] = useState<Set<string>>(new Set());
  const [confidence, setConfidence] = useState<number | null>(null);
  const [parseWarning, setParseWarning] = useState<string | null>(null);
  const [dateWarning, setDateWarning] = useState<DateWarning | null>(null);

  // Validation
  const [errors, setErrors] = useState<Record<string, string>>({});
  const [rateWarning, setRateWarning] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [duplicateMatch, setDuplicateMatch] = useState<DuplicateMatch | null>(null);

  const companyId = selectedCompanyId;

  useEffect(() => {
    if (!companyId) return;
    const loadData = async () => {
      try {
        const selectedCompany = companies?.find((company) => company.id === companyId);
        const data = await apiRequest<{
          company: { country_code: string; base_currency: string } | null;
          countryConfig: CountryConfig | null;
          pegs: CurrencyPeg[];
          trips: Trip[];
          employees: Employee[];
          policies: SpendPolicy[];
          categories: Array<{ name: string }>;
        }>(`/api/tex/expenses/bootstrap?company_id=${encodeURIComponent(companyId)}`);
        const company = data.company || (selectedCompany ? { country_code: selectedCompany.country_code, base_currency: selectedCompany.base_currency } : null);
        if (company) {
          setCompanyConfig(company);
          setCurrency((current) => current || company.base_currency);
        }
        setCountryConfig(data.countryConfig);
        setPegs(data.pegs ?? []);
        setTrips(data.trips ?? []);
        setEmployees(data.employees ?? []);
        setPolicies(data.policies ?? []);
        setCategories((data.categories ?? []).map((item) => item.name));
      } catch (error) {
        toast.error((error as Error).message || 'Failed to load expense setup');
      }
    };
    loadData();
  }, [companyId, companies]);

  // Trip currency enforcement
  useEffect(() => {
    if (tripId === 'none') {
      setEnforcedCurrencyInfo(null);
      return;
    }
    const trip = trips.find(t => t.id === tripId);
    if (trip?.enforce_currency && trip.enforced_currency) {
      setCurrency(trip.enforced_currency);
      setEnforcedCurrencyInfo(trip.enforced_currency);
    } else {
      setEnforcedCurrencyInfo(null);
    }
  }, [tripId, trips]);

  // Employee team detection
  useEffect(() => {
    if (employeeId === 'myself' || !companyId) {
      setEmployeeTeamName(null);
      return;
    }
    const detectTeam = async () => {
      const data = await apiRequest<{ team: { name: string } | null }>(
        `/api/tex/expenses/employee-team?company_id=${encodeURIComponent(companyId)}&employee_id=${encodeURIComponent(employeeId)}`,
      );
      setEmployeeTeamName(data.team?.name ?? null);
    };
    detectTeam().catch(() => setEmployeeTeamName(null));
  }, [employeeId, companyId]);

  // Live duplicate detection - debounced
  useEffect(() => {
    if (!companyId || !vendor.trim() || !amount || !currency || !date) {
      setDuplicateMatch(null);
      return;
    }
    const amt = parseFloat(amount);
    if (!amt || isNaN(amt)) {
      setDuplicateMatch(null);
      return;
    }
    const selectedEmployee = employeeId !== 'myself' ? employees.find(e => e.id === employeeId) : null;
    const handle = setTimeout(async () => {
      try {
        const params = new URLSearchParams({
          company_id: companyId,
          vendor: vendor.trim(),
          amount: String(amt),
          currency,
          date: format(date, 'yyyy-MM-dd'),
        });
        if (selectedEmployee?.id) params.set('employee_id', selectedEmployee.id);
        else if (selectedEmployee?.name || profile?.full_name) params.set('employee_name', selectedEmployee?.name || profile?.full_name || '');
        const data = await apiRequest<{ match: DuplicateMatch | null }>(`/api/tex/expenses/duplicate?${params.toString()}`);
        setDuplicateMatch(data.match);
      } catch {
        setDuplicateMatch(null);
      }
    }, 400);
    return () => clearTimeout(handle);
  }, [companyId, vendor, amount, currency, date, employeeId, employees, profile?.full_name]);

  const handleFileReady = async (file: File) => {
    setConfidence(null);
    setAutoFilledFields(new Set());
    setDateWarning(null);
    setParseWarning(null);

    const dataUrl = await fileToDataUrl(file);
    const base64 = dataUrl.split(',')[1] || '';
    setOfflineReceiptBase64(base64);
    setOfflineReceiptFilename(file.name);

    if (!file.type.startsWith('image/')) {
      setParsing(false);
      setParseWarning('Receipt uploaded. OCR currently supports image receipts only, so please fill in the fields manually.');
      return;
    }
    if (!companyId) return;

    setParsing(true);
    try {
      const parsed = await apiRequest<ParsedReceipt>('/api/tex/receipts/parse', {
        method: 'POST',
        body: JSON.stringify({
          company_id: companyId,
          image_base64: base64,
          content_type: file.type,
        }),
      });
      const filled = new Set<string>();
      if (parsed.vendor) { setVendor(String(parsed.vendor)); filled.add('vendor'); }
      if (parsed.date) {
        const parsedDate = new Date(`${parsed.date}T00:00:00`);
        if (!Number.isNaN(parsedDate.getTime())) {
          setDate(parsedDate);
          filled.add('date');
        }
      }
      if (parsed.amount != null && parsed.amount !== '') { setAmount(String(parsed.amount)); filled.add('amount'); }
      if (parsed.currency) { setCurrency(String(parsed.currency).toUpperCase()); filled.add('currency'); }
      if (parsed.category && categories.includes(String(parsed.category))) { setCategory(String(parsed.category)); filled.add('category'); }
      if (parsed.payment_method && PAYMENT_METHODS.includes(String(parsed.payment_method))) { setPaymentMethod(String(parsed.payment_method)); filled.add('payment_method'); }
      if (parsed.notes) { setNotes(String(parsed.notes)); filled.add('notes'); }
      if (parsed.tax_id_number) { setTaxIdNumber(String(parsed.tax_id_number)); filled.add('tax_id_number'); }
      if (parsed.tax_amount != null && parsed.tax_amount !== '') { setTaxAmount(String(parsed.tax_amount)); filled.add('tax_amount'); }
      setAutoFilledFields(filled);
      setConfidence(typeof parsed.confidence === 'number' ? parsed.confidence : null);
      setDateWarning(parsed.date_warning ?? null);
      if (parsed.date_warning) setParseWarning(describeDateWarning(parsed.date_warning));
      else if (filled.size > 0) toast.success('Receipt details extracted');
      else setParseWarning('Receipt uploaded, but no fields could be read automatically. Please fill in the fields manually.');
    } catch (error) {
      setParseWarning((error as Error).message || 'Receipt uploaded. OCR could not read it automatically.');
    } finally {
      setParsing(false);
    }
  };

  const isPegged = (cur: string) => pegs.some(p => p.from_currency === cur);

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!vendor.trim()) errs.vendor = 'Vendor is required';
    if (!date) errs.date = 'Date is required';
    if (!amount || parseFloat(amount) <= 0) errs.amount = 'Amount must be greater than 0';
    if (!currency) errs.currency = 'Currency is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const getExchangeRate = async (): Promise<{ rate: number; baseAmount: number; warning: string | null }> => {
    const amt = parseFloat(amount);
    const baseCur = companyConfig?.base_currency || 'AED';
    if (currency === baseCur) return { rate: 1, baseAmount: amt, warning: null };
    const fromPeg = pegs.find(p => p.from_currency === currency);
    const toPeg = pegs.find(p => p.from_currency === baseCur);
    if (fromPeg && toPeg) {
      const amountInUsd = amt * fromPeg.rate;
      const rate = fromPeg.rate / toPeg.rate;
      return { rate, baseAmount: amountInUsd / toPeg.rate, warning: null };
    }
    if (fromPeg && baseCur === 'USD') return { rate: fromPeg.rate, baseAmount: amt * fromPeg.rate, warning: null };
    return { rate: 1, baseAmount: amt, warning: null };
  };

  const checkPolicies = async (): Promise<{ blocked: boolean; flagged: boolean; reason: string | null }> => {
    if (!category) return { blocked: false, flagged: false, reason: null };
    const policy = policies.find(p => p.category === category);
    if (!policy) return { blocked: false, flagged: false, reason: null };
    if (policy.is_blocked) return { blocked: true, flagged: false, reason: 'This category is not permitted by your company policy' };
    if (policy.requires_notes_above != null && parseFloat(amount) > policy.requires_notes_above && !notes.trim()) {
      return { blocked: true, flagged: false, reason: `Notes are required for expenses over ${policy.requires_notes_above} in this category` };
    }
    return { blocked: false, flagged: false, reason: null };
  };

  const buildExpenseData = (status: string) => {
    const selectedEmployee = employeeId !== 'myself' ? employees.find(e => e.id === employeeId) : null;
    const selectedTrip = tripId !== 'none' ? trips.find(t => t.id === tripId) : null;
    return {
      company_id: companyId!,
      vendor: vendor.trim(),
      date: format(date, 'yyyy-MM-dd'),
      amount: parseFloat(amount),
      currency,
      category: category || null,
      payment_method: paymentMethod || null,
      trip_id: selectedTrip?.id || null,
      trip_name: selectedTrip?.name || null,
      employee_id: selectedEmployee?.id || null,
      employee_name: selectedEmployee?.name || profile?.full_name || null,
      employee_phone: selectedEmployee?.phone_number || null,
      notes: notes.trim() || null,
      tax_id_number: taxIdNumber.trim() || null,
      tax_amount: taxAmount ? parseFloat(taxAmount) : null,
      receipt_image_url: receiptUrl || null,
      status,
      source: 'web',
      _country_code: companyConfig?.country_code || '',
    };
  };

  const saveToOfflineQueue = async (status: string) => {
    const expenseData = buildExpenseData(status);
    await addToOfflineQueue({
      expense_data: expenseData,
      receipt_image_base64: offlineReceiptBase64,
      receipt_filename: offlineReceiptFilename,
      created_at: new Date().toISOString(),
      sync_status: 'pending',
      retry_count: 0,
      is_draft: status === 'draft',
    });
    await refreshPendingCount();
    toast.info('You are offline. Expense saved locally and will sync automatically when you reconnect.');
    navigate('/expenses');
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validate() || !companyId || !user) return;

    const today = new Date();
    const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
    const pickedUtc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const diffDays = Math.round((todayUtc.getTime() - pickedUtc.getTime()) / 86_400_000);
    if (diffDays > MAX_PAST_DAYS || diffDays < -MAX_FUTURE_DAYS) {
      const human = format(date, 'PPP');
      const msg = diffDays < 0
        ? `This expense is dated ${human} (in the future). Submit anyway?`
        : `This expense is dated ${human} (${diffDays} days ago). Submit anyway?`;
      if (!window.confirm(msg)) return;
    }

    setSaving(true);

    if (!navigator.onLine) {
      await saveToOfflineQueue('pending');
      setSaving(false);
      return;
    }

    const localPolicy = await checkPolicies();
    if (localPolicy.blocked) {
      toast.error(localPolicy.reason);
      setSaving(false);
      return;
    }

    const { _country_code, ...expenseData } = buildExpenseData('pending');
    try {
      const data = await apiRequest<{ duplicate: DuplicateMatch | null }>('/api/tex/expenses', {
        method: 'POST',
        body: JSON.stringify(expenseData),
      });
      toast.success(data.duplicate ? 'Expense saved - flagged as possible duplicate' : 'Expense saved');
      navigate('/expenses');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save expense');
      setSaving(false);
    }
  };

  const handleSaveDraft = async () => {
    if (!companyId || !user) return;
    setSaving(true);

    if (!navigator.onLine) {
      await saveToOfflineQueue('draft');
      setSaving(false);
      return;
    }

    const { _country_code, ...expenseData } = buildExpenseData('draft');
    try {
      await apiRequest('/api/tex/expenses', {
        method: 'POST',
        body: JSON.stringify({ ...expenseData, status: 'draft' }),
      });
      toast.success('Draft saved');
      navigate('/expenses');
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save draft');
      setSaving(false);
    }
  };

  const hasVat = countryConfig?.has_vat !== false;
  const taxLabel = countryConfig?.tax_name || 'VAT';
  const taxIdLabel = countryConfig?.tax_id_label || 'Tax ID';

  const confidenceColor = confidence !== null
    ? confidence >= 80 ? 'bg-success text-success-foreground'
    : confidence >= 50 ? 'bg-warning text-warning-foreground'
    : 'bg-destructive text-destructive-foreground'
    : '';

  // Helper: wrap field in teal left border if auto-filled
  const fieldClass = (fieldName: string) =>
    autoFilledFields.has(fieldName) ? 'border-l-4 border-l-primary pl-3 rounded-md' : '';

  return (
    <div className="max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold text-foreground mb-6">New Expense</h1>

      <form onSubmit={handleSubmit} className="space-y-6">
        {/* Offline notice */}
        {!isOnline && (
          <div className="flex items-center gap-2 text-sm bg-blue-500/10 border border-blue-500/20 text-blue-700 dark:text-blue-300 p-3 rounded-lg">
            <WifiOff className="h-4 w-4 shrink-0" />
            <span>You are offline. Expenses will be saved locally and synced when you reconnect.</span>
          </div>
        )}

        {/* Receipt Upload */}
        <div className="bg-card rounded-lg shadow-sm border p-5">
          <Label className="text-base font-semibold mb-3 block">Receipt</Label>
          {!isOnline && (
            <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 p-2 rounded-md mb-3">
              <WifiOff className="h-3.5 w-3.5 shrink-0" />
              Offline - AI parsing unavailable. Fill in fields manually. Your expense will be saved locally.
            </div>
          )}
          {companyId && (
            <ReceiptUpload
              companyId={companyId}
              onUploadComplete={setReceiptUrl}
              onFileReady={handleFileReady}
              uploadedUrl={receiptUrl || null}
            />
          )}
        </div>

        {/* Parsing indicator */}
        {parsing && (
          <div className="bg-card rounded-lg shadow-sm border p-5 flex items-center gap-3">
            <div className="h-8 w-8 rounded-full bg-primary/20 flex items-center justify-center animate-pulse">
              <Loader2 className="h-4 w-4 text-primary animate-spin" />
            </div>
            <div>
              <p className="text-sm font-medium text-primary">Reading receipt...</p>
              <p className="text-xs text-muted-foreground">AI is extracting expense data from your receipt</p>
            </div>
          </div>
        )}

        {/* Parse warning */}
        {parseWarning && (
          <div className="flex items-center gap-2 text-sm text-warning bg-warning/10 border border-warning/20 p-3 rounded-lg">
            <AlertTriangle className="h-4 w-4 flex-shrink-0" />
            {parseWarning}
          </div>
        )}

        {/* Confidence badge */}
        {confidence !== null && !parsing && (
          <div className="flex items-center gap-2">
            <span className="text-xs text-muted-foreground">AI Confidence:</span>
            <Badge className={cn('text-xs', confidenceColor)}>{confidence}%</Badge>
          </div>
        )}

        {/* Form fields */}
        <div className="bg-card rounded-lg shadow-sm border p-5 space-y-4">
          {/* Vendor */}
          <div className={fieldClass('vendor')}>
            <Label htmlFor="vendor">Vendor / Merchant *</Label>
            <Input
              id="vendor"
              placeholder="e.g. Careem, Marriott, ADNOC"
              value={vendor}
              onChange={e => { setVendor(e.target.value); setErrors(prev => ({ ...prev, vendor: '' })); }}
              className={cn('rounded-md', errors.vendor && 'border-destructive')}
            />
            {errors.vendor && <p className="text-xs text-destructive mt-1">{errors.vendor}</p>}
          </div>

          {/* Date */}
          <div className={fieldClass('date')}>
            <Label>Date *</Label>
            <Popover>
              <PopoverTrigger asChild>
                <Button
                  variant="outline"
                  className={cn(
                    'w-full justify-start text-left font-normal rounded-md',
                    !date && 'text-muted-foreground',
                    errors.date && 'border-destructive'
                  )}
                >
                  <CalendarIcon className="mr-2 h-4 w-4" />
                  {date ? format(date, 'PPP') : 'Pick a date'}
                </Button>
              </PopoverTrigger>
              <PopoverContent className="w-auto p-0" align="start">
                <Calendar mode="single" selected={date} onSelect={(d) => { if (d) { setDate(d); setDateWarning(null); } }} initialFocus />
              </PopoverContent>
            </Popover>
            {errors.date && <p className="text-xs text-destructive mt-1">{errors.date}</p>}
            {dateWarning && !errors.date && (
              <p className="text-xs text-amber-600 mt-1 flex items-start gap-1">
                <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
                <span>{describeDateWarning(dateWarning)}</span>
              </p>
            )}
          </div>

          {/* Amount + Currency row */}
          <div className="grid grid-cols-2 gap-3">
            <div className={fieldClass('amount')}>
              <Label htmlFor="amount">Amount *</Label>
              <Input
                id="amount"
                type="number"
                step="0.01"
                min="0.01"
                placeholder="0.00"
                value={amount}
                onChange={e => { setAmount(e.target.value); setErrors(prev => ({ ...prev, amount: '' })); }}
                className={cn('rounded-md', errors.amount && 'border-destructive')}
              />
              {errors.amount && <p className="text-xs text-destructive mt-1">{errors.amount}</p>}
            </div>
            <div className={fieldClass('currency')}>
              <Label>Currency {enforcedCurrencyInfo && <Lock className="inline h-3 w-3 text-blue-600 ml-1" />}</Label>
              {enforcedCurrencyInfo ? (
                <Input value={enforcedCurrencyInfo} disabled className="rounded-md bg-muted" />
              ) : (
                <Select value={currency} onValueChange={setCurrency}>
                  <SelectTrigger className={cn('rounded-md', errors.currency && 'border-destructive')}>
                    <SelectValue placeholder="Currency" />
                  </SelectTrigger>
                  <SelectContent>
                    {ALL_CURRENCIES.map(cur => (
                      <SelectItem key={cur} value={cur}>
                        <span className="flex items-center gap-2">
                          {cur}
                          {isPegged(cur) && <Lock className="h-3 w-3 text-muted-foreground" />}
                        </span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              )}
            </div>
          </div>

          {enforcedCurrencyInfo && (
            <div className="flex items-center gap-2 text-xs text-blue-700 dark:text-blue-300 bg-blue-50 dark:bg-blue-950/30 border border-blue-200 dark:border-blue-800 p-2 rounded-md">
              <Lock className="h-3.5 w-3.5 shrink-0" />
              This trip requires all expenses in {enforcedCurrencyInfo}. Your receipt currency has been set automatically.
            </div>
          )}

          {rateWarning && (
            <div className="flex items-center gap-2 text-xs text-warning bg-warning/10 p-2 rounded-md">
              <AlertTriangle className="h-3.5 w-3.5 flex-shrink-0" />
              {rateWarning}
            </div>
          )}

          {/* Category */}
          <div className={fieldClass('category')}>
            <Label>Category</Label>
            <Select value={category} onValueChange={setCategory}>
              <SelectTrigger className="rounded-md"><SelectValue placeholder="Select category" /></SelectTrigger>
              <SelectContent>
                {categories.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Payment Method */}
          <div className={fieldClass('paymentMethod')}>
            <Label>Payment Method</Label>
            <Select value={paymentMethod} onValueChange={setPaymentMethod}>
              <SelectTrigger className="rounded-md"><SelectValue placeholder="Select method" /></SelectTrigger>
              <SelectContent>
                {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Trip */}
          <div>
            <Label>Trip</Label>
            <Select value={tripId} onValueChange={setTripId}>
              <SelectTrigger className="rounded-md"><SelectValue placeholder="Select trip" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="none">No trip / ad-hoc</SelectItem>
                {trips.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
              </SelectContent>
            </Select>
          </div>

          {/* Employee */}
          <div>
            <Label>Employee</Label>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger className="rounded-md"><SelectValue placeholder="Select employee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value="myself">Myself</SelectItem>
                {employees.map(e => <SelectItem key={e.id} value={e.id}>{e.name}</SelectItem>)}
              </SelectContent>
            </Select>
            {employeeTeamName && (
              <Badge variant="outline" className="mt-1 text-[10px] text-muted-foreground">Team: {employeeTeamName}</Badge>
            )}
          </div>

          {/* Notes */}
          <div className={fieldClass('notes')}>
            <Label htmlFor="notes">Notes</Label>
            <Textarea
              id="notes"
              placeholder="Optional notes about this expense"
              value={notes}
              onChange={e => setNotes(e.target.value)}
              className="rounded-md"
              rows={2}
            />
          </div>

          {/* Tax fields */}
          {hasVat && (
            <div className="grid grid-cols-2 gap-3">
              <div className={fieldClass('taxIdNumber')}>
                <Label htmlFor="taxIdNumber">{taxIdLabel}</Label>
                <Input
                  id="taxIdNumber"
                  placeholder={`e.g. 100${'\u00A0'}000${'\u00A0'}000${'\u00A0'}000${'\u00A0'}003`}
                  value={taxIdNumber}
                  onChange={e => setTaxIdNumber(e.target.value)}
                  className="rounded-md"
                />
              </div>
              <div className={fieldClass('taxAmount')}>
                <Label htmlFor="taxAmount">{taxLabel} Amount</Label>
                <Input
                  id="taxAmount"
                  type="number"
                  step="0.01"
                  min="0"
                  placeholder="0.00"
                  value={taxAmount}
                  onChange={e => setTaxAmount(e.target.value)}
                  className="rounded-md"
                />
              </div>
            </div>
          )}
        </div>

        {/* Duplicate warning */}
        <DuplicateWarning match={duplicateMatch} />

        {/* Submit */}
        <div className="flex gap-3">
          <Button type="button" variant="outline" className="rounded-md" onClick={() => navigate('/expenses')}>
            Cancel
          </Button>
          <Button type="button" variant="secondary" className="rounded-md" onClick={handleSaveDraft} disabled={saving || parsing}>
            <Save className="h-4 w-4 mr-1.5" />Draft
          </Button>
          <Button type="submit" className="flex-1 rounded-md" disabled={saving || parsing}>
            {saving ? 'Saving...' : !isOnline ? 'Save Offline' : 'Save Expense'}
          </Button>
        </div>
      </form>
    </div>
  );
};

export default NewExpense;
