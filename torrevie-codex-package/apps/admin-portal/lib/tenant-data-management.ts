import type { SupabaseClient, User } from "@supabase/supabase-js";

export const tenantExportTables = [
  "tenant_settings",
  "tenant_memberships",
  "files",
  "user_profiles",
  "user_role_assignments",
  "subscriptions",
  "subscription_entitlements",
  "audit_events",
  "provisioning_jobs",
  "provisioning_steps",
  "accounts",
  "contacts",
  "pipeline_stages",
  "opportunities",
  "activities",
  "tex_employee_profiles",
  "tex_teams",
  "tex_team_members",
  "tex_expense_categories",
  "tex_legacy_files",
  "tex_trips",
  "tex_trip_legs",
  "tex_expenses",
  "tex_unregistered_whatsapp_submissions",
  "tex_whatsapp_pending_actions",
  "tex_spend_policies",
  "tex_budgets",
  "tex_driver_advances",
  "tex_employee_salary_payments",
  "tex_erp_connections",
  "tex_per_diem_rates",
  "tex_notifications",
  "tex_integration_settings",
  "tex_migration_map"
] as const;

type TenantRow = {
  id: string;
  name: string;
  slug: string;
};

type TenantMembershipRow = {
  user_id: string;
};

type TenantExport = {
  format: "torrevie.tenant-export.v1";
  exportedAt: string;
  exportedBy: string;
  tenant: Record<string, unknown>;
  tables: Record<string, unknown[]>;
  relatedUsers: Record<string, unknown>[];
  authUsers: TenantAuthUserExport[];
  notes: string[];
};

type TenantAuthUserExport = {
  id: string;
  email: string | null;
  phone: string | null;
  createdAt: string | null;
  updatedAt: string | null;
  lastSignInAt: string | null;
  emailConfirmedAt: string | null;
  phoneConfirmedAt: string | null;
  appMetadata: unknown;
  userMetadata: unknown;
};

export async function buildTenantExport(
  client: SupabaseClient,
  tenantId: string,
  actorUserId: string
): Promise<TenantExport> {
  assertUuid(tenantId, "tenant id");
  assertUuid(actorUserId, "actor user id");

  const tenant = await getTenant(client, tenantId);
  const tables: Record<string, unknown[]> = {
    tenants: [tenant]
  };

  for (const table of tenantExportTables) {
    tables[table] = await selectTenantRows(client, table, tenantId);
  }

  const userIds = readTenantUserIds(tables.tenant_memberships ?? []);
  const relatedUsers = userIds.length > 0 ? await selectUsers(client, userIds) : [];
  const authUsers = await selectAuthUsers(client, userIds);

  return {
    format: "torrevie.tenant-export.v1",
    exportedAt: new Date().toISOString(),
    exportedBy: actorUserId,
    tenant,
    tables,
    relatedUsers,
    authUsers,
    notes: [
      "Export contains customer-owned public database records keyed by tenant_id.",
      "Global catalog records such as products, plans, roles, permissions, and reference FX/country data are excluded.",
      "Storage object bytes are not embedded; file database records and storage paths are included where present."
    ]
  };
}

export async function hardDeleteTenantData(client: SupabaseClient, tenantId: string, confirmationSlug: string) {
  assertUuid(tenantId, "tenant id");
  const tenant = await getTenant(client, tenantId);

  if (confirmationSlug !== tenant.slug) {
    throw new Error(`Type the tenant slug "${tenant.slug}" to confirm permanent deletion.`);
  }

  const { error: auditDeleteError } = await client.from("audit_events").delete().eq("tenant_id", tenantId);

  if (auditDeleteError) {
    throw new Error(`Unable to delete tenant audit events: ${auditDeleteError.message}`);
  }

  const { error } = await client.from("tenants").delete().eq("id", tenantId);

  if (error) {
    throw new Error(`Unable to permanently delete tenant: ${error.message}`);
  }

  return tenant;
}

export function tenantExportFilename(tenant: { slug?: unknown; id?: unknown }) {
  const slug = typeof tenant.slug === "string" && tenant.slug ? tenant.slug : String(tenant.id ?? "tenant");
  const stamp = new Date().toISOString().replace(/[:.]/g, "-");
  return `${slug}-tenant-export-${stamp}.json`;
}

async function getTenant(client: SupabaseClient, tenantId: string) {
  const { data, error } = await client.from("tenants").select("*").eq("id", tenantId).single();

  if (error) {
    throw new Error(`Unable to load tenant: ${error.message}`);
  }

  return data as TenantRow & Record<string, unknown>;
}

async function selectTenantRows(client: SupabaseClient, table: string, tenantId: string) {
  const { data, error } = await client.from(table).select("*").eq("tenant_id", tenantId);

  if (error) {
    throw new Error(`Unable to export ${table}: ${error.message}`);
  }

  return (data ?? []) as unknown[];
}

async function selectUsers(client: SupabaseClient, userIds: string[]) {
  const { data, error } = await client.from("users").select("*").in("id", userIds);

  if (error) {
    throw new Error(`Unable to export related users: ${error.message}`);
  }

  return (data ?? []) as Record<string, unknown>[];
}

async function selectAuthUsers(client: SupabaseClient, userIds: string[]) {
  const authUsers: TenantAuthUserExport[] = [];

  for (const userId of userIds) {
    const { data, error } = await client.auth.admin.getUserById(userId);

    if (error || !data.user) {
      continue;
    }

    authUsers.push(mapAuthUser(data.user));
  }

  return authUsers;
}

function mapAuthUser(user: User): TenantAuthUserExport {
  return {
    id: user.id,
    email: user.email ?? null,
    phone: user.phone ?? null,
    createdAt: user.created_at ?? null,
    updatedAt: user.updated_at ?? null,
    lastSignInAt: user.last_sign_in_at ?? null,
    emailConfirmedAt: user.email_confirmed_at ?? null,
    phoneConfirmedAt: user.phone_confirmed_at ?? null,
    appMetadata: user.app_metadata,
    userMetadata: user.user_metadata
  };
}

function readTenantUserIds(rows: unknown[]) {
  return [
    ...new Set(
      rows
        .map((row) => (row as TenantMembershipRow).user_id)
        .filter((userId): userId is string => typeof userId === "string" && userId.length > 0)
    )
  ];
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}
