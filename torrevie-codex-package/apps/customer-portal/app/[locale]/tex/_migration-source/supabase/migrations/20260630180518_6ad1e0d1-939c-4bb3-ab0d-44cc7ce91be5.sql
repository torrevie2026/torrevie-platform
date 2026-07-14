
-- No-op idempotent re-verification to refresh generated types after a partial prior run.
DO $$ BEGIN
  PERFORM 1 FROM public.expense_categories LIMIT 1;
  PERFORM 1 FROM public.trip_legs LIMIT 1;
END $$;
