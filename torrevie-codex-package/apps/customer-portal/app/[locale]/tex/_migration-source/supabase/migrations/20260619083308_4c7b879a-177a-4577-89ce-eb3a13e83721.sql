
-- 1. Fix companies INSERT policy (remove OR true)
DROP POLICY IF EXISTS "Super admins can insert companies" ON public.companies;
CREATE POLICY "Super admins can insert companies" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (public.is_super_admin(auth.uid()));

-- 2. Profiles: prevent self-escalation via trigger
CREATE OR REPLACE FUNCTION public.prevent_profile_self_escalation()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  _caller uuid := auth.uid();
  _is_super boolean := COALESCE(public.is_super_admin(_caller), false);
  _is_admin_same_company boolean := FALSE;
BEGIN
  IF _caller IS NULL THEN
    RETURN NEW;
  END IF;
  IF _is_super THEN
    RETURN NEW;
  END IF;

  SELECT (public.get_user_role(_caller) = 'admin'
          AND public.get_user_company_id(_caller) = OLD.company_id)
    INTO _is_admin_same_company;

  IF _caller = OLD.id AND NOT _is_admin_same_company THEN
    IF NEW.super_admin IS DISTINCT FROM OLD.super_admin THEN
      RAISE EXCEPTION 'Not allowed to change super_admin';
    END IF;
    IF NEW.role IS DISTINCT FROM OLD.role THEN
      RAISE EXCEPTION 'Not allowed to change role';
    END IF;
    IF NEW.company_id IS DISTINCT FROM OLD.company_id THEN
      RAISE EXCEPTION 'Not allowed to change company_id';
    END IF;
    IF NEW.manager_id IS DISTINCT FROM OLD.manager_id THEN
      RAISE EXCEPTION 'Not allowed to change manager_id';
    END IF;
    IF NEW.is_ceo IS DISTINCT FROM OLD.is_ceo THEN
      RAISE EXCEPTION 'Not allowed to change is_ceo';
    END IF;
    IF NEW.approval_limit_aed IS DISTINCT FROM OLD.approval_limit_aed THEN
      RAISE EXCEPTION 'Not allowed to change approval_limit_aed';
    END IF;
    IF NEW.full_name IS DISTINCT FROM OLD.full_name THEN
      RAISE EXCEPTION 'Not allowed to change full_name';
    END IF;
  END IF;

  IF _is_admin_same_company AND NEW.super_admin IS DISTINCT FROM OLD.super_admin THEN
    RAISE EXCEPTION 'Only super admins can change super_admin';
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS prevent_profile_self_escalation_trg ON public.profiles;
CREATE TRIGGER prevent_profile_self_escalation_trg
BEFORE UPDATE ON public.profiles
FOR EACH ROW EXECUTE FUNCTION public.prevent_profile_self_escalation();

-- 3. Role-gated INSERT/UPDATE policies on financial config tables
DROP POLICY IF EXISTS spend_policies_insert ON public.spend_policies;
CREATE POLICY spend_policies_insert ON public.spend_policies
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.get_user_role(auth.uid()) = 'admin' OR public.is_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS budgets_insert ON public.budgets;
CREATE POLICY budgets_insert ON public.budgets
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.get_user_role(auth.uid()) = 'admin' OR public.is_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS per_diem_rates_insert ON public.per_diem_rates;
CREATE POLICY per_diem_rates_insert ON public.per_diem_rates
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.get_user_role(auth.uid()) = 'admin' OR public.is_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS erp_connections_insert ON public.erp_connections;
CREATE POLICY erp_connections_insert ON public.erp_connections
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = public.get_user_company_id(auth.uid())
    AND (public.get_user_role(auth.uid()) = 'admin' OR public.is_super_admin(auth.uid()))
  );

DROP POLICY IF EXISTS spend_policies_update ON public.spend_policies;
CREATE POLICY spend_policies_update ON public.spend_policies
  FOR UPDATE TO authenticated
  USING (
    (company_id = public.get_user_company_id(auth.uid())
     AND public.get_user_role(auth.uid()) = 'admin')
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS budgets_update ON public.budgets;
CREATE POLICY budgets_update ON public.budgets
  FOR UPDATE TO authenticated
  USING (
    (company_id = public.get_user_company_id(auth.uid())
     AND public.get_user_role(auth.uid()) = 'admin')
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS per_diem_rates_update ON public.per_diem_rates;
CREATE POLICY per_diem_rates_update ON public.per_diem_rates
  FOR UPDATE TO authenticated
  USING (
    (company_id = public.get_user_company_id(auth.uid())
     AND public.get_user_role(auth.uid()) = 'admin')
    OR public.is_super_admin(auth.uid())
  );

DROP POLICY IF EXISTS erp_connections_update ON public.erp_connections;
CREATE POLICY erp_connections_update ON public.erp_connections
  FOR UPDATE TO authenticated
  USING (
    (company_id = public.get_user_company_id(auth.uid())
     AND public.get_user_role(auth.uid()) = 'admin')
    OR public.is_super_admin(auth.uid())
  );

-- 4. Add missing DELETE policies
CREATE POLICY erp_connections_delete ON public.erp_connections
  FOR DELETE TO authenticated
  USING (
    (company_id = public.get_user_company_id(auth.uid())
     AND public.get_user_role(auth.uid()) = 'admin')
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY per_diem_rates_delete ON public.per_diem_rates
  FOR DELETE TO authenticated
  USING (
    (company_id = public.get_user_company_id(auth.uid())
     AND public.get_user_role(auth.uid()) = 'admin')
    OR public.is_super_admin(auth.uid())
  );

-- 5. Storage receipts: tighten access
DROP POLICY IF EXISTS "Anyone can view receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can update receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can delete receipts" ON storage.objects;

CREATE POLICY "Authenticated users can view receipts" ON storage.objects
  FOR SELECT TO authenticated
  USING (bucket_id = 'receipts');

CREATE POLICY "Admins can update receipts" ON storage.objects
  FOR UPDATE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (public.get_user_role(auth.uid()) = 'admin' OR public.is_super_admin(auth.uid()))
  );

CREATE POLICY "Admins can delete receipts" ON storage.objects
  FOR DELETE TO authenticated
  USING (
    bucket_id = 'receipts'
    AND (public.get_user_role(auth.uid()) = 'admin' OR public.is_super_admin(auth.uid()))
  );

-- 6. Revoke EXECUTE on helper SECURITY DEFINER functions from anon / PUBLIC
REVOKE EXECUTE ON FUNCTION public.is_super_admin(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_company_id(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_role(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_user_full_name(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_team_company_id(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.has_direct_reports(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.is_manager_of_submitter(uuid, text, uuid, uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.get_approver(uuid) FROM anon, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.read_email_batch(text, integer, integer) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.delete_email(text, bigint) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.enqueue_email(text, jsonb) FROM anon, authenticated, PUBLIC;
REVOKE EXECUTE ON FUNCTION public.move_to_dlq(text, text, bigint, jsonb) FROM anon, authenticated, PUBLIC;
