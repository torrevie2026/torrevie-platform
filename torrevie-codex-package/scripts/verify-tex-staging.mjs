import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { Client } from "pg";

const baseUrl = requireEnv("TEX_STAGING_BASE_URL").replace(/\/$/, "");
const target = new URL(baseUrl);

if (target.hostname === "tex1.torrevie.com") {
  throw new Error("Refusing to verify tex1.torrevie.com. TEX legacy live stays untouched.");
}

if (
  !["127.0.0.1", "localhost"].includes(target.hostname) &&
  process.env.TEX_STAGING_ALLOW_REMOTE !== "1"
) {
  throw new Error("Set TEX_STAGING_ALLOW_REMOTE=1 to verify a deployed staging SaaS target.");
}

const cronSecret = requireEnv("CRON_SECRET");
const databaseUrl =
  process.env.DATABASE_URL || process.env.POSTGRES_URL || process.env.SUPABASE_DB_URL;

if (!databaseUrl) {
  throw new Error("DATABASE_URL, POSTGRES_URL, or SUPABASE_DB_URL is required.");
}

await verifyCronEndpoint();
await verifyStorageRls();

console.log("TEX staging verification passed: cron endpoint and Storage RLS checks completed.");

async function verifyCronEndpoint() {
  const cronUrl = `${baseUrl}/api/cron/tex/fx-rates`;
  const unauthorized = await fetchWithTimeout(cronUrl, { method: "GET" });

  assert.equal(
    unauthorized.status,
    401,
    "TEX FX cron endpoint must reject unauthenticated requests."
  );

  const authorized = await fetchWithTimeout(cronUrl, {
    method: "GET",
    headers: {
      Authorization: `Bearer ${cronSecret}`,
      Accept: "application/json"
    }
  });
  const body = await authorized.text();

  if (![200, 207].includes(authorized.status)) {
    throw new Error(`TEX FX cron returned ${authorized.status}: ${body}`);
  }

  const payload = parseJson(body, "TEX FX cron response");

  assert.equal(
    typeof payload.tenantCount,
    "number",
    "TEX FX cron response must include tenantCount."
  );
  assert.equal(typeof payload.refreshed, "number", "TEX FX cron response must include refreshed.");
  assert.equal(typeof payload.failed, "number", "TEX FX cron response must include failed.");
  assert.equal(Array.isArray(payload.tenants), true, "TEX FX cron response must include tenants.");

  console.log(
    `TEX FX cron verified with status ${authorized.status}: tenantCount=${payload.tenantCount}, refreshed=${payload.refreshed}, failed=${payload.failed}.`
  );
}

async function verifyStorageRls() {
  const tenantA = randomUUID();
  const tenantB = randomUUID();
  const slugSuffix = randomUUID().slice(0, 8);
  const sql = `
    begin;

    insert into public.tenants (id, name, slug, status) values
      ('${tenantA}', 'TEX Staging Storage A', 'tex-staging-storage-a-${slugSuffix}', 'active'),
      ('${tenantB}', 'TEX Staging Storage B', 'tex-staging-storage-b-${slugSuffix}', 'active');

    insert into storage.buckets (id, name, public)
    values ('receipts', 'receipts', false)
    on conflict (id) do update set public = excluded.public;

    insert into storage.objects (bucket_id, name, owner)
    values
      ('receipts', 'tenant/${tenantA}/tex/receipts/a.png', null),
      ('receipts', 'tenant/${tenantB}/tex/receipts/b.png', null);

    set local role authenticated;
    select set_config('app.current_tenant_id', '${tenantA}', true);

    do $$
    declare
      visible_count integer;
      insert_succeeded boolean := false;
    begin
      select count(*) into visible_count
      from storage.objects
      where bucket_id = 'receipts'
        and name like 'tenant/${tenantB}/%';

      if visible_count <> 0 then
        raise exception 'storage.objects cross-tenant select leaked rows';
      end if;

      begin
        insert into storage.objects (bucket_id, name, owner)
        values ('receipts', 'tenant/${tenantB}/tex/receipts/c.png', null);
        insert_succeeded := true;
      exception when others then null;
      end;

      if insert_succeeded then
        raise exception 'storage.objects cross-tenant insert succeeded';
      end if;
    end $$;

    update storage.objects
    set metadata = jsonb_build_object('changed', true)
    where bucket_id = 'receipts'
      and name = 'tenant/${tenantB}/tex/receipts/b.png';

    do $$
    begin
      delete from storage.objects
      where bucket_id = 'receipts'
        and name = 'tenant/${tenantB}/tex/receipts/b.png';
    exception when others then
      null;
    end $$;

    reset role;

    do $$
    begin
      if exists (
        select 1
        from storage.objects
        where bucket_id = 'receipts'
          and name = 'tenant/${tenantB}/tex/receipts/b.png'
          and metadata = jsonb_build_object('changed', true)
      ) then
        raise exception 'storage.objects cross-tenant update changed row';
      end if;

      if not exists (
        select 1
        from storage.objects
        where bucket_id = 'receipts'
          and name = 'tenant/${tenantB}/tex/receipts/b.png'
      ) then
        raise exception 'storage.objects cross-tenant delete removed row';
      end if;
    end $$;

    set local role authenticated;
    select set_config('app.current_tenant_id', '', true);

    do $$
    declare
      visible_count integer;
    begin
      select count(*) into visible_count
      from storage.objects
      where bucket_id = 'receipts'
        and name in (
          'tenant/${tenantA}/tex/receipts/a.png',
          'tenant/${tenantB}/tex/receipts/b.png'
        );

      if visible_count <> 0 then
        raise exception 'storage.objects visible without tenant context';
      end if;
    end $$;

    rollback;
  `;
  const client = new Client({
    connectionString: databaseUrl,
    ssl: process.env.TORREVIE_DATABASE_SSL === "true" ? { rejectUnauthorized: false } : undefined
  });

  await client.connect();

  try {
    await client.query(sql);
  } finally {
    await client.end();
  }

  console.log("TEX Storage RLS verified with rolled-back staging transaction.");
}

function requireEnv(name) {
  const value = process.env[name];

  if (!value) {
    throw new Error(`${name} is required.`);
  }

  return value;
}

function parseJson(value, label) {
  try {
    return JSON.parse(value);
  } catch {
    throw new Error(`${label} was not valid JSON: ${value}`);
  }
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
