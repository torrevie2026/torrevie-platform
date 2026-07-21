create index if not exists tex_expenses_tenant_duplicate_lookup_idx
  on public.tex_expenses (tenant_id, expense_date, amount, currency)
  where status <> 'rejected';
