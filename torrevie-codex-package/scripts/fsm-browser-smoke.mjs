import assert from "node:assert/strict";
import { execFileSync, spawn } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { createServer } from "node:net";
import { join } from "node:path";
import { Client } from "pg";

const localSupabaseUrl = "http://127.0.0.1:54321";

const smoke = {
  userId: "20000000-0000-4000-8000-00000000f001",
  tenantId: "20000000-0000-4000-8000-00000001f001",
  profileId: "20000000-0000-4000-8000-00000002f001",
  whatsappChannelId: "20000000-0000-4000-8000-00000003f001",
  voiceChannelId: "20000000-0000-4000-8000-00000004f001",
  intakeId: "20000000-0000-4000-8000-00000005f001",
  callLogId: "20000000-0000-4000-8000-00000006f001",
  email: "fsm.browser.smoke@example.test",
  password: `Torrevie-local-${randomUUID()}`
};

const routeChecks = [
  { path: "/en/fsm", snippets: ["Command Center", "Facility Management Company", "Channel Hub"] },
  { path: "/ar/fsm", snippets: ['dir="rtl"', "Command Center", "Facility Management Company"] },
  { path: "/en/fsm?section=jobs", snippets: ["Work Orders", "Open work orders", "Hotline intake"] },
  { path: "/en/fsm?section=scheduling", snippets: ["Scheduling", "Schedule board"] },
  { path: "/en/fsm?section=dispatch", snippets: ["Scheduling and Dispatch", "Dispatch board"] },
  { path: "/en/fsm?section=pm", snippets: ["PPM Planner", "Planned maintenance"] },
  { path: "/en/fsm?section=sla", snippets: ["SLA Board", "SLA risk"] },
  { path: "/en/fsm?section=contracts", snippets: ["Contracts", "Active contracts"] },
  { path: "/en/fsm?section=customers", snippets: ["Clients", "Customer context"] },
  { path: "/en/fsm?section=assets", snippets: ["Assets", "Asset context"] },
  { path: "/en/fsm?section=commercial", snippets: ["Quotes and Invoices", "Commercial queue"] },
  { path: "/en/fsm?section=whatsapp", snippets: ["WhatsApp Inbox", "WhatsApp messages"] },
  { path: "/en/fsm?section=triage", snippets: ["Tickets", "Triage queue"] },
  { path: "/en/fsm?section=technicians", snippets: ["Technicians", "Team controls"] },
  { path: "/en/fsm?section=approvals", snippets: ["Approvals", "Pending approvals"] },
  { path: "/en/fsm?section=catalog", snippets: ["Spare Parts", "Parts queue"] },
  { path: "/en/fsm?section=settings", snippets: ["Settings", "Workspace settings"] },
  {
    path: "/en/fsm?section=onboarding",
    snippets: ["Onboarding", "Company basics", "Average response time today"]
  },
  {
    path: "/en/fsm?section=channels",
    snippets: ["Channel Hub", "Unified triage", "Smoke WhatsApp Intake", "Voice Hotline"]
  },
  {
    path: "/en/fsm?section=reports",
    snippets: ["Reports", "ROI dashboard", "Requests captured", "Monthly value email"]
  }
];

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

const smokePort = await findAvailablePort(Number(process.env.FSM_BROWSER_SMOKE_PORT ?? 3110));
const rootUrl = `http://127.0.0.1:${smokePort}`;

await ensureAuthUser();
await seedFsmWorkspace();

const server = startCustomerPortal(smokePort);

try {
  console.log(`Starting customer portal FSM smoke server at ${rootUrl}.`);
  await waitForServer();
  console.log("Customer portal FSM smoke server is ready.");
  const cookieHeader = await signInCookieHeader();
  console.log("Local FSM smoke user authenticated.");

  for (const routeCheck of routeChecks) {
    await assertFsmPage(routeCheck.path, cookieHeader, routeCheck.snippets);
  }

  console.log("FSM browser smoke test passed for the current route inventory.");
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
    process.env.FSM_BROWSER_SMOKE_ALLOW_REMOTE !== "1"
  ) {
    throw new Error(`${name} must point at localhost for FSM browser smoke tests.`);
  }
}

function assertLocalDatabaseUrl(value) {
  const url = new URL(value);

  if (
    !["127.0.0.1", "localhost"].includes(url.hostname) &&
    process.env.FSM_BROWSER_SMOKE_ALLOW_REMOTE !== "1"
  ) {
    throw new Error("DATABASE_URL must point at localhost for FSM browser smoke tests.");
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
      user_metadata: { name: "FSM Browser Smoke" }
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
        user_metadata: { name: "FSM Browser Smoke" }
      })
    }
  );

  if (!updateResponse.ok) {
    const detail = await updateResponse.text();
    throw new Error(
      `Unable to create local FSM smoke auth user: ${updateResponse.status} ${detail}`
    );
  }
}

async function seedFsmWorkspace() {
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
        insert into public.tenants (
          id,
          name,
          slug,
          status,
          region,
          legal_entity_name,
          billing_email,
          business_segment,
          plan_tier,
          terminology_pack,
          nav_profile,
          flow_settings,
          onboarding_answers,
          baseline_metrics
        )
        values (
          $1,
          'FSM Browser Smoke Tenant',
          'fsm-browser-smoke',
          'active',
          'local',
          'FSM Browser Smoke LLC',
          $2,
          'FM',
          'enterprise',
          'fm',
          'fm',
          $3::jsonb,
          $4::jsonb,
          $5::jsonb
        )
        on conflict (id) do update set
          name = excluded.name,
          status = 'active',
          billing_email = excluded.billing_email,
          business_segment = excluded.business_segment,
          plan_tier = excluded.plan_tier,
          terminology_pack = excluded.terminology_pack,
          nav_profile = excluded.nav_profile,
          flow_settings = excluded.flow_settings,
          onboarding_answers = excluded.onboarding_answers,
          baseline_metrics = excluded.baseline_metrics
      `,
      [
        smoke.tenantId,
        smoke.email,
        JSON.stringify({
          segment: "FM",
          autoConvertIntake: false,
          triageVisible: true,
          slaStartsAt: "intake",
          defaultSourceChannel: "voice",
          approvalRequired: false,
          warrantyCheckRequired: false,
          steps: [
            "Hotline intake",
            "SLA classification",
            "Dispatch by skill and zone",
            "Checklist execution",
            "Client confirmation",
            "Monthly report"
          ]
        }),
        JSON.stringify({
          serve: "contracts",
          intake: "hotline",
          fieldSize: "more_than_50",
          suggestedSegment: "FM",
          confirmedSegment: "FM",
          selectedPlanTier: "enterprise",
          activatedChannel: "voice",
          wp28_completed_at: new Date().toISOString()
        }),
        JSON.stringify({
          jobsPerMonthToday: 160,
          averageResponseHoursToday: 4,
          adminMinutesSavedPerRequest: 20
        })
      ]
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
        values ($1, $2, $3, 'FSM Browser Smoke', 'en', false, false, false)
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
        insert into public.subscriptions (tenant_id, product_id, plan_id, status, starts_at, created_by, updated_by)
        select $1, products.id, plans.id, 'active', now() - interval '1 day', $2, $2
        from public.products
        join public.plans on plans.product_id = products.id and plans.key = 'enterprise'
        where products.key = 'fsm'
        on conflict (tenant_id, product_id) do update set
          plan_id = excluded.plan_id,
          status = 'active',
          starts_at = excluded.starts_at,
          expires_at = null,
          updated_by = excluded.updated_by
      `,
      [smoke.tenantId, smoke.userId]
    );
    await client.query(
      `
        insert into public.subscription_entitlements (tenant_id, subscription_id, feature_key, limit_value, enabled, created_by, updated_by)
        select $1, subscriptions.id, plan_features.feature_key, plan_features.limit_value, plan_features.enabled, $2, $2
        from public.subscriptions
        join public.plan_features on plan_features.plan_id = subscriptions.plan_id
        where subscriptions.tenant_id = $1
          and subscriptions.product_id = (select id from public.products where key = 'fsm')
        on conflict (subscription_id, feature_key) do update set
          limit_value = excluded.limit_value,
          enabled = excluded.enabled,
          updated_by = excluded.updated_by
      `,
      [smoke.tenantId, smoke.userId]
    );
    await seedChannelHub(client);
    await client.query("commit");
  } catch (error) {
    await client.query("rollback");
    throw error;
  } finally {
    await client.end();
  }
}

async function seedChannelHub(client) {
  await client.query(
    `
      insert into public.org_channels (id, tenant_id, channel_type, provider, display_name, config, status, created_by, updated_by)
      values
        ($1, $3, 'whatsapp', 'wappfly', 'Smoke WhatsApp Intake', '{"monthlyMinuteCap":500}'::jsonb, 'active', $4, $4),
        ($2, $3, 'voice', 'vapi', 'Voice Hotline', '{"setupPath":"forwarding","monthlyMinuteCap":500}'::jsonb, 'pending', $4, $4)
      on conflict (tenant_id, channel_type, display_name) do update set
        provider = excluded.provider,
        config = excluded.config,
        status = excluded.status,
        updated_by = excluded.updated_by
    `,
    [smoke.whatsappChannelId, smoke.voiceChannelId, smoke.tenantId, smoke.userId]
  );
  await client.query(
    `
      insert into public.intake_requests (
        id,
        tenant_id,
        channel_id,
        channel_type,
        external_ref,
        contact_name,
        contact_phone,
        raw_payload,
        ai_summary,
        ai_classification,
        status,
        created_by,
        updated_by,
        created_at,
        updated_at
      )
      values (
        $1,
        $2,
        $3,
        'whatsapp',
        'fsm-browser-smoke-intake',
        'Smoke Client',
        '+971500000002',
        '{"source":"browser_smoke"}'::jsonb,
        'Smoke WhatsApp Intake',
        '{"urgency":"medium","confidence":0.9}'::jsonb,
        'triaged',
        $4,
        $4,
        now() - interval '30 minutes',
        now() - interval '10 minutes'
      )
      on conflict (tenant_id, channel_type, external_ref) do update set
        ai_summary = excluded.ai_summary,
        status = excluded.status,
        updated_at = excluded.updated_at,
        updated_by = excluded.updated_by
    `,
    [smoke.intakeId, smoke.tenantId, smoke.whatsappChannelId, smoke.userId]
  );
  await client.query(
    `
      insert into public.call_logs (
        id,
        tenant_id,
        channel_id,
        direction,
        from_number,
        to_number,
        started_at,
        duration_seconds,
        outcome,
        intake_request_id,
        cost_estimate,
        created_by,
        updated_by
      )
      values ($1, $2, $3, 'inbound', '+971500000002', '+441234000000', now() - interval '15 minutes', 180, 'converted', $4, 1.25, $5, $5)
      on conflict (id) do update set
        duration_seconds = excluded.duration_seconds,
        outcome = excluded.outcome,
        intake_request_id = excluded.intake_request_id,
        updated_by = excluded.updated_by
    `,
    [smoke.callLogId, smoke.tenantId, smoke.voiceChannelId, smoke.intakeId, smoke.userId]
  );
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
      `Unable to sign in local FSM smoke user: ${response.status} ${await response.text()}`
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

async function assertFsmPage(path, cookieHeader, snippets) {
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
  assert.doesNotMatch(
    body,
    /Workspace queue/,
    `${path} should not fall back to the generic workspace shell.`
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
