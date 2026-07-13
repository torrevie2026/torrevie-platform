alter table public.tex_expenses
  drop constraint if exists tex_expenses_extraction_source_check;

alter table public.tex_expenses
  add constraint tex_expenses_extraction_source_check
  check (extraction_source in ('manual', 'web_ai', 'whatsapp_ai'));
