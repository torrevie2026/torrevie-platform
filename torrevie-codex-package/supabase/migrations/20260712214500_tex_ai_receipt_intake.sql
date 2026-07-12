alter table public.tex_integration_settings
  add column if not exists ai_receipt_extraction_enabled boolean not null default true,
  add column if not exists duplicate_detection_enabled boolean not null default true,
  add column if not exists duplicate_auto_reject_enabled boolean not null default false,
  add column if not exists duplicate_similarity_threshold numeric(5, 4) not null default 0.9200;

alter table public.tex_expenses
  add column if not exists extraction_source text not null default 'manual'
    check (extraction_source in ('manual', 'whatsapp_ai')),
  add column if not exists extraction_confidence numeric(5, 4),
  add column if not exists extraction_payload jsonb not null default '{}'::jsonb,
  add column if not exists duplicate_status text not null default 'clear'
    check (duplicate_status in ('clear', 'suspected', 'duplicate')),
  add column if not exists duplicate_of_expense_id uuid references public.tex_expenses(id) on delete set null,
  add column if not exists duplicate_reason text,
  add column if not exists manager_review_required boolean not null default false;

alter table public.tex_unregistered_whatsapp_submissions
  add column if not exists message_type text not null default 'receipt'
    check (message_type in ('receipt', 'status', 'text')),
  add column if not exists media_url text,
  add column if not exists media_mime_type text,
  add column if not exists ocr_status text not null default 'pending'
    check (ocr_status in ('pending', 'processing', 'extracted', 'failed', 'manual_review', 'not_applicable')),
  add column if not exists ocr_result jsonb not null default '{}'::jsonb,
  add column if not exists ocr_error text,
  add column if not exists whatsapp_reply_text text;

create index if not exists tex_expenses_duplicate_lookup_idx
  on public.tex_expenses (tenant_id, employee_profile_id, expense_date, amount, currency);

create index if not exists tex_expenses_duplicate_status_idx
  on public.tex_expenses (tenant_id, duplicate_status, created_at desc);

create index if not exists tex_whatsapp_submissions_ocr_status_idx
  on public.tex_unregistered_whatsapp_submissions (tenant_id, ocr_status, created_at desc);
