import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { readFileSync, existsSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { Client } from "pg";

const localSupabaseUrl = "http://127.0.0.1:54321";

const smoke = {
  userId: "10000000-0000-4000-8000-00000000e001",
  tenantId: "10000000-0000-4000-8000-00000001e001",
  profileId: "10000000-0000-4000-8000-00000002e001",
  employeeId: "10000000-0000-4000-8000-00000003e001",
  teamId: "10000000-0000-4000-8000-00000004e001",
  tripId: "10000000-0000-4000-8000-00000005e001",
  legId: "10000000-0000-4000-8000-00000006e001",
  pendingExpenseId: "10000000-0000-4000-8000-00000007e001",
  approvedExpenseId: "10000000-0000-4000-8000-00000007e002",
  submissionId: "10000000-0000-4000-8000-00000008e001",
  email: "tex.browser.smoke.v2@example.test",
  password: `Torrevie-local-${randomUUID()}!`
};

loadLocalEnv();

const localSupabaseStatus = readLocalSupabaseStatus();
const supabaseUrl =
  process.env.NEXT_PUBLIC_SUPABASE_URL || localSupabaseStatus.API_URL || localSupabaseUrl;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || localSupabaseStatus.ANON_KEY;
const serviceRoleKey =
  process.env.SUPABASE_SERVICE_ROLE_KEY || localSupabaseStatus.SERVICE_ROLE_KEY;
const databaseUrl =
  process.env.DATABASE_URL ||
  process.env.POSTGRES_URL ||
  process.env.SUPABASE_DB_URL ||
  localSupabaseStatus.DB_URL;

if (!anonKey || !serviceRoleKey || !databaseUrl) {
  throw new Error("Local Supabase status did not provide anon, service-role, and database values.");
}

assertLocalUrl(supabaseUrl, "NEXT_PUBLIC_SUPABASE_URL");
assertLocalDatabaseUrl(databaseUrl);

process.env.NEXT_PUBLIC_SUPABASE_URL = supabaseUrl;
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = anonKey;
process.env.SUPABASE_SERVICE_ROLE_KEY = serviceRoleKey;
process.env.DATABASE_URL = databaseUrl;
process.env.TORREVIE_DATABASE_SSL = "false";
process.env.NEXT_PUBLIC_APP_ENV = process.env.NEXT_PUBLIC_APP_ENV || "local";

const smokePort = await findAvailablePort(Number(process.env.TEX_BROWSER_SMOKE_PORT ?? 3100));
const rootUrl = `http://127.0.0.1:${smokePort}`;

await ensureAuthUser();
await seedTexWorkspace();

const server = startCustomerPortal(smokePort);

try {
  console.log(`Starting customer portal smoke server at ${rootUrl}.`);
  await waitForServer();
  console.log("Customer portal smoke server is ready.");
  const cookieHeader = await signInCookieHeader();
  console.log("Local TEX smoke user authenticated.");
  await assertTexPage("/en/tex", cookieHeader, [
    "Travel and expense operations",
    "TEX entitlement active",
    "Pending",
    "Approved",
    "Local Logistics Run"
  ]);
  await assertTexPage("/ar/tex", cookieHeader, [
    'dir="rtl"',
    "Travel and expense operations",
    "TEX entitlement active"
  ]);
  console.log("TEX browser smoke test passed for /en/tex and /ar/tex.");
} finally {
  await stopServer(server);
}

function loadLocalEnv() {
  if (!existsSync(".env.local")) {
    return;
  }

  const lines = readFileSync(".env.local", "utf8").split(/\r?\n/);

  for (const line of lines) {
    const trimmed = line.trim();

    if (!trimmed || trimmed.startsWith("#")) {
      continue;
    }

    const separator = trimmed.indexOf("=");

    if (separator === -1) {
      continue;
    }

    const key = trimmed.slice(0, separator).trim();
    let value = trimmed.slice(separator + 1).trim();

    if (
      (value.startsWith('"') && value.endsWith('"')) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = process.env[key] || value;
  }
}

function readLocalSupabaseStatus() {
  try {
    const command = process.platform === "win32" ? "cmd" : "pnpm";
    const args =
      process.platform === "win32"
        ? ["/c", "pnpm", "exec", "supabase", "status"]
        : ["exec", "supabase", "status"];
    const output = execFileSync(command, args, {
      cwd: process.cwd(),
      encoding: "utf8",
      stdio: ["ignore", "pipe", "ignore"]
    });
    return JSON.parse(output);
  } catch {
    return {};
  }
}

function assertLocalUrl(value, name) {
  const url = new URL(value);

  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) &&
    process.env.TEX_BROWSER_SMOKE_ALLOW_REMOTE !== "1"
  ) {
    throw new Error(`${name} must point at localhost for TEX browser smoke tests.`);
  }
}

function assertLocalDatabaseUrl(value) {
  const url = new URL(value);

  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) &&
    process.env.TEX_BROWSER_SMOKE_ALLOW_REMOTE !== "1"
  ) {
    throw new Error("DATABASE_URL must point at localhost for TEX browser smoke tests.");
  }
}

async function ensureAuthUser() {
  const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/admin/users`, {
    method: "POST",
    headers: {
      apikey: serviceRoleKey,
      Authorization: `Bearer ${serviceRoleKey}`,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({
      id: smoke.userId,
      email: smoke.email,
      password: smoke.password,
      email_confirm: true,
      user_metadata: { name: "TEX Browser Smoke" }
    })
  });

  if (response.ok) {
    return;
  }

  const updateResponse = await fetchWithTimeout(
    `${supabaseUrl}/auth/v1/admin/users/${smoke.userId}`,
    {
      method: "PUT",
      headers: {
        apikey: serviceRoleKey,
        Authorization: `Bearer ${serviceRoleKey}`,
        "Content-Type": "application/json"
      },
      body: JSON.stringify({
        email: smoke.email,
        password: smoke.password,
        email_confirm: true,
        user_metadata: { name: "TEX Browser Smoke" }
      })
    }
  );

  if (!updateResponse.ok) {
    const detail = await updateResponse.text();
    throw new Error(
      `Unable to create local TEX smoke auth user: ${updateResponse.status} ${detail}`
    );
  }
}

async function seedTexWorkspace() {
  const client = new Client({ connectionString: databaseUrl });
  await client.connect();

  try {
    await client.query("begin");
    await client.query(
      `
        insert into public.users (id, email, status)
        values ($1, $2, 'active')
        on conflict (id) do update set email = excluded.email, status = 'active'
      `,
      [smoke.userId, smoke.email]
    );
    await client.query(
      `
        insert into public.tenants (id, name, slug, status, region, legal_entity_name, billing_email)
        values ($1, 'TEX Browser Smoke Tenant', 'tex-browser-smoke-v2', 'active', 'local', 'TEX Browser Smoke LLC', $2)
        on conflict (id) do update set name = excluded.name, status = 'active', billing_email = excluded.billing_email
      `,
      [smoke.tenantId, smoke.email]
    );
    await client.query(
      `
        insert into public.tenant_settings (tenant_id, default_locale, timezone)
        values ($1, 'en', 'Asia/Dubai')
        on conflict (tenant_id) do update set default_locale = excluded.default_locale, timezone = excluded.timezone
      `,
      [smoke.tenantId]
    );
    await client.query(
      `
        insert into public.tenant_memberships (tenant_id, user_id, status, joined_at)
        values ($1, $2, 'active', now())
        on conflict (tenant_id, user_id) do update set status = 'active', joined_at = coalesce(public.tenant_memberships.joined_at, now())
      `,
      [smoke.tenantId, smoke.userId]
    );
    await client.query(
      `
        insert into public.user_profiles (
          id, tenant_id, user_id, display_name, locale, require_profile_completion, require_password_change, require_mfa
        )
        values ($1, $2, $3, 'TEX Browser Smoke', 'en', false, false, false)
        on conflict (tenant_id, user_id) do update set
          display_name = excluded.display_name,
          locale = excluded.locale,
          require_profile_completion = false,
          require_password_change = false,
          require_mfa = false
      `,
      [smoke.profileId, smoke.tenantId, smoke.userId]
    );
    await client.query(
      `
        insert into public.user_role_assignments (tenant_id, user_id, role_id)
        select $1, $2, id from public.roles where key = 'customer_admin'
        on conflict do nothing
      `,
      [smoke.tenantId, smoke.userId]
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
      [smoke.tenantId]
    );
    await client.query(
      `
        insert into public.tex_employee_profiles (
          id, tenant_id, user_id, name, phone_number, department, monthly_salary, manager_user_id, submission_frequency, is_active
        )
        values ($1, $2, $3, 'TEX Browser Smoke', '+971500000001', 'Operations', 12000, $3, 'realtime', true)
        on conflict (tenant_id, phone_number) do update set
          user_id = excluded.user_id,
          name = excluded.name,
          department = excluded.department,
          monthly_salary = excluded.monthly_salary,
          manager_user_id = excluded.manager_user_id,
          submission_frequency = excluded.submission_frequency,
          is_active = true
      `,
      [smoke.employeeId, smoke.tenantId, smoke.userId]
    );
    await client.query(
      `
        insert into public.tex_teams (id, tenant_id, name, description, manager_employee_profile_id)
        values ($1, $2, 'Local Operations', 'Local browser smoke team', $3)
        on conflict (tenant_id, name) do update set description = excluded.description, manager_employee_profile_id = excluded.manager_employee_profile_id
      `,
      [smoke.teamId, smoke.tenantId, smoke.employeeId]
    );
    await client.query(
      `
        insert into public.tex_team_members (tenant_id, team_id, employee_profile_id)
        values ($1, $2, $3)
        on conflict (team_id, employee_profile_id) do nothing
      `,
      [smoke.tenantId, smoke.teamId, smoke.employeeId]
    );
    await client.query(
      `
        insert into public.tex_expense_categories (tenant_id, name, is_active, is_system, sort_order)
        values
          ($1, 'Fuel', true, true, 10),
          ($1, 'Meals', true, true, 20),
          ($1, 'Travel', true, true, 30)
        on conflict (tenant_id, name) do update set is_active = true, sort_order = excluded.sort_order
      `,
      [smoke.tenantId]
    );
    await client.query(
      `
        insert into public.tex_trips (
          id, tenant_id, name, description, trip_type, origin, destination, budget_amount, start_date, end_date, status,
          team_id, driver_employee_profile_id, driver_trip_amount, subcontractor_driver_name, subcontractor_amount
        )
        values ($1, $2, 'Local Logistics Run', 'Browser smoke logistics route', 'logistics', 'Dubai Port', 'Abu Dhabi Warehouse', 5000, current_date, current_date + interval '2 days', 'open', $3, $4, 750, 'Local Driver Partner', 200)
        on conflict (id) do update set name = excluded.name, status = 'open', team_id = excluded.team_id, driver_employee_profile_id = excluded.driver_employee_profile_id
      `,
      [smoke.tripId, smoke.tenantId, smoke.teamId, smoke.employeeId]
    );
    await client.query(
      `
        insert into public.tex_trip_legs (id, tenant_id, trip_id, sequence, origin, destination, mode, status, distance_km, total_distance_km, budget_amount)
        values ($1, $2, $3, 1, 'Dubai Port', 'Abu Dhabi Warehouse', 'road', 'planned', 145, 145, 1200)
        on conflict (tenant_id, trip_id, sequence) do update set origin = excluded.origin, destination = excluded.destination, mode = excluded.mode
      `,
      [smoke.legId, smoke.tenantId, smoke.tripId]
    );
    await client.query(
      `
        insert into public.tex_expenses (
          id, tenant_id, submitter_user_id, employee_profile_id, employee_name, employee_phone, vendor, expense_date,
          amount, currency, base_amount, exchange_rate, category, payment_method, trip_id, trip_leg_id, trip_name,
          notes, status, source, approved_by, approved_at
        )
        values
          ($1, $3, $4, $5, 'TEX Browser Smoke', '+971500000001', 'Local Fuel Station', current_date, 175, 'AED', 175, 1, 'Fuel', 'card', $6, $7, 'Local Logistics Run', 'Pending smoke expense', 'pending', 'web', null, null),
          ($2, $3, $4, $5, 'TEX Browser Smoke', '+971500000001', 'Airport Cafe', current_date, 95, 'AED', 95, 1, 'Meals', 'cash', $6, null, 'Local Logistics Run', 'Approved smoke expense', 'approved', 'web', $4, now())
        on conflict (id) do update set
          amount = excluded.amount,
          status = excluded.status,
          category = excluded.category,
          trip_id = excluded.trip_id,
          trip_leg_id = excluded.trip_leg_id,
          approved_by = excluded.approved_by,
          approved_at = excluded.approved_at
      `,
      [
        smoke.pendingExpenseId,
        smoke.approvedExpenseId,
        smoke.tenantId,
        smoke.userId,
        smoke.employeeId,
        smoke.tripId,
        smoke.legId
      ]
    );
    await client.query(
      `
        insert into public.tex_unregistered_whatsapp_submissions (
          id, tenant_id, sender_raw, sender_phone, whatsapp_chat_jid, message_id, session_id, message_text, payload, status
        )
        values ($1, $2, '+971500000099', '+971500000099', '971500000099@s.whatsapp.net', 'tex-browser-smoke-message', 'local-session', 'Receipt from local smoke test', '{"source":"browser-smoke"}'::jsonb, 'open')
        on conflict (id) do update set status = 'open', message_text = excluded.message_text
      `,
      [smoke.submissionId, smoke.tenantId]
    );
    await client.query(
      `
        insert into public.tex_spend_policies (tenant_id, category, daily_limit, monthly_limit, requires_notes_above, is_blocked)
        values ($1, 'Fuel', 1000, 10000, 500, false)
        on conflict (tenant_id, category) do update set daily_limit = excluded.daily_limit, monthly_limit = excluded.monthly_limit
      `,
      [smoke.tenantId]
    );
    await client.query(
      `
        insert into public.tex_budgets (tenant_id, department, month, year, budget_amount)
        values ($1, 'Operations', extract(month from now())::int, extract(year from now())::int, 25000)
        on conflict (tenant_id, department, month, year) do update set budget_amount = excluded.budget_amount
      `,
      [smoke.tenantId]
    );
    await client.query(
      `
        insert into public.tex_integration_settings (
          tenant_id, whatsapp_provider, whatsapp_instance_id, wappfly_session_id, google_maps_enabled,
          whatsapp_keys_configured, whatsapp_api_key_last4, whatsapp_webhook_url
        )
        values ($1, 'wappfly', 'local-instance', 'local-session', true, true, '0000', 'http://127.0.0.1:3000/api/tex/webhooks/wappfly')
        on conflict (tenant_id) do update set
          whatsapp_provider = excluded.whatsapp_provider,
          whatsapp_instance_id = excluded.whatsapp_instance_id,
          wappfly_session_id = excluded.wappfly_session_id,
          google_maps_enabled = excluded.google_maps_enabled,
          whatsapp_keys_configured = excluded.whatsapp_keys_configured,
          whatsapp_api_key_last4 = excluded.whatsapp_api_key_last4,
          whatsapp_webhook_url = excluded.whatsapp_webhook_url
      `,
      [smoke.tenantId]
    );
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

function startCustomerPortal(port) {
  const appDirectory = join(process.cwd(), "apps", "customer-portal");
  const child = spawn(`pnpm exec next dev --webpack --port ${port}`, {
    cwd: appDirectory,
    env: {
      ...process.env,
      NEXT_PUBLIC_SUPABASE_URL: supabaseUrl,
      NEXT_PUBLIC_SUPABASE_ANON_KEY: anonKey,
      SUPABASE_SERVICE_ROLE_KEY: serviceRoleKey,
      DATABASE_URL: databaseUrl,
      TORREVIE_DATABASE_SSL: "false",
      NEXT_PUBLIC_APP_ENV: "local"
    },
    shell: true,
    stdio: ["ignore", "pipe", "pipe"]
  });

  child.stdout.on("data", (data) => process.stdout.write(data));
  child.stderr.on("data", (data) => process.stderr.write(data));

  return child;
}

async function waitForServer() {
  const started = Date.now();
  let lastError;

  while (Date.now() - started < 120_000) {
    try {
      const response = await fetchWithTimeout(`${rootUrl}/login`, { redirect: "manual" }, 10_000);

      if (response.status < 500) {
        return;
      }
    } catch (error) {
      lastError = error;
    }

    await sleep(1000);
  }

  throw new Error(
    `Customer portal dev server did not become ready: ${lastError?.message ?? "timeout"}`
  );
}

async function signInCookieHeader() {
  const response = await fetchWithTimeout(`${supabaseUrl}/auth/v1/token?grant_type=password`, {
    method: "POST",
    headers: {
      apikey: anonKey,
      "Content-Type": "application/json"
    },
    body: JSON.stringify({ email: smoke.email, password: smoke.password })
  });

  if (!response.ok) {
    throw new Error(
      `Unable to sign in local TEX smoke user: ${response.status} ${await response.text()}`
    );
  }

  const session = await response.json();
  const expiresAt = Math.round(Date.now() / 1000) + Number(session.expires_in ?? 3600);
  const cookieSession = {
    ...session,
    expires_at: session.expires_at ?? expiresAt
  };
  const storageKey = `sb-${new URL(supabaseUrl).hostname.split(".")[0]}-auth-token`;
  const cookieValue = `base64-${Buffer.from(JSON.stringify(cookieSession), "utf8").toString("base64url")}`;

  return `${storageKey}=${encodeURIComponent(cookieValue)}`;
}

async function assertTexPage(path, cookieHeader, snippets) {
  console.log(`Checking ${path}.`);
  const response = await fetchWithTimeout(`${rootUrl}${path}`, {
    headers: {
      Accept: "text/html",
      Cookie: cookieHeader
    },
    redirect: "manual"
  });
  const body = await response.text();

  assert.equal(
    response.status,
    200,
    `${path} should render successfully. Body: ${body.slice(0, 500)}`
  );

  for (const snippet of snippets) {
    assert.match(body, new RegExp(escapeRegExp(snippet)), `${path} should include ${snippet}`);
  }
}

async function stopServer(child) {
  if (child.exitCode !== null) {
    return;
  }

  if (process.platform === "win32") {
    try {
      execFileSync("taskkill", ["/pid", String(child.pid), "/t", "/f"], { stdio: "ignore" });
    } catch {
      child.kill();
    }
  } else {
    child.kill();
  }

  await Promise.race([
    new Promise((resolve) => child.once("exit", resolve)),
    sleep(5000).then(() => {
      if (child.exitCode === null) {
        child.kill("SIGKILL");
      }
    })
  ]);
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function sleep(ms) {
  return new Promise((resolve) => globalThis.setTimeout(resolve, ms));
}

async function fetchWithTimeout(url, init = {}, timeoutMs = 30_000) {
  const controller = new globalThis.AbortController();
  const timer = globalThis.setTimeout(() => controller.abort(), timeoutMs);

  try {
    return await fetch(url, { ...init, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(timer);
  }
}

async function findAvailablePort(startPort) {
  for (let port = startPort; port < startPort + 50; port += 1) {
    if (await isPortAvailable(port)) {
      return port;
    }
  }

  throw new Error(`No available local port found starting at ${startPort}.`);
}

function isPortAvailable(port) {
  return new Promise((resolve) => {
    const server = createServer();

    server.once("error", () => resolve(false));
    server.once("listening", () => {
      server.close(() => resolve(true));
    });
    server.listen(port, "127.0.0.1");
  });
}
