import { execFileSync, execSync } from "node:child_process";

const projectId = "torrevie-codex-package";
const containerName = `supabase_db_${projectId}`;
const statusOutput = execSync("pnpm exec supabase status --output json", {
  encoding: "utf8"
});
const statusJson = statusOutput.slice(statusOutput.indexOf("{"), statusOutput.lastIndexOf("}") + 1);
const status = JSON.parse(statusJson);

const email = `auth-smoke-${Date.now()}@example.test`;
const password = "TestingPassword123!";
const tenantId = "10000000-0000-0000-0000-000000000701";

async function authFetch(path, body) {
  const response = await fetch(`${status.API_URL}${path}`, {
    method: "POST",
    headers: {
      apikey: status.ANON_KEY,
      authorization: `Bearer ${status.ANON_KEY}`,
      "content-type": "application/json"
    },
    body: JSON.stringify(body)
  });

  const payload = await response.json();

  if (!response.ok) {
    throw new Error(`Auth request failed: ${response.status} ${JSON.stringify(payload)}`);
  }

  return payload;
}

const signup = await authFetch("/auth/v1/signup", { email, password });
const userId = signup.user?.id;

if (!userId) {
  throw new Error("Local auth signup did not return a user id.");
}

const sql = `
insert into public.users (id, email)
values ('${userId}', '${email}');

insert into public.tenants (id, name, slug, status)
values ('${tenantId}', 'Auth Smoke Tenant', 'auth-smoke-${Date.now()}', 'active');

insert into public.tenant_memberships (tenant_id, user_id, status, joined_at)
values ('${tenantId}', '${userId}', 'active', now());

insert into public.user_role_assignments (tenant_id, user_id, role_id)
select '${tenantId}', '${userId}', id
from public.roles
where key = 'customer_admin';
`;

execFileSync("docker", [
  "exec",
  "-i",
  containerName,
  "psql",
  "-U",
  "postgres",
  "-d",
  "postgres",
  "-v",
  "ON_ERROR_STOP=1",
  "-f",
  "-"
], {
  input: sql,
  stdio: ["pipe", "ignore", "inherit"]
});

const signin = await authFetch("/auth/v1/token?grant_type=password", { email, password });
const token = signin.access_token;
const [, encodedPayload] = token.split(".");
const claims = JSON.parse(Buffer.from(encodedPayload, "base64url").toString("utf8"));

if (claims.tenant_id !== tenantId) {
  throw new Error(`Expected tenant_id ${tenantId}, received ${claims.tenant_id ?? "undefined"}.`);
}

if (claims.role_scope !== "customer") {
  throw new Error(`Expected role_scope customer, received ${claims.role_scope ?? "undefined"}.`);
}

console.log("Auth tenant claim smoke test passed.");
