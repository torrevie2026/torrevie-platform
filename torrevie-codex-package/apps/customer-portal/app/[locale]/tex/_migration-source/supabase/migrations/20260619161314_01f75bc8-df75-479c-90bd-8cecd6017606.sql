
-- 1) Remove name-based branch from is_manager_of_submitter
CREATE OR REPLACE FUNCTION public.is_manager_of_submitter(_manager_id uuid, _employee_name text, _employee_id uuid, _company_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT _employee_id IS NOT NULL AND EXISTS (
    SELECT 1 FROM public.employees
    WHERE manager_profile_id = _manager_id AND id = _employee_id
  );
$$;

-- 2) Scope company-logos read access to the owning company / super admin
DROP POLICY IF EXISTS "Company logos: authenticated read" ON storage.objects;
CREATE POLICY "Company logos: company-scoped read"
ON storage.objects FOR SELECT
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (
    (storage.foldername(name))[1] = (public.get_user_company_id(auth.uid()))::text
    OR public.is_super_admin(auth.uid())
  )
);
