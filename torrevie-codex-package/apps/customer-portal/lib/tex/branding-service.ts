import { withTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import { assertTexPermission } from "./access";
import { writeTexAuditEvent } from "./audit";
import { requireSingleRow } from "./shared";
import { downloadTenantAssetObject, uploadTenantAssetObject } from "./tenant-asset-storage";
import type {
  TexActorContext,
  TexTenantBranding,
  TexTenantLogoDownload,
  TexTenantLogoUploadInput
} from "./types";

const allowedLogoContentTypes = new Set(["image/jpeg", "image/png", "image/webp"]);
const maxLogoBytes = 2 * 1024 * 1024;

export async function getTexTenantBranding(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexTenantBranding> {
  assertTexPermission(actor, "tex.expense.read");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexTenantBrandingRow>(
      `
        select
          name,
          logo_storage_path,
          logo_content_type,
          logo_updated_at::text as logo_updated_at
        from public.tenants
        where id = public.current_tenant_id()
        limit 1
      `
    );

    return mapBranding(result.rows[0], actor.tenantId);
  });
}

export async function uploadTexTenantLogo(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexTenantLogoUploadInput
): Promise<TexTenantBranding> {
  assertTexPermission(actor, "tex.policy.manage");
  const contentType = normalizeLogoContentType(input.contentType);
  const buffer = decodeLogo(input.dataBase64);
  const extension = logoExtension(contentType);
  const storagePath = `tenant/${actor.tenantId}/tex/logos/company-logo.${extension}`;

  await uploadTenantAssetObject(storagePath, contentType, buffer);

  return withTenantContext(client, actor, async () => {
    const branding = await withTenantBrandingWriteAccess(client, async () => {
      const result = await client.query<TexTenantBrandingRow>(
        `
          update public.tenants
             set logo_storage_path = $1,
                 logo_content_type = $2,
                 logo_updated_at = now(),
                 updated_at = now()
           where id = public.current_tenant_id()
          returning
            name,
            logo_storage_path,
            logo_content_type,
            logo_updated_at::text as logo_updated_at
        `,
        [storagePath, contentType]
      );

      return mapBranding(requireSingleRow(result.rows, "tenant branding"), actor.tenantId);
    });

    await writeTexAuditEvent(client, actor, "tex.tenant_logo.updated", "tenants", actor.tenantId, {
      content_type: contentType,
      storage_path: storagePath
    });

    return branding;
  });
}

export async function removeTexTenantLogo(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexTenantBranding> {
  assertTexPermission(actor, "tex.policy.manage");

  return withTenantContext(client, actor, async () => {
    const branding = await withTenantBrandingWriteAccess(client, async () => {
      const result = await client.query<TexTenantBrandingRow>(
        `
          update public.tenants
             set logo_storage_path = null,
                 logo_content_type = null,
                 logo_updated_at = now(),
                 updated_at = now()
           where id = public.current_tenant_id()
          returning
            name,
            logo_storage_path,
            logo_content_type,
            logo_updated_at::text as logo_updated_at
        `
      );

      return mapBranding(requireSingleRow(result.rows, "tenant branding"), actor.tenantId);
    });

    await writeTexAuditEvent(client, actor, "tex.tenant_logo.removed", "tenants", actor.tenantId, {});

    return branding;
  });
}

export async function getTexTenantLogoDownload(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexTenantLogoDownload | null> {
  assertTexPermission(actor, "tex.expense.read");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<{
      logo_storage_path: string | null;
      logo_content_type: string | null;
    }>(
      `
        select logo_storage_path, logo_content_type
        from public.tenants
        where id = public.current_tenant_id()
        limit 1
      `
    );
    const row = result.rows[0];

    if (!row?.logo_storage_path || !row.logo_content_type) {
      return null;
    }

    return {
      buffer: await downloadTenantAssetObject(row.logo_storage_path),
      contentType: row.logo_content_type
    };
  });
}

function mapBranding(
  row: TexTenantBrandingRow | undefined,
  tenantId: string
): TexTenantBranding {
  const logoUpdatedAt = row?.logo_updated_at ?? null;

  return {
    tenantName: row?.name?.trim() || "Current tenant",
    logoUrl: row?.logo_storage_path
      ? `/api/tex/branding/logo?v=${encodeURIComponent(logoUpdatedAt ?? tenantId)}`
      : null,
    logoUpdatedAt
  };
}

function normalizeLogoContentType(value: string) {
  const contentType = value.trim().toLowerCase();

  if (!allowedLogoContentTypes.has(contentType)) {
    throw new Error("Logo must be a JPG, PNG, or WebP image.");
  }

  return contentType;
}

function decodeLogo(dataBase64: string) {
  const base64 = dataBase64.includes(",") ? dataBase64.split(",").pop() ?? "" : dataBase64;
  const buffer = Buffer.from(base64, "base64");

  if (!buffer.length) {
    throw new Error("Logo file is empty.");
  }

  if (buffer.length > maxLogoBytes) {
    throw new Error("Logo must be smaller than 2 MB.");
  }

  return buffer;
}

function logoExtension(contentType: string) {
  if (contentType === "image/png") {
    return "png";
  }

  if (contentType === "image/webp") {
    return "webp";
  }

  return "jpg";
}

async function withTenantBrandingWriteAccess<T>(
  client: TenantQueryClient,
  callback: () => Promise<T>
) {
  await client.query("select set_config('app.platform_service_role', 'true', true)");

  try {
    return await callback();
  } finally {
    await client.query("select set_config('app.platform_service_role', 'false', true)");
  }
}

type TexTenantBrandingRow = {
  name: string | null;
  logo_storage_path: string | null;
  logo_content_type: string | null;
  logo_updated_at: string | null;
};
