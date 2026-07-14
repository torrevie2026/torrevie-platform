import React, { useState } from 'react';
import { format } from 'date-fns';
import { apiRequest } from '@/lib/api';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { Calendar } from '@/components/ui/calendar';
import { CalendarIcon, AlertTriangle, Loader2 } from 'lucide-react';
import { cn } from '@/lib/utils';
import { toast } from 'sonner';
import { parseAndValidateReceiptDate, describeDateWarning, MAX_PAST_DAYS, MAX_FUTURE_DAYS } from '@/lib/dateSanity';
import { useExpenseCategoryNames } from '@/hooks/useExpenseCategories';

const PAYMENT_METHODS = ['Corporate Card', 'Personal Card', 'Cash', 'Bank Transfer'];
const ALL_CURRENCIES = [
  'AED', 'SAR', 'BHD', 'OMR', 'KWD', 'QAR', 'EGP', 'JOD',
  'ZAR', 'KES', 'NGN', 'MAD', 'GBP', 'EUR', 'USD', 'INR',
  'PKR', 'TRY', 'SGD', 'AUD', 'CAD', 'CHF', 'CNY', 'JPY',
];

export interface EditableExpense {
  id: string;
  company_id: string;
  vendor: string | null;
  date: string;
  amount: number;
  currency: string;
  category: string | null;
  payment_method: string | null;
  trip_id: string | null;
  trip_name: string | null;
  notes: string | null;
  tax_id_number: string | null;
  tax_amount: number | null;
  policy_flag: boolean | null;
  policy_flag_reason: string | null;
  employee_id: string | null;
  employee_name: string | null;
  employee_phone?: string | null;
}

interface Props {
  expense: EditableExpense;
  trips: { id: string; name: string }[];
  employees?: { id: string; name: string; phone_number?: string | null }[];
  canChangeEmployee?: boolean;
  baseCurrency: string;
  userId: string | undefined;
  onSaved: () => void;
  onCancel: () => void;
}

const parseExpenseDate = (value: string) => {
  const yyyyMmDd = String(value || '').slice(0, 10);
  const parsed = new Date(`${yyyyMmDd}T00:00:00`);
  return Number.isNaN(parsed.getTime()) ? new Date() : parsed;
};

const KEEP_CURRENT_EMPLOYEE = '__current__';

const EditExpenseForm: React.FC<Props> = ({
  expense,
  trips,
  employees = [],
  canChangeEmployee = false,
  baseCurrency: _baseCurrency,
  userId: _userId,
  onSaved,
  onCancel,
}) => {
  const { names: CATEGORIES } = useExpenseCategoryNames(expense.company_id);
  const [vendor, setVendor] = useState(expense.vendor ?? '');
  const [date, setDate] = useState<Date>(() => parseExpenseDate(expense.date));
  const [amount, setAmount] = useState(String(expense.amount));
  const [currency, setCurrency] = useState(expense.currency);
  const [category, setCategory] = useState(expense.category ?? '__none__');
  const [paymentMethod, setPaymentMethod] = useState(expense.payment_method ?? '__none__');
  const [tripId, setTripId] = useState(expense.trip_id ?? '__none__');
  const [employeeId, setEmployeeId] = useState(expense.employee_id ?? KEEP_CURRENT_EMPLOYEE);
  const [notes, setNotes] = useState(expense.notes ?? '');
  const [taxIdNumber, setTaxIdNumber] = useState(expense.tax_id_number ?? '');
  const [taxAmount, setTaxAmount] = useState(expense.tax_amount != null ? String(expense.tax_amount) : '');

  const [saving, setSaving] = useState(false);
  const [errors, setErrors] = useState<Record<string, string>>({});

  // Date sanity warning derived from the picked date
  const dateWarning = (() => {
    const yyyy = format(date, 'yyyy-MM-dd');
    const { warning } = parseAndValidateReceiptDate(yyyy);
    return warning;
  })();

  const validate = (): boolean => {
    const errs: Record<string, string> = {};
    if (!vendor.trim()) errs.vendor = 'Vendor is required';
    if (!amount || parseFloat(amount) <= 0) errs.amount = 'Amount must be greater than 0';
    if (!currency) errs.currency = 'Currency is required';
    setErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    if (!validate()) return;

    // Date sanity confirm
    const todayUtc = new Date();
    const tUtc = new Date(Date.UTC(todayUtc.getUTCFullYear(), todayUtc.getUTCMonth(), todayUtc.getUTCDate()));
    const pUtc = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const diffDays = Math.round((tUtc.getTime() - pUtc.getTime()) / 86_400_000);
    if (diffDays > MAX_PAST_DAYS || diffDays < -MAX_FUTURE_DAYS) {
      const human = format(date, 'PPP');
      const msg = diffDays < 0
        ? `This expense is dated ${human} (in the future). Save anyway?`
        : `This expense is dated ${human} (${diffDays} days ago). Save anyway?`;
      if (!window.confirm(msg)) return;
    }

    setSaving(true);
    try {
      const amt = parseFloat(amount);
      const dateStr = format(date, 'yyyy-MM-dd');
      const cat = category === '__none__' ? null : category;
      const pm = paymentMethod === '__none__' ? null : paymentMethod;
      const selectedTrip = tripId === '__none__' ? null : trips.find(t => t.id === tripId) ?? null;
      const selectedEmployee = canChangeEmployee && employeeId !== KEEP_CURRENT_EMPLOYEE
        ? employees.find(employee => employee.id === employeeId) ?? null
        : null;

      const payload: Record<string, unknown> = {
        vendor: vendor.trim() || null,
        date: dateStr,
        amount: amt,
        currency,
        category: cat,
        payment_method: pm,
        trip_id: selectedTrip?.id ?? null,
        trip_name: selectedTrip?.name ?? null,
        notes: notes.trim() || null,
        tax_id_number: taxIdNumber.trim() || null,
        tax_amount: taxAmount ? parseFloat(taxAmount) : null,
      };
      if (selectedEmployee) {
        payload.employee_id = selectedEmployee.id;
        payload.employee_name = selectedEmployee.name;
        payload.employee_phone = selectedEmployee.phone_number || null;
      }

      const data = await apiRequest<{ expense: EditableExpense; exchange?: { warning?: string | null } }>(
        `/api/tex/expenses/${expense.id}`,
        { method: 'PATCH', body: JSON.stringify(payload) },
      );
      if (data.exchange?.warning) toast.info(data.exchange.warning);
      toast.success(data.expense?.policy_flag ? 'Expense saved - still flagged for review' : 'Expense updated');
      onSaved();
    } catch (error) {
      toast.error((error as Error).message || 'Failed to save expense');
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="space-y-4">
      <div>
        <Label>Vendor *</Label>
        <Input value={vendor} onChange={e => setVendor(e.target.value)}
          className={cn(errors.vendor && 'border-destructive')} />
        {errors.vendor && <p className="text-xs text-destructive mt-1">{errors.vendor}</p>}
      </div>

      <div>
        <Label>Date *</Label>
        <Popover>
          <PopoverTrigger asChild>
            <Button variant="outline" className="w-full justify-start text-left font-normal">
              <CalendarIcon className="mr-2 h-4 w-4" />
              {format(date, 'PPP')}
            </Button>
          </PopoverTrigger>
          <PopoverContent className="w-auto p-0" align="start">
            <Calendar mode="single" selected={date} onSelect={d => { if (d) setDate(d); }} initialFocus className="p-3 pointer-events-auto" />
          </PopoverContent>
        </Popover>
        {dateWarning && (
          <p className="text-xs text-amber-600 mt-1 flex items-start gap-1">
            <AlertTriangle className="h-3 w-3 mt-0.5 shrink-0" />
            <span>{describeDateWarning(dateWarning)}</span>
          </p>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Amount *</Label>
          <Input type="number" step="0.01" min="0.01" value={amount}
            onChange={e => setAmount(e.target.value)}
            className={cn(errors.amount && 'border-destructive')} />
          {errors.amount && <p className="text-xs text-destructive mt-1">{errors.amount}</p>}
        </div>
        <div>
          <Label>Currency *</Label>
          <Select value={currency} onValueChange={setCurrency}>
            <SelectTrigger><SelectValue /></SelectTrigger>
            <SelectContent>
              {ALL_CURRENCIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
      </div>

      <div>
        <Label>Category</Label>
        <Select value={category} onValueChange={setCategory}>
          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {CATEGORIES.map(c => <SelectItem key={c} value={c}>{c}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Payment Method</Label>
        <Select value={paymentMethod} onValueChange={setPaymentMethod}>
          <SelectTrigger><SelectValue placeholder="None" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">None</SelectItem>
            {PAYMENT_METHODS.map(m => <SelectItem key={m} value={m}>{m}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Trip</Label>
        <Select value={tripId} onValueChange={setTripId}>
          <SelectTrigger><SelectValue placeholder="No trip" /></SelectTrigger>
          <SelectContent>
            <SelectItem value="__none__">No trip / ad-hoc</SelectItem>
            {trips.map(t => <SelectItem key={t.id} value={t.id}>{t.name}</SelectItem>)}
          </SelectContent>
        </Select>
      </div>

      <div>
        <Label>Employee</Label>
        {canChangeEmployee ? (
          <>
            <Select value={employeeId} onValueChange={setEmployeeId}>
              <SelectTrigger><SelectValue placeholder="Keep current employee" /></SelectTrigger>
              <SelectContent>
                <SelectItem value={KEEP_CURRENT_EMPLOYEE}>
                  Keep current ({expense.employee_name ?? 'Unassigned'})
                </SelectItem>
                {employees.map(employee => (
                  <SelectItem key={employee.id} value={employee.id}>{employee.name}</SelectItem>
                ))}
              </SelectContent>
            </Select>
            <p className="text-xs text-muted-foreground mt-1">
              Use this when the receipt was sent by one employee but belongs to another.
            </p>
          </>
        ) : (
          <Input value={expense.employee_name ?? 'Unassigned'} disabled />
        )}
      </div>

      <div>
        <Label>Notes</Label>
        <Textarea rows={2} value={notes} onChange={e => setNotes(e.target.value)} />
      </div>

      <div className="grid grid-cols-2 gap-3">
        <div>
          <Label>Tax ID</Label>
          <Input value={taxIdNumber} onChange={e => setTaxIdNumber(e.target.value)} />
        </div>
        <div>
          <Label>Tax Amount</Label>
          <Input type="number" step="0.01" min="0" value={taxAmount} onChange={e => setTaxAmount(e.target.value)} />
        </div>
      </div>

      <div className="flex gap-2 pt-2 border-t">
        <Button variant="outline" className="flex-1" onClick={onCancel} disabled={saving}>Cancel</Button>
        <Button className="flex-1" onClick={handleSave} disabled={saving}>
          {saving ? <><Loader2 className="h-4 w-4 mr-1.5 animate-spin" />Saving…</> : 'Save changes'}
        </Button>
      </div>
    </div>
  );
};

export default EditExpenseForm;
