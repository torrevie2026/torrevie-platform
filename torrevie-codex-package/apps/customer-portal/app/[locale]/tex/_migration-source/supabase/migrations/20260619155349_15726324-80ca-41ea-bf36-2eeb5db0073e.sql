
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS whatsapp_instance_id text;
CREATE UNIQUE INDEX IF NOT EXISTS companies_whatsapp_instance_id_unique
  ON public.companies (whatsapp_instance_id) WHERE whatsapp_instance_id IS NOT NULL;

CREATE OR REPLACE FUNCTION public.update_company_whatsapp_instance(_company_id uuid, _instance_id text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _normalized text;
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR (public.get_user_role(auth.uid()) = 'admin'
              AND public.get_user_company_id(auth.uid()) = _company_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  _normalized := NULLIF(regexp_replace(COALESCE(_instance_id, ''), '^instance', '', 'i'), '');
  UPDATE public.companies SET whatsapp_instance_id = _normalized WHERE id = _company_id;
END;
$$;

CREATE OR REPLACE FUNCTION public.get_company_by_whatsapp_instance(_instance_id text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.companies
  WHERE whatsapp_instance_id = NULLIF(regexp_replace(COALESCE(_instance_id, ''), '^instance', '', 'i'), '')
  LIMIT 1;
$$;
