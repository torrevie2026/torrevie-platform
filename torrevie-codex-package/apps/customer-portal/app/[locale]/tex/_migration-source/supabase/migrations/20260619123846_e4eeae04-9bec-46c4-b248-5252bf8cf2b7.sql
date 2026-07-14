CREATE OR REPLACE FUNCTION public.prevent_profile_self_escalation()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_super boolean := COALESCE(public.is_super_admin(_caller), false);
  _is_admin_same_company boolean := FALSE;
BEGIN
  IF _caller IS NULL THEN RETURN NEW; END IF;
  IF _is_super THEN RETURN NEW; END IF;

  SELECT (public.get_user_role(_caller) = 'admin'
          AND public.get_user_company_id(_caller) = OLD.company_id)
    INTO _is_admin_same_company;

  IF _caller = OLD.id AND NOT _is_admin_same_company THEN
    IF NEW.super_admin IS DISTINCT FROM OLD.super_admin THEN RAISE EXCEPTION 'Not allowed to change super_admin'; END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN RAISE EXCEPTION 'Not allowed to change role'; END IF;
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN RAISE EXCEPTION 'Not allowed to change company_id'; END IF;
    IF NEW.manager_id IS DISTINCT FROM OLD.manager_id THEN RAISE EXCEPTION 'Not allowed to change manager_id'; END IF;
    IF NEW.is_ceo IS DISTINCT FROM OLD.is_ceo THEN RAISE EXCEPTION 'Not allowed to change is_ceo'; END IF;
    IF NEW.approval_limit_aed IS DISTINCT FROM OLD.approval_limit_aed THEN RAISE EXCEPTION 'Not allowed to change approval_limit_aed'; END IF;
    IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN RAISE EXCEPTION 'Not allowed to change full_name'; END IF;
  END IF;

  IF _is_admin_same_company AND NEW.super_admin IS DISTINCT FROM OLD.super_admin THEN
    RAISE EXCEPTION 'Only super admins can change super_admin';
  END IF;

  RETURN NEW;
END;
$$;