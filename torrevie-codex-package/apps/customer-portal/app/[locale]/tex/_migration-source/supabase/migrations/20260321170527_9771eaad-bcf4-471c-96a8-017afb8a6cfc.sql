
-- 1. Add columns to profiles
ALTER TABLE public.profiles 
  ADD COLUMN IF NOT EXISTS manager_id uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS is_ceo boolean NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS approval_limit_aed decimal;

-- 2. Add manager_profile_id to employees
ALTER TABLE public.employees
  ADD COLUMN IF NOT EXISTS manager_profile_id uuid REFERENCES public.profiles(id);

-- 3. Add new columns to expenses
ALTER TABLE public.expenses
  ADD COLUMN IF NOT EXISTS rejected_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS rejected_at timestamptz,
  ADD COLUMN IF NOT EXISTS finance_reviewed_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS finance_reviewed_at timestamptz,
  ADD COLUMN IF NOT EXISTS paid_by uuid REFERENCES public.profiles(id),
  ADD COLUMN IF NOT EXISTS paid_at timestamptz;

-- 4. get_approver function
CREATE OR REPLACE FUNCTION public.get_approver(_profile_id uuid)
RETURNS uuid[]
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  _is_ceo boolean;
  _manager_id uuid;
  _company_id uuid;
  _admin_ids uuid[];
BEGIN
  SELECT is_ceo, manager_id, company_id 
  INTO _is_ceo, _manager_id, _company_id
  FROM public.profiles WHERE id = _profile_id;
  
  IF _is_ceo = true THEN
    RETURN NULL;
  END IF;
  
  IF _manager_id IS NOT NULL THEN
    RETURN ARRAY[_manager_id];
  END IF;
  
  SELECT array_agg(id) INTO _admin_ids
  FROM public.profiles
  WHERE company_id = _company_id AND role = 'admin';
  
  RETURN _admin_ids;
END;
$$;

-- 5. get_user_full_name helper
CREATE OR REPLACE FUNCTION public.get_user_full_name(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT full_name FROM public.profiles WHERE id = _user_id;
$$;

-- 6. is_manager_of_submitter helper
CREATE OR REPLACE FUNCTION public.is_manager_of_submitter(_manager_id uuid, _employee_name text, _employee_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles 
    WHERE manager_id = _manager_id AND full_name = _employee_name AND company_id = _company_id
  ) OR (
    _employee_id IS NOT NULL AND EXISTS (
      SELECT 1 FROM public.employees 
      WHERE manager_profile_id = _manager_id AND id = _employee_id
    )
  );
$$;

-- 7. has_direct_reports helper
CREATE OR REPLACE FUNCTION public.has_direct_reports(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = 'public'
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.profiles WHERE manager_id = _user_id
  ) OR EXISTS (
    SELECT 1 FROM public.employees WHERE manager_profile_id = _user_id
  );
$$;

-- 8. Update RLS on expenses
DROP POLICY IF EXISTS "expenses_select" ON public.expenses;
CREATE POLICY "expenses_select" ON public.expenses FOR SELECT USING (
  (get_user_role(auth.uid()) = 'admin' AND company_id = get_user_company_id(auth.uid()))
  OR is_super_admin(auth.uid())
  OR (get_user_role(auth.uid()) = 'finance' AND company_id = get_user_company_id(auth.uid()) AND status IN ('approved', 'finance_review', 'paid'))
  OR is_manager_of_submitter(auth.uid(), employee_name, employee_id, company_id)
  OR (company_id = get_user_company_id(auth.uid()) AND employee_name = get_user_full_name(auth.uid()))
);

DROP POLICY IF EXISTS "expenses_update" ON public.expenses;
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE USING (
  (get_user_role(auth.uid()) = 'admin' AND company_id = get_user_company_id(auth.uid()))
  OR is_super_admin(auth.uid())
  OR is_manager_of_submitter(auth.uid(), employee_name, employee_id, company_id)
  OR (get_user_role(auth.uid()) = 'finance' AND company_id = get_user_company_id(auth.uid()) AND status IN ('approved', 'finance_review', 'paid'))
);
