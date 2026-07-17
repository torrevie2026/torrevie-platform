
ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS logo_url TEXT;

-- RLS policies on storage.objects for company-logos bucket
-- Path structure: {company_id}/...
CREATE POLICY "Company logos: authenticated read"
ON storage.objects FOR SELECT
TO authenticated
USING (bucket_id = 'company-logos');

CREATE POLICY "Company logos: admins insert own company"
ON storage.objects FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  AND public.get_user_role(auth.uid()) = 'admin'
);

CREATE POLICY "Company logos: admins update own company"
ON storage.objects FOR UPDATE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  AND public.get_user_role(auth.uid()) = 'admin'
);

CREATE POLICY "Company logos: admins delete own company"
ON storage.objects FOR DELETE
TO authenticated
USING (
  bucket_id = 'company-logos'
  AND (storage.foldername(name))[1] = public.get_user_company_id(auth.uid())::text
  AND public.get_user_role(auth.uid()) = 'admin'
);
