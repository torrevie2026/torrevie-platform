import { supabase } from '@/integrations/supabase/client';
import { format } from 'date-fns';

export interface DuplicateCandidate {
  company_id: string;
  employee_id?: string | null;
  employee_name?: string | null;
  vendor?: string | null;
  amount: number;
  currency: string;
  /** Expense date in 'yyyy-MM-dd' format. */
  date: string;
}

export interface DuplicateMatch {
  id: string;
  vendor: string | null;
  date: string;
  amount: number;
  currency: string;
  employee_name: string | null;
  /** Days between candidate and existing match (absolute). */
  dayDiff: number;
  /** Human-readable reason string suitable for policy_flag_reason. */
  reason: string;
}

const WINDOW_DAYS = 3;

function addDays(yyyy_mm_dd: string, days: number): string {
  const d = new Date(yyyy_mm_dd + 'T00:00:00Z');
  d.setUTCDate(d.getUTCDate() + days);
  return format(d, 'yyyy-MM-dd');
}

/**
 * Detect a possible duplicate expense in the same company.
 *
 * Matching rules:
 *  - same company
 *  - same employee (employee_id if present, else employee_name)
 *  - same amount + currency
 *  - same vendor (case-insensitive, trimmed)
 *  - expense date within ±3 days of candidate
 *  - rejected expenses are excluded
 *
 * Returns the closest match (smallest dayDiff) or null.
 */
export async function findDuplicateExpense(
  candidate: DuplicateCandidate,
  options: { excludeExpenseId?: string } = {},
): Promise<DuplicateMatch | null> {
  if (!candidate.company_id || !candidate.amount || !candidate.currency || !candidate.date) {
    return null;
  }
  const vendor = (candidate.vendor || '').trim();
  if (!vendor) return null;

  const from = addDays(candidate.date, -WINDOW_DAYS);
  const to = addDays(candidate.date, WINDOW_DAYS);

  let query = supabase
    .from('expenses')
    .select('id, vendor, date, amount, currency, employee_id, employee_name, status')
    .eq('company_id', candidate.company_id)
    .eq('amount', candidate.amount)
    .eq('currency', candidate.currency)
    .neq('status', 'rejected')
    .gte('date', from)
    .lte('date', to);

  if (candidate.employee_id) {
    query = query.eq('employee_id', candidate.employee_id);
  } else if (candidate.employee_name) {
    query = query.eq('employee_name', candidate.employee_name);
  } else {
    return null;
  }

  const { data, error } = await query;
  if (error || !data) return null;

  const candDate = new Date(candidate.date + 'T00:00:00Z').getTime();
  const vendorLower = vendor.toLowerCase();

  const matches = data
    .filter((e) => {
      if (options.excludeExpenseId && e.id === options.excludeExpenseId) return false;
      const ev = (e.vendor || '').trim().toLowerCase();
      return ev && ev === vendorLower;
    })
    .map((e) => {
      const eDate = new Date(e.date + 'T00:00:00Z').getTime();
      const dayDiff = Math.round(Math.abs(candDate - eDate) / (1000 * 60 * 60 * 24));
      return { e, dayDiff };
    })
    .sort((a, b) => a.dayDiff - b.dayDiff);

  if (matches.length === 0) return null;

  const { e, dayDiff } = matches[0];
  const reason = `Possible duplicate of ${e.vendor} on ${e.date} for ${e.currency} ${e.amount}`;

  return {
    id: e.id,
    vendor: e.vendor,
    date: e.date,
    amount: e.amount,
    currency: e.currency,
    employee_name: e.employee_name,
    dayDiff,
    reason,
  };
}

/**
 * Merge a duplicate match into existing policy flag/reason values.
 * - If there is already a policy flag from another check, the duplicate reason
 *   is appended after a separator.
 * - If no duplicate match, the original values are returned unchanged.
 */
export function mergeDuplicateIntoPolicy(
  existing: { policy_flag: boolean; policy_flag_reason: string | null },
  match: DuplicateMatch | null,
): { policy_flag: boolean; policy_flag_reason: string | null } {
  if (!match) return existing;
  const reasonParts = [existing.policy_flag_reason, match.reason].filter(Boolean) as string[];
  return {
    policy_flag: true,
    policy_flag_reason: reasonParts.join(' | '),
  };
}
