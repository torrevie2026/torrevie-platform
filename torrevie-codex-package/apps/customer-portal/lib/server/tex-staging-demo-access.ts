import { Client } from "pg";

export const texStagingDemoAccess = {
  email: "tex.staging.viewer@torrevie.test",
  password: "test1234",
  userId: "20000000-0000-4000-8000-00000000e001",
  tenantId: "20000000-0000-4000-8000-00000001e001",
  profileId: "20000000-0000-4000-8000-00000002e001",
  employeeId: "20000000-0000-4000-8000-00000003e001",
  teamId: "20000000-0000-4000-8000-00000004e001"
} as const;

export function isTexStagingDemoCredential(email: string, password: string) {
  return (
    email.trim().toLowerCase() === texStagingDemoAccess.email &&
    password === texStagingDemoAccess.password
  );
}

export function assertTexStagingDemoAccessAllowed(hostname: string | null) {
  const normalizedHostname = hostname?.split(":")[0]?.toLowerCase() ?? "";
  if (
    process.env.VERCEL_ENV !== "preview" ||
    normalizedHostname === "tex1.torrevie.com" ||
    normalizedHostname === "app.torrevie.com"
  ) {
    throw new Error("TEX staging demo access is only enabled on Vercel preview deployments.");
  }
}

export async function ensureTexStagingDemoAccess() {
  await ensureAuthUser();
  await seedPlatformRecords();

  return {
    email: texStagingDemoAccess.email,
    password: texStagingDemoAccess.password,
    status: "ready"
  };
}

async function ensureAuthUser() {
  const body = {
    id: texStagingDemoAccess.userId,
    email: texStagingDemoAccess.email,
    password: texStagingDemoAccess.password,
    email_confirm: true,
    user_metadata: { name: "TEX Staging Viewer" }
  };

  const createResponse = await supabaseAdminFetch("/auth/v1/admin/users", {
    method: "POST",
    body: JSON.stringify(body)
  });

  if (createResponse.ok) {
    return;
  }

  const updateResponse = await supabaseAdminFetch(
    `/auth/v1/admin/users/${texStagingDemoAccess.userId}`,
    {
      method: "PUT",
      body: JSON.stringify(body)
    }
  );

  if (!updateResponse.ok) {
    const detail = await updateResponse.text();
    if (createResponse.status === 401 || createResponse.status === 403 || updateResponse.status === 401 || updateResponse.status === 403) {
      await ensureAuthUserViaDatabase();
      return;
    }

    throw new Error(`Unable to create or update Supabase Auth user: ${updateResponse.status} ${detail}`);
  }
}

async function ensureAuthUserViaDatabase() {
  const client = new Client({
    connectionString: requireEnv("DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL"),
    ssl: process.env.TORREVIE_DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
  });
  await client.connect();

  try {
    await client.query("begin");
    await client.query("create extension if not exists pgcrypto");
    await client.query(
      `
        insert into auth.users (
          instance_id,
          id,
          aud,
          role,
          email,
          encrypted_password,
          email_confirmed_at,
          raw_app_meta_data,
          raw_user_meta_data,
          created_at,
          updated_at,
          confirmation_token,
          recovery_token,
          email_change_token_new,
          email_change_token_current,
          email_change_confirm_status,
          is_sso_user,
          is_anonymous
        )
        values (
          '00000000-0000-0000-0000-000000000000',
          $1,
          'authenticated',
          'authenticated',
          $2,
          crypt($3, gen_salt('bf')),
          now(),
          '{"provider":"email","providers":["email"]}'::jsonb,
          '{"name":"TEX Staging Viewer"}'::jsonb,
          now(),
          now(),
          '',
          '',
          '',
          '',
          0,
          false,
          false
        )
        on conflict (id) do update set
          email = excluded.email,
          encrypted_password = excluded.encrypted_password,
          email_confirmed_at = now(),
          raw_app_meta_data = excluded.raw_app_meta_data,
          raw_user_meta_data = excluded.raw_user_meta_data,
          updated_at = now(),
          is_sso_user = false,
          is_anonymous = false
      `,
      [texStagingDemoAccess.userId, texStagingDemoAccess.email, texStagingDemoAccess.password]
    );
    await client.query(
      `
        insert into auth.identities (
          id,
          provider_id,
          user_id,
          identity_data,
          provider,
          last_sign_in_at,
          created_at,
          updated_at
        )
        values (
          gen_random_uuid(),
          $1,
          $1,
          jsonb_build_object(
            'sub', $1::text,
            'email', $2::text,
            'email_verified', true,
            'phone_verified', false
          ),
          'email',
          now(),
          now(),
          now()
        )
        on conflict (provider_id, provider) do update set
          user_id = excluded.user_id,
          identity_data = excluded.identity_data,
          updated_at = now()
      `,
      [texStagingDemoAccess.userId, texStagingDemoAccess.email]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

async function seedPlatformRecords() {
  const client = new Client({
    connectionString: requireEnv("DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL"),
    ssl: process.env.TORREVIE_DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
  });
  await client.connect();

  try {
    await client.query("begin");
    await client.query(
      `
        insert into public.users (id, email, status)
        values ($1, $2, 'active')
        on conflict (id) do update set email = excluded.email, status = 'active'
      `,
      [texStagingDemoAccess.userId, texStagingDemoAccess.email]
    );
    await client.query(
      `
        insert into public.tenants (id, name, slug, status, region, legal_entity_name, billing_email)
        values ($1, 'TEX Staging Demo Tenant', 'tex-staging-demo', 'active', 'UAE', 'TEX Staging Demo LLC', $2)
        on conflict (id) do update set name = excluded.name, status = 'active', billing_email = excluded.billing_email
      `,
      [texStagingDemoAccess.tenantId, texStagingDemoAccess.email]
    );
    await client.query(
      `
        insert into public.tenant_settings (tenant_id, default_locale, timezone)
        values ($1, 'en', 'Asia/Dubai')
        on conflict (tenant_id) do update set default_locale = excluded.default_locale, timezone = excluded.timezone
      `,
      [texStagingDemoAccess.tenantId]
    );
    await client.query(
      `
        insert into public.tenant_memberships (tenant_id, user_id, status, joined_at)
        values ($1, $2, 'active', now())
        on conflict (tenant_id, user_id) do update set status = 'active', joined_at = coalesce(public.tenant_memberships.joined_at, now())
      `,
      [texStagingDemoAccess.tenantId, texStagingDemoAccess.userId]
    );
    await client.query(
      `
        insert into public.user_profiles (
          id, tenant_id, user_id, display_name, locale, require_profile_completion, require_password_change, require_mfa
        )
        values ($1, $2, $3, 'TEX Staging Viewer', 'en', false, false, false)
        on conflict (tenant_id, user_id) do update set
          display_name = excluded.display_name,
          locale = excluded.locale,
          require_profile_completion = false,
          require_password_change = false,
          require_mfa = false
      `,
      [texStagingDemoAccess.profileId, texStagingDemoAccess.tenantId, texStagingDemoAccess.userId]
    );
    await client.query(
      `
        insert into public.user_role_assignments (tenant_id, user_id, role_id)
        select $1, $2, id from public.roles where key = 'customer_admin'
        on conflict do nothing
      `,
      [texStagingDemoAccess.tenantId, texStagingDemoAccess.userId]
    );
    await client.query(
      `
        insert into public.subscriptions (tenant_id, product_id, plan_id, status, starts_at)
        select $1, products.id, plans.id, 'active', now() - interval '1 day'
        from public.products
        join public.plans on plans.product_id = products.id and plans.key = 'growth'
        where products.key = 'tex'
        on conflict (tenant_id, product_id) do update set status = 'active', starts_at = excluded.starts_at, expires_at = null
      `,
      [texStagingDemoAccess.tenantId]
    );
    await client.query(
      `
        insert into public.tex_employee_profiles (
          id, tenant_id, user_id, name, phone_number, department, monthly_salary, manager_user_id, submission_frequency, is_active
        )
        values ($1, $2, $3, 'TEX Staging Viewer', '+971500009001', 'Operations', 12000, $3, 'realtime', true)
        on conflict (tenant_id, phone_number) do update set
          user_id = excluded.user_id,
          name = excluded.name,
          department = excluded.department,
          monthly_salary = excluded.monthly_salary,
          manager_user_id = excluded.manager_user_id,
          submission_frequency = excluded.submission_frequency,
          is_active = true
      `,
      [
        texStagingDemoAccess.employeeId,
        texStagingDemoAccess.tenantId,
        texStagingDemoAccess.userId
      ]
    );
    await client.query(
      `
        insert into public.tex_teams (id, tenant_id, name, description, manager_employee_profile_id)
        values ($1, $2, 'Staging Operations', 'TEX staging validation team', $3)
        on conflict (tenant_id, name) do update set description = excluded.description, manager_employee_profile_id = excluded.manager_employee_profile_id
      `,
      [texStagingDemoAccess.teamId, texStagingDemoAccess.tenantId, texStagingDemoAccess.employeeId]
    );
    await client.query(
      `
        insert into public.tex_team_members (tenant_id, team_id, employee_profile_id)
        values ($1, $2, $3)
        on conflict (team_id, employee_profile_id) do nothing
      `,
      [texStagingDemoAccess.tenantId, texStagingDemoAccess.teamId, texStagingDemoAccess.employeeId]
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

function requireEnv(...names: string[]) {
  for (const name of names) {
    const value = process.env[name]?.trim();
    if (value) {
      return value;
    }
  }

  throw new Error(`Missing required environment variable: ${names.join(" or ")}`);
}
