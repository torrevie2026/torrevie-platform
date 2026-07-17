
-- Trip currency enforcement
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS enforce_currency boolean DEFAULT false;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS enforced_currency text;
ALTER TABLE public.trips ADD COLUMN IF NOT EXISTS team_id uuid;

-- Original currency tracking on expenses
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS original_currency text;
ALTER TABLE public.expenses ADD COLUMN IF NOT EXISTS original_amount numeric;

-- Teams table
CREATE TABLE public.teams (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies(id) ON DELETE CASCADE NOT NULL,
  name text NOT NULL,
  description text,
  manager_id uuid REFERENCES public.employees(id) ON DELETE SET NULL,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.teams ENABLE ROW LEVEL SECURITY;

CREATE POLICY "teams_select" ON public.teams
  FOR SELECT TO authenticated
  USING (company_id = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "teams_insert" ON public.teams
  FOR INSERT TO authenticated
  WITH CHECK (company_id = get_user_company_id(auth.uid()));

CREATE POLICY "teams_update" ON public.teams
  FOR UPDATE TO authenticated
  USING ((get_user_role(auth.uid()) = 'admin' AND company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

CREATE POLICY "teams_delete" ON public.teams
  FOR DELETE TO authenticated
  USING ((get_user_role(auth.uid()) = 'admin' AND company_id = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- Team members join table
CREATE TABLE public.team_members (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  team_id uuid REFERENCES public.teams(id) ON DELETE CASCADE NOT NULL,
  employee_id uuid REFERENCES public.employees(id) ON DELETE CASCADE NOT NULL,
  joined_at timestamptz DEFAULT now(),
  UNIQUE(team_id, employee_id)
);

ALTER TABLE public.team_members ENABLE ROW LEVEL SECURITY;

-- For team_members, derive company from team
CREATE OR REPLACE FUNCTION public.get_team_company_id(_team_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.teams WHERE id = _team_id;
$$;

CREATE POLICY "team_members_select" ON public.team_members
  FOR SELECT TO authenticated
  USING (get_team_company_id(team_id) = get_user_company_id(auth.uid()) OR is_super_admin(auth.uid()));

CREATE POLICY "team_members_insert" ON public.team_members
  FOR INSERT TO authenticated
  WITH CHECK (get_team_company_id(team_id) = get_user_company_id(auth.uid()));

CREATE POLICY "team_members_update" ON public.team_members
  FOR UPDATE TO authenticated
  USING ((get_user_role(auth.uid()) = 'admin' AND get_team_company_id(team_id) = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

CREATE POLICY "team_members_delete" ON public.team_members
  FOR DELETE TO authenticated
  USING ((get_user_role(auth.uid()) = 'admin' AND get_team_company_id(team_id) = get_user_company_id(auth.uid())) OR is_super_admin(auth.uid()));

-- Add FK for trips.team_id
ALTER TABLE public.trips ADD CONSTRAINT trips_team_id_fkey FOREIGN KEY (team_id) REFERENCES public.teams(id) ON DELETE SET NULL;
