-- Query support for TEX high-traffic screens and receipt access checks.
-- These indexes complement the original tenant/status/date indexes with the
-- sort and join columns used by the App Router data loaders.

create index if not exists tex_expenses_tenant_created_at_desc_idx
  on public.tex_expenses (tenant_id, created_at desc);

create index if not exists tex_expenses_tenant_expense_date_created_at_desc_idx
  on public.tex_expenses (tenant_id, expense_date desc, created_at desc);

create index if not exists tex_expenses_finance_review_period_idx
  on public.tex_expenses (
    tenant_id,
    status,
    (extract(year from expense_date)::int),
    (extract(month from expense_date)::int),
    expense_date desc,
    created_at desc
  )
  where status = 'approved';

create index if not exists tex_expenses_receipt_file_lookup_idx
  on public.tex_expenses (tenant_id, receipt_file_id)
  where receipt_file_id is not null;

create index if not exists tex_whatsapp_submissions_resolved_expense_idx
  on public.tex_unregistered_whatsapp_submissions (
    tenant_id,
    resolved_expense_id,
    resolved_at desc,
    created_at desc
  )
  where resolved_expense_id is not null;
