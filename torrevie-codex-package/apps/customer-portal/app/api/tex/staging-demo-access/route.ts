import { Client } from "pg";
import { NextResponse, type NextRequest } from "next/server";

export const runtime = "nodejs";

const demoAccess = {
  email: "tex.staging.viewer@torrevie.test",
  password: "test1234",
  userId: "20000000-0000-4000-8000-00000000e001",
  tenantId: "20000000-0000-4000-8000-00000001e001",
  profileId: "20000000-0000-4000-8000-00000002e001",
  employeeId: "20000000-0000-4000-8000-00000003e001",
  teamId: "20000000-0000-4000-8000-00000004e001"
};

export async function GET(request: NextRequest) {
  const hostname = request.nextUrl.hostname.toLowerCase();
  if (process.env.VERCEL_ENV === "production" || hostname === "tex1.torrevie.com") {
    return NextResponse.json({ error: "Staging demo access is disabled here." }, { status: 403 });
  }

  try {
    await ensureAuthUser();
    await seedPlatformRecords();

    return NextResponse.json({
      email: demoAccess.email,
      password: demoAccess.password,
      status: "ready"
    });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to create demo access." },
      { status: 500 }
    );
  }
}

async function ensureAuthUser() {
  const body = {
    id: demoAccess.userId,
    email: demoAccess.email,
    password: demoAccess.password,
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

  const updateResponse = await supabaseAdminFetch(`/auth/v1/admin/users/${demoAccess.userId}`, {
    method: "PUT",
    body: JSON.stringify(body)
  });

  if (!updateResponse.ok) {
    const detail = await updateResponse.text();
    throw new Error(`Unable to create or update Supabase Auth user: ${updateResponse.status} ${detail}`);
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
      [demoAccess.userId, demoAccess.email]
    );
    await client.query(
      `
        insert into public.tenants (id, name, slug, status, region, legal_entity_name, billing_email)
        values ($1, 'TEX Staging Demo Tenant', 'tex-staging-demo', 'active', 'UAE', 'TEX Staging Demo LLC', $2)
        on conflict (id) do update set name = excluded.name, status = 'active', billing_email = excluded.billing_email
      `,
      [demoAccess.tenantId, demoAccess.email]
    );
    await client.query(
      `
        insert into public.tenant_settings (tenant_id, default_locale, timezone)
        values ($1, 'en', 'Asia/Dubai')
        on conflict (tenant_id) do update set default_locale = excluded.default_locale, timezone = excluded.timezone
      `,
      [demoAccess.tenantId]
    );
    await client.query(
      `
        insert into public.tenant_memberships (tenant_id, user_id, status, joined_at)
        values ($1, $2, 'active', now())
        on conflict (tenant_id, user_id) do update set status = 'active', joined_at = coalesce(public.tenant_memberships.joined_at, now())
      `,
      [demoAccess.tenantId, demoAccess.userId]
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
      [demoAccess.profileId, demoAccess.tenantId, demoAccess.userId]
    );
    await client.query(
      `
        insert into public.user_role_assignments (tenant_id, user_id, role_id)
        select $1, $2, id from public.roles where key = 'customer_admin'
        on conflict do nothing
      `,
      [demoAccess.tenantId, demoAccess.userId]
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
      [demoAccess.tenantId]
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
      [demoAccess.employeeId, demoAccess.tenantId, demoAccess.userId]
    );
    await client.query(
      `
        insert into public.tex_teams (id, tenant_id, name, description, manager_employee_profile_id)
        values ($1, $2, 'Staging Operations', 'TEX staging validation team', $3)
        on conflict (tenant_id, name) do update set description = excluded.description, manager_employee_profile_id = excluded.manager_employee_profile_id
      `,
      [demoAccess.teamId, demoAccess.tenantId, demoAccess.employeeId]
    );
    await client.query(
      `
        insert into public.tex_team_members (tenant_id, team_id, employee_profile_id)
        values ($1, $2, $3)
        on conflict (team_id, employee_profile_id) do nothing
      `,
      [demoAccess.tenantId, demoAccess.teamId, demoAccess.employeeId]
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
