DROP POLICY IF EXISTS "Onboarding users can insert their company" ON public.companies;
CREATE POLICY "Onboarding users can insert their company" ON public.companies
  FOR INSERT TO authenticated
  WITH CHECK (
    public.get_user_company_id(auth.uid()) IS NULL
    OR public.is_super_admin(auth.uid())
  );
