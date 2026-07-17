import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export interface CurrencyPeg {
  from_currency: string;
  to_currency: string;
  rate: number;
}

export interface SpendPolicy {
  category: string;
  daily_limit: number | null;
  monthly_limit: number | null;
  requires_notes_above: number | null;
  is_blocked: boolean | null;
}

export interface ExchangeRateResult {
  rate: number;
  baseAmount: number;
  warning: string | null;
}

/**
 * Resolve an exchange rate from `currency` → `baseCurrency`, preferring pegs,
 * then today's fx_rates row, then the most recent row.
 */
export async function getExchangeRate(
  amount: number,
  currency: string,
  baseCurrency: string,
  pegs: CurrencyPeg[],
): Promise<ExchangeRateResult> {
  if (currency === baseCurrency) return { rate: 1, baseAmount: amount, warning: null };
  const fromPeg = pegs.find(p => p.from_currency === currency);
  const toPeg = pegs.find(p => p.from_currency === baseCurrency);
  if (fromPeg && toPeg) {
    const amountInUsd = amount * fromPeg.rate;
    const rate = fromPeg.rate / toPeg.rate;
    return { rate, baseAmount: amountInUsd / toPeg.rate, warning: null };
  }
  if (fromPeg && baseCurrency === 'USD') {
    return { rate: fromPeg.rate, baseAmount: amount * fromPeg.rate, warning: null };
  }
  const today = format(new Date(), 'yyyy-MM-dd');
  const { data: todayRate } = await supabase
    .from('fx_rates').select('rate, date')
    .eq('from_currency', currency).eq('to_currency', baseCurrency).eq('date', today).maybeSingle();
  if (todayRate) return { rate: todayRate.rate, baseAmount: amount * todayRate.rate, warning: null };
  const { data: recentRate } = await supabase
    .from('fx_rates').select('rate, date')
    .eq('from_currency', currency).eq('to_currency', baseCurrency)
    .order('date', { ascending: false }).limit(1).maybeSingle();
  if (recentRate) {
    return { rate: recentRate.rate, baseAmount: amount * recentRate.rate, warning: `Using rate from ${recentRate.date}` };
  }
  return { rate: 1, baseAmount: amount, warning: 'No exchange rate found. Amount saved without conversion.' };
}

export interface PolicyCheckResult {
  blocked: boolean;
  flagged: boolean;
  reason: string | null;
}

export async function checkPolicies(args: {
  companyId: string;
  category: string | null;
  amount: number;
  notes: string;
  policies: SpendPolicy[];
  /** Exclude this expense id from cumulative totals (used when editing). */
  excludeExpenseId?: string;
}): Promise<PolicyCheckResult> {
  const { companyId, category, amount, notes, policies, excludeExpenseId } = args;
  if (!category) return { blocked: false, flagged: false, reason: null };
  const policy = policies.find(p => p.category === category);
  if (!policy) return { blocked: false, flagged: false, reason: null };
  if (policy.is_blocked) {
    return { blocked: true, flagged: false, reason: 'This category is not permitted by your company policy' };
  }
  if (policy.requires_notes_above != null && amount > policy.requires_notes_above && !notes.trim()) {
    return {
      blocked: true, flagged: false,
      reason: `Notes are required for expenses over ${policy.requires_notes_above} in this category`,
    };
  }
  const reasons: string[] = [];
  if (policy.daily_limit != null) {
    const today = format(new Date(), 'yyyy-MM-dd');
    const q = supabase.from('expenses').select('id, base_amount')
      .eq('company_id', companyId).eq('category', category).eq('date', today);
    const { data } = await q;
    const total = (data || [])
      .filter(e => !excludeExpenseId || e.id !== excludeExpenseId)
      .reduce((s, e) => s + (e.base_amount || 0), 0);
    if (total + amount > policy.daily_limit) {
      reasons.push(`Daily ${category} limit of ${policy.daily_limit} exceeded`);
    }
  }
  if (policy.monthly_limit != null) {
    const now = new Date();
    const monthStart = format(now, 'yyyy-MM-01');
    const monthEnd = format(new Date(now.getFullYear(), now.getMonth() + 1, 0), 'yyyy-MM-dd');
    const { data } = await supabase.from('expenses').select('id, base_amount')
      .eq('company_id', companyId).eq('category', category)
      .gte('date', monthStart).lte('date', monthEnd);
    const total = (data || [])
      .filter(e => !excludeExpenseId || e.id !== excludeExpenseId)
      .reduce((s, e) => s + (e.base_amount || 0), 0);
    if (total + amount > policy.monthly_limit) {
      reasons.push(`Monthly ${category} limit of ${policy.monthly_limit} exceeded`);
    }
  }
  if (reasons.length > 0) return { blocked: false, flagged: true, reason: reasons.join('; ') };
  return { blocked: false, flagged: false, reason: null };
}
