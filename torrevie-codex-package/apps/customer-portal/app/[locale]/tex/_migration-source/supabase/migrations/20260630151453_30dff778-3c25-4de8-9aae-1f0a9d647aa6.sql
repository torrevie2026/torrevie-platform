
-- 1. Columns
ALTER TABLE public.companies
  ADD COLUMN IF NOT EXISTS whatsapp_provider text NOT NULL DEFAULT 'ultramsg',
  ADD COLUMN IF NOT EXISTS wappfly_api_token text,
  ADD COLUMN IF NOT EXISTS wappfly_session_id text;

ALTER TABLE public.companies
  DROP CONSTRAINT IF EXISTS companies_whatsapp_provider_check;
ALTER TABLE public.companies
  ADD CONSTRAINT companies_whatsapp_provider_check
  CHECK (whatsapp_provider IN ('ultramsg','wappfly'));

CREATE UNIQUE INDEX IF NOT EXISTS companies_wappfly_session_id_uidx
  ON public.companies (wappfly_session_id)
  WHERE wappfly_session_id IS NOT NULL;

-- 2. Hide the token from the API role surface
REVOKE SELECT (wappfly_api_token) ON public.companies FROM anon, authenticated;

-- 3. Admin RPC: update provider + creds
CREATE OR REPLACE FUNCTION public.update_company_wappfly(
  _company_id uuid,
  _provider text,
  _token text,
  _session_id text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _new_token text;
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR (public.get_user_role(auth.uid()) = 'admin'
              AND public.get_user_company_id(auth.uid()) = _company_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;

  IF _provider NOT IN ('ultramsg','wappfly') THEN
    RAISE EXCEPTION 'Invalid provider: %', _provider;
  END IF;

  -- Empty string means "leave token unchanged"; explicit NULL clears it.
  IF _token IS NULL THEN
    _new_token := NULL;
  ELSIF btrim(_token) = '' THEN
    SELECT wappfly_api_token INTO _new_token FROM public.companies WHERE id = _company_id;
  ELSE
    _new_token := btrim(_token);
  END IF;

  UPDATE public.companies
     SET whatsapp_provider = _provider,
         wappfly_api_token = _new_token,
         wappfly_session_id = NULLIF(btrim(COALESCE(_session_id,'')), '')
   WHERE id = _company_id;
END;
$$;

-- 4. Read RPC: safe view of the settings (token presence only)
CREATE OR REPLACE FUNCTION public.get_company_whatsapp_settings(_company_id uuid)
RETURNS TABLE(
  whatsapp_provider text,
  whatsapp_instance_id text,
  wappfly_session_id text,
  wappfly_token_set boolean
)
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR (public.get_user_role(auth.uid()) = 'admin'
              AND public.get_user_company_id(auth.uid()) = _company_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  RETURN QUERY
    SELECT c.whatsapp_provider,
           c.whatsapp_instance_id,
           c.wappfly_session_id,
           (c.wappfly_api_token IS NOT NULL AND length(c.wappfly_api_token) > 0)
      FROM public.companies c
     WHERE c.id = _company_id;
END;
$$;

-- 5. Webhook tenant routing
CREATE OR REPLACE FUNCTION public.get_company_by_wappfly_session(_session_id text)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT id FROM public.companies
  WHERE wappfly_session_id = NULLIF(btrim(COALESCE(_session_id,'')), '')
  LIMIT 1;
$$;

GRANT EXECUTE ON FUNCTION public.update_company_wappfly(uuid, text, text, text) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_company_whatsapp_settings(uuid) TO authenticated;
