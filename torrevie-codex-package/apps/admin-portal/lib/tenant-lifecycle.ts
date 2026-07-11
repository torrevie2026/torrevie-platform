import type { SupabaseClient } from "@supabase/supabase-js";

export const tenantStatuses = ["trial", "active", "suspended", "archived"] as const;
export type TenantStatus = (typeof tenantStatuses)[number];

export type TenantRecord = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  region: string | null;
  legal_entity_name: string | null;
  billing_email: string | null;
  created_at: string;
  updated_at: string;
};

export type TenantInput = {
  name: string;
  slug: string;
  status: TenantStatus;
  region?: string | null;
  legalEntityName?: string | null;
  billingEmail?: string | null;
};

export type TenantSettingsInput = {
  defaultLocale: "en" | "ar";
  timezone: string;
};

type TenantRow = {
  id: string;
  name: string;
  slug: string;
  status: TenantStatus;
  region: string | null;
  legal_entity_name: string | null;
  billing_email: string | null;
  created_at: string;
  updated_at: string;
};

export async function listTenants(client: SupabaseClient): Promise<TenantRecord[]> {
  const { data, error } = await client
    .from("tenants")
    .select("id,name,slug,status,region,legal_entity_name,billing_email,created_at,updated_at")
    .order("created_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to list tenants: ${error.message}`);
  }

  return (data ?? []) as TenantRecord[];
}

export async function createTenant(
  client: SupabaseClient,
  input: TenantInput,
  settings: TenantSettingsInput,
  actorUserId: string
): Promise<TenantRecord> {
  const sanitized = sanitizeTenantInput(input);
  const { data, error } = await client
    .from("tenants")
    .insert({
      name: sanitized.name,
      slug: sanitized.slug,
      status: sanitized.status,
      region: sanitized.region,
      legal_entity_name: sanitized.legalEntityName,
      billing_email: sanitized.billingEmail,
      created_by: actorUserId,
      updated_by: actorUserId
    })
    .select("id,name,slug,status,region,legal_entity_name,billing_email,created_at,updated_at")
    .single();

  if (error) {
    throw new Error(`Unable to create tenant: ${error.message}`);
  }

  const tenant = data as TenantRow;
  await insertTenantSettings(client, tenant.id, settings, actorUserId);
  await writeTenantAuditEvent(client, {
    tenantId: tenant.id,
    actorUserId,
    action: "tenant.created",
    metadata: {
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status
    }
  });

  return tenant;
}

export async function updateTenant(
  client: SupabaseClient,
  tenantId: string,
  input: TenantInput,
  actorUserId: string
): Promise<TenantRecord> {
  assertUuid(tenantId, "tenant id");
  const sanitized = sanitizeTenantInput(input);
  const { data, error } = await client
    .from("tenants")
    .update({
      name: sanitized.name,
      slug: sanitized.slug,
      status: sanitized.status,
      region: sanitized.region,
      legal_entity_name: sanitized.legalEntityName,
      billing_email: sanitized.billingEmail,
      updated_by: actorUserId
    })
    .eq("id", tenantId)
    .select("id,name,slug,status,region,legal_entity_name,billing_email,created_at,updated_at")
    .single();

  if (error) {
    throw new Error(`Unable to update tenant: ${error.message}`);
  }

  const tenant = data as TenantRow;
  await writeTenantAuditEvent(client, {
    tenantId,
    actorUserId,
    action: "tenant.updated",
    metadata: {
      name: tenant.name,
      slug: tenant.slug,
      status: tenant.status
    }
  });

  return tenant;
}

export async function setTenantStatus(
  client: SupabaseClient,
  tenantId: string,
  status: TenantStatus,
  actorUserId: string
): Promise<TenantRecord> {
  assertUuid(tenantId, "tenant id");
  assertTenantStatus(status);
  const { data, error } = await client
    .from("tenants")
    .update({
      status,
      updated_by: actorUserId
    })
    .eq("id", tenantId)
    .select("id,name,slug,status,region,legal_entity_name,billing_email,created_at,updated_at")
    .single();

  if (error) {
    throw new Error(`Unable to set tenant status: ${error.message}`);
  }

  const tenant = data as TenantRow;
  await writeTenantAuditEvent(client, {
    tenantId,
    actorUserId,
    action: `tenant.${status}`,
    metadata: {
      status
    }
  });

  return tenant;
}

function sanitizeTenantInput(input: TenantInput): Required<TenantInput> {
  const name = input.name.trim();
  const slug = input.slug.trim().toLowerCase();

  if (name.length < 2) {
    throw new Error("Tenant name must be at least 2 characters.");
  }

  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(slug)) {
    throw new Error("Tenant slug must use lowercase letters, numbers, and single hyphens.");
  }

  assertTenantStatus(input.status);

  return {
    name,
    slug,
    status: input.status,
    region: cleanOptional(input.region),
    legalEntityName: cleanOptional(input.legalEntityName),
    billingEmail: cleanOptional(input.billingEmail)
  };
}

function cleanOptional(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function assertTenantStatus(status: string): asserts status is TenantStatus {
  if (!tenantStatuses.includes(status as TenantStatus)) {
    throw new Error(`Unsupported tenant status: ${status}`);
  }
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

async function insertTenantSettings(
  client: SupabaseClient,
  tenantId: string,
  settings: TenantSettingsInput,
  actorUserId: string
) {
  const { error } = await client.from("tenant_settings").insert({
    tenant_id: tenantId,
    default_locale: settings.defaultLocale,
    timezone: settings.timezone.trim() || "Asia/Dubai",
    created_by: actorUserId,
    updated_by: actorUserId
  });

  if (error) {
    throw new Error(`Unable to create tenant settings: ${error.message}`);
  }
}

async function writeTenantAuditEvent(
  client: SupabaseClient,
  event: {
    tenantId: string;
    actorUserId: string;
    action: string;
    metadata: Record<string, string>;
  }
) {
  const { error } = await client.from("audit_events").insert({
    tenant_id: event.tenantId,
    actor_user_id: event.actorUserId,
    action: event.action,
    target_type: "tenant",
    target_id: event.tenantId,
    metadata: event.metadata
  });

  if (error) {
    throw new Error(`Unable to write audit event: ${error.message}`);
  }
}
