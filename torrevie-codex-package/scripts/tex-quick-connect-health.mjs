import { existsSync, readFileSync } from "node:fs";
import { URLSearchParams } from "node:url";
import { Client } from "pg";

loadLocalEnv();

if (process.argv.includes("--help")) {
  console.log(`
Usage:
  pnpm tex:quick-connect:health

Environment:
  DATABASE_URL | POSTGRES_URL | SUPABASE_DB_URL   Optional Postgres connection string
  NEXT_PUBLIC_SUPABASE_URL                        Supabase URL fallback when no database URL exists
  SUPABASE_SERVICE_ROLE_KEY                       Server-only key for Supabase REST fallback
  TEX_QUICK_CONNECT_TENANT_ID=<uuid>              Optional tenant filter
  TEX_QUICK_CONNECT_HEALTH_WINDOW_SECONDS=120     Heartbeat freshness window
  TORREVIE_DATABASE_SSL=true                      Enable TLS for hosted Supabase
`);
  process.exit(0);
}

const databaseUrl = optionalEnv("DATABASE_URL", "POSTGRES_URL", "SUPABASE_DB_URL");
const supabaseUrl = optionalEnv("NEXT_PUBLIC_SUPABASE_URL");
const supabaseServiceRoleKey = optionalEnv("SUPABASE_SERVICE_ROLE_KEY");
const tenantFilter = optionalEnv("TEX_QUICK_CONNECT_TENANT_ID");
const healthWindowSeconds = Number(process.env.TEX_QUICK_CONNECT_HEALTH_WINDOW_SECONDS || 120);

if (!databaseUrl && (!supabaseUrl || !supabaseServiceRoleKey)) {
  throw new Error(
    "Configure DATABASE_URL/POSTGRES_URL/SUPABASE_DB_URL or NEXT_PUBLIC_SUPABASE_URL with SUPABASE_SERVICE_ROLE_KEY."
  );
}

const since = new Date(Date.now() - healthWindowSeconds * 1000).toISOString();
const heartbeats = await listRecentHeartbeats(since);

if (!heartbeats.length) {
  console.error(
    `No TEX Quick Connect heartbeat found since ${since}${tenantFilter ? ` for tenant ${tenantFilter}` : ""}.`
  );
  process.exit(1);
}

console.log(
  JSON.stringify(
    {
      checkedSince: since,
      heartbeatCount: heartbeats.length,
      latestHeartbeat: heartbeats[0]
    },
    null,
    2
  )
);

async function listRecentHeartbeats(sinceIso) {
  if (!databaseUrl) {
    const params = new URLSearchParams({
      event_type: "eq.quick_connect.connector_heartbeat",
      limit: "10",
      occurred_at: `gte.${sinceIso}`,
      order: "occurred_at.desc",
      select: "tenant_id,event_type,occurred_at,metadata"
    });
    if (tenantFilter) {
      params.set("tenant_id", `eq.${tenantFilter}`);
    }

    return supabaseFetch(`/rest/v1/tex_quick_connect_events?${params.toString()}`);
  }

  return queryRows(
    `
      select tenant_id, event_type, occurred_at::text as occurred_at, metadata
      from public.tex_quick_connect_events
      where event_type = 'quick_connect.connector_heartbeat'
        and occurred_at >= $1::timestamptz
        and ($2::uuid is null or tenant_id = $2::uuid)
      order by occurred_at desc
      limit 10
    `,
    [sinceIso, tenantFilter]
  );
}

async function supabaseFetch(path) {
  const response = await fetch(`${supabaseUrl}${path}`, {
    headers: {
      apikey: supabaseServiceRoleKey,
      Authorization: `Bearer ${supabaseServiceRoleKey}`,
      "Content-Type": "application/json"
    }
  });

  if (!response.ok) {
    const body = await response.text();
    throw new Error(`Supabase REST ${response.status}: ${body}`);
  }

  const text = await response.text();
  return text ? JSON.parse(text) : [];
}

async function queryRows(sql, values = []) {
  const client = new Client({
    connectionString: databaseUrl,
    ssl: databaseSslConfig()
  });
  await client.connect();

  try {
    const result = await client.query(sql, values);
    return result.rows;
  } finally {
    await client.end();
  }
}

function databaseSslConfig() {
  if (process.env.TORREVIE_DATABASE_SSL !== "true") {
    return undefined;
  }

  return {
    rejectUnauthorized: process.env.TORREVIE_DATABASE_SSL_REJECT_UNAUTHORIZED === "true"
  };
}

function optionalEnv(...keys) {
  for (const key of keys) {
    const value = process.env[key]?.trim();
    if (value && value !== '""' && value !== "''") {
      return value;
    }
  }

  return null;
}

function loadLocalEnv() {
  for (const fileName of [".env.local", ".env"]) {
    if (!existsSync(fileName)) {
      continue;
    }

    const lines = readFileSync(fileName, "utf8").split(/\r?\n/);
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
}
