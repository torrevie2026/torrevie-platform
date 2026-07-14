
-- Create notifications table
CREATE TABLE public.notifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  user_id uuid REFERENCES public.profiles(id) ON DELETE CASCADE,
  title text NOT NULL,
  body text NOT NULL,
  type text NOT NULL,
  related_expense_id uuid REFERENCES public.expenses(id) ON DELETE SET NULL,
  related_trip_id uuid REFERENCES public.trips(id) ON DELETE SET NULL,
  is_read boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.notifications ENABLE ROW LEVEL SECURITY;

-- Users can read their own notifications or company-wide admin ones
CREATE POLICY "notifications_select" ON public.notifications
  FOR SELECT TO authenticated
  USING (
    user_id = auth.uid()
    OR (user_id IS NULL AND get_user_role(auth.uid()) = 'admin' AND company_id = get_user_company_id(auth.uid()))
    OR (user_id IS NULL AND is_super_admin(auth.uid()) AND company_id = get_user_company_id(auth.uid()))
  );

-- Users can update (mark as read) their own notifications or company admin ones
CREATE POLICY "notifications_update" ON public.notifications
  FOR UPDATE TO authenticated
  USING (
    user_id = auth.uid()
    OR (user_id IS NULL AND get_user_role(auth.uid()) = 'admin' AND company_id = get_user_company_id(auth.uid()))
    OR (user_id IS NULL AND is_super_admin(auth.uid()))
  );

-- Any authenticated user in the company can insert notifications
CREATE POLICY "notifications_insert" ON public.notifications
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

-- Enable realtime
ALTER PUBLICATION supabase_realtime ADD TABLE public.notifications;

-- Add notification_preferences to profiles
ALTER TABLE public.profiles ADD COLUMN IF NOT EXISTS notification_preferences jsonb DEFAULT '{"expense_submitted":true,"expense_approved":true,"expense_rejected":true,"expense_paid":true,"policy_violation":true,"budget_warning":true,"budget_exceeded":true,"sync_complete":true,"trip_budget_warning":true}'::jsonb;
