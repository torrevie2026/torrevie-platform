
-- =============================================
-- SARIF: Multi-Tenant Expense Management Schema
-- =============================================

-- 1. REFERENCE TABLES (global, no RLS)

CREATE TABLE public.country_configs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  country_code text UNIQUE NOT NULL,
  country_name text NOT NULL,
  base_currency text NOT NULL,
  currency_name text NOT NULL,
  currency_symbol text NOT NULL,
  vat_rate decimal NOT NULL DEFAULT 0,
  vat_rate_reduced decimal,
  tax_name text DEFAULT 'VAT',
  tax_authority_name text,
  tax_id_label text DEFAULT 'VAT Number',
  has_vat boolean DEFAULT true,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.currency_pegs (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  from_currency text NOT NULL,
  to_currency text NOT NULL DEFAULT 'USD',
  rate decimal NOT NULL,
  notes text,
  effective_from date NOT NULL
);

-- 2. CORE MULTI-TENANT TABLES

CREATE TABLE public.companies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  country_code text NOT NULL,
  base_currency text NOT NULL,
  vat_rate_override decimal,
  tax_registration_number text,
  plan text DEFAULT 'trial',
  trial_expires_at timestamptz,
  stripe_customer_id text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.profiles (
  id uuid PRIMARY KEY REFERENCES auth.users ON DELETE CASCADE,
  company_id uuid REFERENCES public.companies,
  full_name text,
  role text DEFAULT 'employee',
  super_admin boolean DEFAULT false,
  avatar_url text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.employees (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies NOT NULL,
  name text NOT NULL,
  phone_number text NOT NULL,
  department text,
  is_active boolean DEFAULT true,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, phone_number)
);

CREATE TABLE public.trips (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies NOT NULL,
  name text NOT NULL,
  description text,
  budget_aed decimal,
  start_date date,
  end_date date,
  status text DEFAULT 'open',
  created_by uuid REFERENCES public.profiles,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.expenses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies NOT NULL,
  employee_id uuid REFERENCES public.employees,
  vendor text,
  date date NOT NULL,
  amount decimal NOT NULL,
  currency text NOT NULL,
  base_amount decimal,
  exchange_rate decimal,
  category text,
  expense_type text DEFAULT 'receipt',
  payment_method text,
  trip_id uuid REFERENCES public.trips,
  trip_name text,
  employee_name text,
  employee_phone text,
  notes text,
  tax_id_number text,
  tax_amount decimal,
  receipt_image_url text,
  status text DEFAULT 'pending',
  source text DEFAULT 'web',
  policy_flag boolean DEFAULT false,
  policy_flag_reason text,
  approved_by uuid REFERENCES public.profiles,
  approved_at timestamptz,
  rejected_reason text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.spend_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies NOT NULL,
  category text NOT NULL,
  daily_limit decimal,
  monthly_limit decimal,
  requires_notes_above decimal,
  is_blocked boolean DEFAULT false,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.budgets (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies NOT NULL,
  department text NOT NULL,
  month integer NOT NULL,
  year integer NOT NULL,
  budget_amount decimal NOT NULL,
  created_at timestamptz DEFAULT now(),
  UNIQUE(company_id, department, month, year)
);

CREATE TABLE public.fx_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  date date NOT NULL,
  from_currency text NOT NULL,
  to_currency text NOT NULL,
  rate decimal NOT NULL,
  is_manual_override boolean DEFAULT false,
  created_at timestamptz DEFAULT now(),
  UNIQUE(date, from_currency, to_currency)
);

CREATE TABLE public.audit_log (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies,
  user_id uuid REFERENCES public.profiles,
  action text NOT NULL,
  table_name text NOT NULL,
  record_id uuid,
  old_values jsonb,
  new_values jsonb,
  ip_address text,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.erp_connections (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies NOT NULL,
  erp_type text,
  base_url text,
  is_active boolean DEFAULT false,
  last_sync_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE public.per_diem_rates (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  company_id uuid REFERENCES public.companies NOT NULL,
  destination text NOT NULL,
  daily_rate decimal NOT NULL,
  currency text NOT NULL,
  created_at timestamptz DEFAULT now()
);

-- 3. SECURITY DEFINER HELPER FUNCTIONS (avoid RLS recursion)

CREATE OR REPLACE FUNCTION public.get_user_company_id(_user_id uuid)
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT company_id FROM public.profiles WHERE id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.get_user_role(_user_id uuid)
RETURNS text
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT role FROM public.profiles WHERE id = _user_id;
$$;

CREATE OR REPLACE FUNCTION public.is_super_admin(_user_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT COALESCE(super_admin, false) FROM public.profiles WHERE id = _user_id;
$$;

-- 4. ENABLE RLS ON ALL COMPANY-SCOPED TABLES

ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.employees ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.trips ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.expenses ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.spend_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.budgets ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.fx_rates ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.audit_log ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.erp_connections ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.per_diem_rates ENABLE ROW LEVEL SECURITY;

-- 5. RLS POLICIES

-- == companies ==
CREATE POLICY "Users can view their own company"
  ON public.companies FOR SELECT
  USING (id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

CREATE POLICY "Super admins can insert companies"
  ON public.companies FOR INSERT
  WITH CHECK (public.is_super_admin(auth.uid()) OR true);

CREATE POLICY "Admins can update their own company"
  ON public.companies FOR UPDATE
  USING (id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- == profiles ==
CREATE POLICY "Users can view own profile"
  ON public.profiles FOR SELECT
  USING (
    id = auth.uid()
    OR (public.get_user_role(auth.uid()) = 'admin' AND company_id = public.get_user_company_id(auth.uid()))
    OR public.is_super_admin(auth.uid())
  );

CREATE POLICY "Users can insert own profile"
  ON public.profiles FOR INSERT
  WITH CHECK (id = auth.uid());

CREATE POLICY "Users can update own profile"
  ON public.profiles FOR UPDATE
  USING (
    id = auth.uid()
    OR public.is_super_admin(auth.uid())
  );

-- == employees ==
CREATE POLICY "employees_select" ON public.employees FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "employees_insert" ON public.employees FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "employees_update" ON public.employees FOR UPDATE
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "employees_delete" ON public.employees FOR DELETE
  USING (
    (public.get_user_role(auth.uid()) = 'admin' AND company_id = public.get_user_company_id(auth.uid()))
    OR public.is_super_admin(auth.uid())
  );

-- == trips ==
CREATE POLICY "trips_select" ON public.trips FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "trips_insert" ON public.trips FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "trips_update" ON public.trips FOR UPDATE
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "trips_delete" ON public.trips FOR DELETE
  USING (
    (public.get_user_role(auth.uid()) = 'admin' AND company_id = public.get_user_company_id(auth.uid()))
    OR public.is_super_admin(auth.uid())
  );

-- == expenses ==
CREATE POLICY "expenses_select" ON public.expenses FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "expenses_insert" ON public.expenses FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "expenses_update" ON public.expenses FOR UPDATE
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "expenses_delete" ON public.expenses FOR DELETE
  USING (
    (public.get_user_role(auth.uid()) = 'admin' AND company_id = public.get_user_company_id(auth.uid()))
    OR public.is_super_admin(auth.uid())
  );

-- == spend_policies ==
CREATE POLICY "spend_policies_select" ON public.spend_policies FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "spend_policies_insert" ON public.spend_policies FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "spend_policies_update" ON public.spend_policies FOR UPDATE
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "spend_policies_delete" ON public.spend_policies FOR DELETE
  USING (
    (public.get_user_role(auth.uid()) = 'admin' AND company_id = public.get_user_company_id(auth.uid()))
    OR public.is_super_admin(auth.uid())
  );

-- == budgets ==
CREATE POLICY "budgets_select" ON public.budgets FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "budgets_insert" ON public.budgets FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "budgets_update" ON public.budgets FOR UPDATE
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "budgets_delete" ON public.budgets FOR DELETE
  USING (
    (public.get_user_role(auth.uid()) = 'admin' AND company_id = public.get_user_company_id(auth.uid()))
    OR public.is_super_admin(auth.uid())
  );

-- == fx_rates (global read, company-scoped write) ==
CREATE POLICY "fx_rates_select" ON public.fx_rates FOR SELECT
  USING (true);
CREATE POLICY "fx_rates_insert" ON public.fx_rates FOR INSERT
  WITH CHECK (public.get_user_role(auth.uid()) = 'admin' OR public.is_super_admin(auth.uid()));
CREATE POLICY "fx_rates_update" ON public.fx_rates FOR UPDATE
  USING (public.get_user_role(auth.uid()) = 'admin' OR public.is_super_admin(auth.uid()));

-- == audit_log (INSERT only, SELECT for admins) ==
CREATE POLICY "audit_log_insert" ON public.audit_log FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "audit_log_select" ON public.audit_log FOR SELECT
  USING (
    (public.get_user_role(auth.uid()) = 'admin' AND company_id = public.get_user_company_id(auth.uid()))
    OR public.is_super_admin(auth.uid())
  );

-- == erp_connections ==
CREATE POLICY "erp_connections_select" ON public.erp_connections FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "erp_connections_insert" ON public.erp_connections FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "erp_connections_update" ON public.erp_connections FOR UPDATE
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- == per_diem_rates ==
CREATE POLICY "per_diem_rates_select" ON public.per_diem_rates FOR SELECT
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));
CREATE POLICY "per_diem_rates_insert" ON public.per_diem_rates FOR INSERT
  WITH CHECK (company_id = public.get_user_company_id(auth.uid()));
CREATE POLICY "per_diem_rates_update" ON public.per_diem_rates FOR UPDATE
  USING (company_id = public.get_user_company_id(auth.uid()) OR public.is_super_admin(auth.uid()));

-- 6. AUTH TRIGGER: auto-create profile on signup

CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO public.profiles (id, full_name)
  VALUES (NEW.id, COALESCE(NEW.raw_user_meta_data->>'full_name', ''));
  RETURN NEW;
END;
$$;

CREATE TRIGGER on_auth_user_created
  AFTER INSERT ON auth.users
  FOR EACH ROW
  EXECUTE FUNCTION public.handle_new_user();
