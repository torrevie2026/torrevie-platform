
-- audit_log INSERT: require user_id = auth.uid() so entries cannot be attributed to other users
DROP POLICY IF EXISTS audit_log_insert ON public.audit_log;
CREATE POLICY audit_log_insert ON public.audit_log
  FOR INSERT TO authenticated
  WITH CHECK (
    (
      user_id = auth.uid()
      AND company_id = get_user_company_id(auth.uid())
    )
    OR is_super_admin(auth.uid())
  );

-- notifications INSERT: prevent regular employees from creating fake targeted notifications
DROP POLICY IF EXISTS notifications_insert ON public.notifications;
CREATE POLICY notifications_insert ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (
    is_super_admin(auth.uid())
    OR (
      company_id = get_user_company_id(auth.uid())
      AND (
        user_id IS NULL
        OR user_id = auth.uid()
        OR get_user_role(auth.uid()) IN ('admin','manager','finance')
        OR has_direct_reports(auth.uid())
      )
    )
  );
