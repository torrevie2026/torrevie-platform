import { randomBytes, randomUUID } from "crypto";
import { Client } from "pg";

const allowedCountries = new Set(["AE", "SA", "QA", "BH", "KW", "OM"]);
const defaultCategories = ["Fuel", "Toll", "Parking", "Meals", "Maintenance", "Other"];
const texTrialDays = 15;
const texTrialEmployeeLimit = 5;

export type TexTrialInput = {
  adminName: string;
  companyName: string;
  country: string;
  email: string;
  password: string;
  phone: string;
  termsAccepted: boolean;
};

export async function createTexTrialTenant(rawInput: TexTrialInput) {
  const input = validateTrialInput(rawInput);
  const userId = randomUUID();
  const tenantId = randomUUID();
  const profileId = randomUUID();
  const employeeId = randomUUID();
  const teamId = randomUUID();
  const slug = buildTenantSlug(input.companyName);

  await createAuthUser({
    email: input.email,
    name: input.adminName,
    password: input.password,
    userId
  });

  try {
    await seedTrialTenant({
      employeeId,
      input,
      profileId,
      slug,
      teamId,
      tenantId,
      userId
    });
  } catch (error) {
    await deleteAuthUser(userId).catch(() => undefined);
    throw error;
  }

  return { email: input.email, tenantId, userId };
}

function validateTrialInput(input: TexTrialInput) {
  const email = input.email.toLowerCase();
  const country = input.country.toUpperCase();

  if (!input.termsAccepted) {
    throw new Error("trial_terms_required");
  }

  if (input.companyName.length < 2 || input.companyName.length > 120) {
    throw new Error("trial_company_invalid");
  }

  if (input.adminName.length < 2 || input.adminName.length > 120) {
    throw new Error("trial_admin_invalid");
  }

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("trial_email_invalid");
  }

  if (input.phone.length < 7 || input.phone.length > 32) {
    throw new Error("trial_phone_invalid");
  }

  if (!allowedCountries.has(country)) {
    throw new Error("trial_country_invalid");
  }

  if (input.password.length < 8) {
    throw new Error("trial_password_invalid");
  }

  return {
    adminName: input.adminName,
    companyName: input.companyName,
    country,
    email,
    password: input.password,
    phone: input.phone,
    termsAccepted: true
  };
}

async function createAuthUser(input: {
  email: string;
  name: string;
  password: string;
  userId: string;
}) {
  const response = await supabaseAdminFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify({
      id: input.userId,
      email: input.email,
      password: input.password,
      email_confirm: true,
      user_metadata: { name: input.name }
    })
  });

  if (!response.ok) {
    const detail = await response.text();
    if (response.status === 422 || detail.toLowerCase().includes("already")) {
      throw new Error("existing_email");
    }

    throw new Error("trial_auth_failed");
  }
}

async function deleteAuthUser(userId: string) {
  await supabaseAdminFetch(`/auth/v1/admin/users/${userId}`, {
    method: "DELETE"
  });
}

async function seedTrialTenant(input: {
  employeeId: string;
  input: ReturnType<typeof validateTrialInput>;
  profileId: string;
  slug: string;
  teamId: string;
  tenantId: string;
  userId: string;
}) {
  const client = new Client({
    connectionString: requireEnv("DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL"),
    ssl: process.env.TORREVIE_DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
  });
  await client.connect();

  try {
    await client.query("begin");
    await client.query("select set_config('app.platform_service_role', 'true', true)");
    await client.query("select set_config('app.current_tenant_id', $1, true)", [input.tenantId]);
    await client.query(
      `
        insert into public.users (id, email, status, created_by, updated_by)
        values ($1, $2, 'active', $1, $1)
      `,
      [input.userId, input.input.email]
    );
    await client.query(
      `
        insert into public.tenants (
          id, name, slug, status, region, legal_entity_name, billing_email, created_by, updated_by
        )
        values ($1, $2, $3, 'trial', $4, $2, $5, $6, $6)
      `,
      [
        input.tenantId,
        input.input.companyName,
        input.slug,
        input.input.country,
        input.input.email,
        input.userId
      ]
    );
    await client.query(
      `
        insert into public.tenant_settings (
          tenant_id, default_locale, timezone, created_by, updated_by
        )
        values ($1, 'en', 'Asia/Dubai', $2, $2)
      `,
      [input.tenantId, input.userId]
    );
    await client.query(
      `
        insert into public.tenant_memberships (
          tenant_id, user_id, status, joined_at, created_by, updated_by
        )
        values ($1, $2, 'active', now(), $2, $2)
      `,
      [input.tenantId, input.userId]
    );
    await client.query(
      `
        insert into public.user_profiles (
          id, tenant_id, user_id, display_name, locale,
          require_profile_completion, require_password_change, require_mfa,
          created_by, updated_by
        )
        values ($1, $2, $3, $4, 'en', false, false, false, $3, $3)
      `,
      [input.profileId, input.tenantId, input.userId, input.input.adminName]
    );
    await client.query(
      `
        insert into public.user_role_assignments (tenant_id, user_id, role_id, assigned_by, created_by, updated_by)
        select $1, $2, id, $2, $2, $2
        from public.roles
        where key = 'customer_admin'
      `,
      [input.tenantId, input.userId]
    );
    await client.query(
      `
        with tex_subscription as (
          insert into public.subscriptions (
            tenant_id, product_id, plan_id, status, starts_at, expires_at, created_by, updated_by
          )
          select $1, products.id, plans.id, 'trial', now(), now() + ($3::int * interval '1 day'), $2, $2
          from public.products
          join public.plans on plans.product_id = products.id and plans.key = 'trial'
          where products.key = 'tex'
          on conflict (tenant_id, product_id) do update set
            plan_id = excluded.plan_id,
            status = 'trial',
            starts_at = coalesce(public.subscriptions.starts_at, excluded.starts_at),
            expires_at = excluded.expires_at,
            updated_by = excluded.updated_by
          returning id
        )
        insert into public.tex_plan_controls (
          tenant_id,
          subscription_id,
          plan_key,
          plan_status,
          trial_start_date,
          trial_end_date,
          employee_limit,
          seat_count,
          whatsapp_provider_scope,
          billing_status,
          created_by,
          updated_by
        )
        select
          $1,
          tex_subscription.id,
          'trial',
          'trialing',
          current_date,
          current_date + $3::integer,
          $4,
          1,
          'torrevie_managed',
          'manual_invoice_pending',
          $2,
          $2
        from tex_subscription
        on conflict (tenant_id) do update set
          subscription_id = excluded.subscription_id,
          plan_key = excluded.plan_key,
          plan_status = excluded.plan_status,
          trial_start_date = coalesce(public.tex_plan_controls.trial_start_date, excluded.trial_start_date),
          trial_end_date = excluded.trial_end_date,
          employee_limit = excluded.employee_limit,
          seat_count = excluded.seat_count,
          whatsapp_provider_scope = excluded.whatsapp_provider_scope,
          billing_status = excluded.billing_status,
          updated_by = excluded.updated_by
      `,
      [input.tenantId, input.userId, texTrialDays, texTrialEmployeeLimit]
    );
    await client.query(
      `
        insert into public.tex_employee_profiles (
          id, tenant_id, user_id, name, phone_number, department, monthly_salary,
          manager_user_id, submission_frequency, is_active, created_by, updated_by
        )
        values ($1, $2, $3, $4, $5, 'Administration', 0, $3, 'realtime', true, $3, $3)
      `,
      [
        input.employeeId,
        input.tenantId,
        input.userId,
        input.input.adminName,
        input.input.phone
      ]
    );
    await client.query(
      `
        insert into public.tex_teams (
          id, tenant_id, name, description, manager_employee_profile_id, created_by, updated_by
        )
        values ($1, $2, 'Default Team', 'Created during TEX Starter trial onboarding.', $3, $4, $4)
      `,
      [input.teamId, input.tenantId, input.employeeId, input.userId]
    );
    await client.query(
      `
        insert into public.tex_team_members (
          tenant_id, team_id, employee_profile_id, created_by, updated_by
        )
        values ($1, $2, $3, $4, $4)
      `,
      [input.tenantId, input.teamId, input.employeeId, input.userId]
    );
    await client.query(
      `
        insert into public.tex_expense_categories (
          tenant_id, name, is_active, is_system, sort_order, created_by, updated_by
        )
        select $1, category.name, true, true, category.sort_order, $2, $2
        from unnest($3::text[]) with ordinality as category(name, sort_order)
      `,
      [input.tenantId, input.userId, defaultCategories]
    );
    await client.query(
      `
        insert into public.tex_integration_settings (tenant_id, created_by, updated_by)
        values ($1, $2, $2)
      `,
      [input.tenantId, input.userId]
    );
    await client.query(
      `
        insert into public.tex_onboarding_status (
          tenant_id,
          company_profile_completed_at,
          first_employee_invited_at,
          last_activity_at,
          created_by,
          updated_by
        )
        values ($1, now(), now(), now(), $2, $2)
        on conflict (tenant_id) do update set
          company_profile_completed_at = coalesce(
            public.tex_onboarding_status.company_profile_completed_at,
            excluded.company_profile_completed_at
          ),
          first_employee_invited_at = coalesce(
            public.tex_onboarding_status.first_employee_invited_at,
            excluded.first_employee_invited_at
          ),
          last_activity_at = excluded.last_activity_at,
          updated_by = excluded.updated_by
      `,
      [input.tenantId, input.userId]
    );
    await client.query(
      `
        insert into public.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
        values (
          $1,
          $2,
          'tex.trial.created',
          'tenant',
          $1,
          jsonb_build_object(
            'plan', 'trial',
            'trial_days', $4,
            'employee_limit', $5,
            'source', 'app.torrevie.com/tex',
            'country', $3
          )
        )
      `,
      [input.tenantId, input.userId, input.input.country, texTrialDays, texTrialEmployeeLimit]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

async function supabaseAdminFetch(path: string, init: RequestInit) {
  const supabaseUrl = requireEnv("NEXT_PUBLIC_SUPABASE_URL", "SUPABASE_URL").replace(/\/$/, "");
  const serviceRoleKey = requireEnv("SUPABASE_SERVICE_ROLE_KEY");

  return fetch(`${supabaseUrl}${path}`, {
    ...init,
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json",
      ...init.headers
    }
  });
}

function buildTenantSlug(companyName: string) {
  const baseSlug = companyName
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .slice(0, 42) || "tex-trial";

  return `${baseSlug}-${randomBytes(3).toString("hex")}`;
}

function requireEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}
