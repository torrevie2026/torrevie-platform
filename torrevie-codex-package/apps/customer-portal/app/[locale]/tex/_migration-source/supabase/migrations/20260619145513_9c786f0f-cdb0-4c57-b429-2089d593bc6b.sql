
-- 1) Hide companies.stripe_customer_id and tax_registration_number from non-admins
REVOKE SELECT (stripe_customer_id, tax_registration_number) ON public.companies FROM authenticated;
REVOKE SELECT (stripe_customer_id, tax_registration_number) ON public.companies FROM anon;

CREATE OR REPLACE FUNCTION public.get_company_billing(_company_id uuid)
RETURNS TABLE(stripe_customer_id text, tax_registration_number text)
LANGUAGE plpgsql STABLE SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF public.is_super_admin(auth.uid())
     OR (public.get_user_role(auth.uid()) = 'admin'
         AND public.get_user_company_id(auth.uid()) = _company_id) THEN
    RETURN QUERY SELECT c.stripe_customer_id, c.tax_registration_number
                 FROM public.companies c WHERE c.id = _company_id;
  ELSE
    RAISE EXCEPTION 'Not authorized';
  END IF;
END;
$$;
GRANT EXECUTE ON FUNCTION public.get_company_billing(uuid) TO authenticated;

CREATE OR REPLACE FUNCTION public.update_company_tax_registration(_company_id uuid, _tax_registration_number text)
RETURNS void LANGUAGE plpgsql SECURITY DEFINER SET search_path = public AS $$
BEGIN
  IF NOT (public.is_super_admin(auth.uid())
          OR (public.get_user_role(auth.uid()) = 'admin'
              AND public.get_user_company_id(auth.uid()) = _company_id)) THEN
    RAISE EXCEPTION 'Not authorized';
  END IF;
  UPDATE public.companies
     SET tax_registration_number = NULLIF(btrim(_tax_registration_number), '')
   WHERE id = _company_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.update_company_tax_registration(uuid, text) TO authenticated;

-- 2) Replace name-based expense ownership with submitter_id
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS submitter_id uuid REFERENCES public.profiles(id) ON DELETE SET NULL;

ALTER TABLE public.expenses
  ALTER COLUMN submitter_id SET DEFAULT auth.uid();

-- Backfill where exactly one profile in the same company has the matching full_name
WITH unique_matches AS (
  SELECT e.id AS expense_id, p.id AS profile_id
  FROM public.expenses e
  JOIN public.profiles p
    ON p.company_id = e.company_id AND p.full_name = e.employee_name
  WHERE e.submitter_id IS NULL
    AND (
      SELECT count(*) FROM public.profiles p2
      WHERE p2.company_id = e.company_id AND p2.full_name = e.employee_name
    ) = 1
)
UPDATE public.expenses e
   SET submitter_id = um.profile_id
  FROM unique_matches um
 WHERE e.id = um.expense_id;

DROP POLICY IF EXISTS expenses_select ON public.expenses;
CREATE POLICY expenses_select ON public.expenses FOR SELECT
USING (
  ((public.get_user_role(auth.uid()) = 'admin') AND (company_id = public.get_user_company_id(auth.uid())))
  OR public.is_super_admin(auth.uid())
  OR ((public.get_user_role(auth.uid()) = 'finance')
      AND (company_id = public.get_user_company_id(auth.uid()))
      AND (status = ANY (ARRAY['approved'::text,'finance_review'::text,'paid'::text])))
  OR public.is_manager_of_submitter(auth.uid(), employee_name, employee_id, company_id)
  OR (submitter_id IS NOT NULL AND submitter_id = auth.uid())
);

DROP POLICY IF EXISTS expenses_update ON public.expenses;
CREATE POLICY expenses_update ON public.expenses FOR UPDATE
USING (
  ((public.get_user_role(auth.uid()) = 'admin') AND (company_id = public.get_user_company_id(auth.uid())))
  OR public.is_super_admin(auth.uid())
  OR public.is_manager_of_submitter(auth.uid(), employee_name, employee_id, company_id)
  OR ((public.get_user_role(auth.uid()) = 'finance')
      AND (company_id = public.get_user_company_id(auth.uid()))
      AND (status = ANY (ARRAY['approved'::text,'finance_review'::text,'paid'::text])))
  OR (submitter_id IS NOT NULL AND submitter_id = auth.uid() AND status = 'pending')
)
WITH CHECK (
  ((public.get_user_role(auth.uid()) = 'admin') AND (company_id = public.get_user_company_id(auth.uid())))
  OR public.is_super_admin(auth.uid())
  OR public.is_manager_of_submitter(auth.uid(), employee_name, employee_id, company_id)
  OR ((public.get_user_role(auth.uid()) = 'finance')
      AND (company_id = public.get_user_company_id(auth.uid()))
      AND (status = ANY (ARRAY['approved'::text,'finance_review'::text,'paid'::text])))
  OR (submitter_id IS NOT NULL AND submitter_id = auth.uid() AND status = 'pending')
);

DROP POLICY IF EXISTS expenses_insert ON public.expenses;
CREATE POLICY expenses_insert ON public.expenses FOR INSERT
WITH CHECK (
  (company_id = public.get_user_company_id(auth.uid()))
  AND (submitter_id IS NULL OR submitter_id = auth.uid())
  AND (status = 'pending')
  AND (approved_by IS NULL) AND (approved_at IS NULL)
  AND (rejected_by IS NULL) AND (paid_by IS NULL) AND (finance_reviewed_by IS NULL)
);

-- 3) Notifications: restrict insert to admins, self, or broadcast (user_id IS NULL)
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications FOR INSERT
WITH CHECK (
  public.is_super_admin(auth.uid())
  OR (
    company_id = public.get_user_company_id(auth.uid())
    AND (
      user_id IS NULL
      OR user_id = auth.uid()
      OR public.get_user_role(auth.uid()) = 'admin'
    )
  )
);

-- 4) Storage: company-scope admin update/delete on receipts, and remove broad read policy
DROP POLICY IF EXISTS "Authenticated users can view receipts" ON storage.objects;

DROP POLICY IF EXISTS "Admins can update receipts" ON storage.objects;
CREATE POLICY "Admins can update receipts" ON storage.objects FOR UPDATE
USING (
  bucket_id = 'receipts'
  AND (
    public.is_super_admin(auth.uid())
    OR (
      public.get_user_role(auth.uid()) = 'admin'
      AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    )
  )
);

DROP POLICY IF EXISTS "Admins can delete receipts" ON storage.objects;
CREATE POLICY "Admins can delete receipts" ON storage.objects FOR DELETE
USING (
  bucket_id = 'receipts'
  AND (
    public.is_super_admin(auth.uid())
    OR (
      public.get_user_role(auth.uid()) = 'admin'
      AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
    )
  )
);
