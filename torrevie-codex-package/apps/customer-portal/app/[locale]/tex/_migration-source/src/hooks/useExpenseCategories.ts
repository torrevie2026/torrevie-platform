import { useEffect, useState } from 'react';
import { apiRequest } from '@/lib/api';

export type ExpenseCategory = {
  id: string;
  name: string;
  is_active: boolean;
  sort_order: number;
  is_system: boolean;
};

/**
 * Loads the per-tenant expense categories. Falls back to the legacy six if the
 * tenant has none yet (e.g. before the seed migration runs).
 */
export function useExpenseCategories(companyId: string | null | undefined, opts: { includeInactive?: boolean } = {}) {
  const [categories, setCategories] = useState<ExpenseCategory[]>([]);
  const [loading, setLoading] = useState(true);
  const [reloadKey, setReloadKey] = useState(0);

  useEffect(() => {
    let cancelled = false;
    if (!companyId) { setCategories([]); setLoading(false); return; }
    setLoading(true);
    apiRequest<{ categories: ExpenseCategory[] }>(
      `/api/tex/expenses/bootstrap?company_id=${encodeURIComponent(companyId)}`,
    )
      .then(({ categories: data }) => {
        if (cancelled) return;
        const rows = (data ?? []) as ExpenseCategory[];
        const filtered = opts.includeInactive ? rows : rows.filter(r => r.is_active);
        setCategories(filtered);
        setLoading(false);
      })
      .catch(() => {
        if (cancelled) return;
        setCategories([]);
        setLoading(false);
      });
    return () => { cancelled = true; };
  }, [companyId, opts.includeInactive, reloadKey]);

  return { categories, loading, refresh: () => setReloadKey(k => k + 1) };
}

/** Plain list of category names (active only) for dropdowns. */
export function useExpenseCategoryNames(companyId: string | null | undefined) {
  const { categories, loading, refresh } = useExpenseCategories(companyId);
  return { names: categories.map(c => c.name), loading, refresh };
}
