
-- Enable RLS on reference tables with public read access
ALTER TABLE public.country_configs ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.currency_pegs ENABLE ROW LEVEL SECURITY;

-- Allow anyone (including anon) to read reference data
CREATE POLICY "country_configs_public_read" ON public.country_configs FOR SELECT USING (true);
CREATE POLICY "currency_pegs_public_read" ON public.currency_pegs FOR SELECT USING (true);
