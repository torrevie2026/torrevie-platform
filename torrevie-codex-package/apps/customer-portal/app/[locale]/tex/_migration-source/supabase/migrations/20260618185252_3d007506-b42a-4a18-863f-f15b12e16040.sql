DROP POLICY IF EXISTS "Company logos: admins insert own company" ON storage.objects;
DROP POLICY IF EXISTS "Company logos: admins update own company" ON storage.objects;
DROP POLICY IF EXISTS "Company logos: admins delete own company" ON storage.objects;

CREATE POLICY "Company logos: admins or super admins insert"
ON storage.objects FOR INSERT TO authenticated
WITH CHECK (
  bucket_id = 'company-logos' AND (
    (
      (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
      AND get_user_role(auth.uid()) = 'admin'
    )
    OR is_super_admin(auth.uid())
  )
);

CREATE POLICY "Company logos: admins or super admins update"
ON storage.objects FOR UPDATE TO authenticated
USING (
  bucket_id = 'company-logos' AND (
    (
      (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
      AND get_user_role(auth.uid()) = 'admin'
    )
    OR is_super_admin(auth.uid())
  )
);

CREATE POLICY "Company logos: admins or super admins delete"
ON storage.objects FOR DELETE TO authenticated
USING (
  bucket_id = 'company-logos' AND (
    (
      (storage.foldername(name))[1] = get_user_company_id(auth.uid())::text
      AND get_user_role(auth.uid()) = 'admin'
    )
    OR is_super_admin(auth.uid())
  )
);