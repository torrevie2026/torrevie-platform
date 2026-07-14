
-- companies UPDATE: admin only
DROP POLICY IF EXISTS "Admins can update their own company" ON public.companies;
CREATE POLICY "Admins can update their own company" ON public.companies
  FOR UPDATE TO authenticated
  USING ((get_user_role(auth.uid()) = 'admin' AND id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()))
  WITH CHECK ((get_user_role(auth.uid()) = 'admin' AND id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- employees INSERT/UPDATE: admin only
DROP POLICY IF EXISTS employees_insert ON public.employees;
CREATE POLICY employees_insert ON public.employees
  FOR INSERT TO authenticated
  WITH CHECK ((get_user_role(auth.uid()) = 'admin' AND company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS employees_update ON public.employees;
CREATE POLICY employees_update ON public.employees
  FOR UPDATE TO authenticated
  USING ((get_user_role(auth.uid()) = 'admin' AND company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()))
  WITH CHECK ((get_user_role(auth.uid()) = 'admin' AND company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- teams INSERT: admin only
DROP POLICY IF EXISTS teams_insert ON public.teams;
CREATE POLICY teams_insert ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK ((get_user_role(auth.uid()) = 'admin' AND company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- team_members INSERT: admin only
DROP POLICY IF EXISTS team_members_insert ON public.team_members;
CREATE POLICY team_members_insert ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK ((get_user_role(auth.uid()) = 'admin' AND get_team_company_id(team_id) = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- trips INSERT/UPDATE: admin only
DROP POLICY IF EXISTS trips_insert ON public.trips;
CREATE POLICY trips_insert ON public.trips
  FOR INSERT TO authenticated
  WITH CHECK ((get_user_role(auth.uid()) = 'admin' AND company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

DROP POLICY IF EXISTS trips_update ON public.trips;
CREATE POLICY trips_update ON public.trips
  FOR UPDATE TO authenticated
  USING ((get_user_role(auth.uid()) = 'admin' AND company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()))
  WITH CHECK ((get_user_role(auth.uid()) = 'admin' AND company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- expenses INSERT: lock to pending, no preset approver/payer fields
DROP POLICY IF EXISTS expenses_insert ON public.expenses;
CREATE POLICY expenses_insert ON public.expenses
  FOR INSERT TO authenticated
  WITH CHECK (
    company_id = get_user_company_id(auth.uid())
    AND status = 'pending'
    AND approved_by IS NULL
    AND approved_at IS NULL
    AND rejected_by IS NULL
    AND paid_by IS NULL
    AND finance_reviewed_by IS NULL
  );

-- expenses UPDATE: keep privileged paths; restrict employee self-edits to their own pending rows
DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_update ON public.expenses
  FOR UPDATE TO authenticated
  USING (
    (get_user_role(auth.uid()) = 'admin' AND company_id = get_user_company_id(auth.uid()))
    OR is_super_admin(auth.uid())
    OR is_manager_of_submitter(auth.uid(), employee_name, employee_id, company_id)
    OR ((get_user_role(auth.uid()) = 'finance') AND company_id = get_user_company_id(auth.uid()) AND status = ANY (ARRAY['approved','finance_review','paid']))
    OR (company_id = get_user_company_id(auth.uid()) AND employee_name = get_user_full_name(auth.uid()) AND status = 'pending')
  )
  WITH CHECK (
    (get_user_role(auth.uid()) = 'admin' AND company_id = get_user_company_id(auth.uid()))
    OR is_super_admin(auth.uid())
    OR is_manager_of_submitter(auth.uid(), employee_name, employee_id, company_id)
    OR ((get_user_role(auth.uid()) = 'finance') AND company_id = get_user_company_id(auth.uid()) AND status = ANY (ARRAY['approved','finance_review','paid']))
    OR (company_id = get_user_company_id(auth.uid()) AND employee_name = get_user_full_name(auth.uid()) AND status = 'pending')
  );

-- Storage: receipts must be uploaded under the caller's company folder
DROP POLICY IF EXISTS "Authenticated users can upload receipts" ON storage.objects;
DROP POLICY IF EXISTS "Authenticated users can read receipts" ON storage.objects;

CREATE POLICY "Receipts upload company-scoped" ON storage.objects
  FOR INSERT TO authenticated
  WITH CHECK (
    bucket_id = 'receipts'
    AND (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
  );

CREATE POLICY "Receipts read company-scoped" ON storage.objects
  FOR SELECT TO authenticated
  USING (
    bucket_id = 'receipts'
    AND ((storage.foldername(name))[1] = get_user_company_id(auth.uid())::text OR is_super_admin(auth.uid()))
  );
