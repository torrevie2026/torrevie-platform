import type { TenantQueryClient } from "@torrevie/tenant-context";
import type {
  TexEmailNotificationSettingsRow,
  TexProcessingSettingsRow,
  TexWhatsappNotificationSettingsRow
} from "./db-types";

export async function getTexWhatsappNotificationSettings(
  client: TenantQueryClient
): Promise<TexWhatsappNotificationSettingsRow | null> {
  const result = await client.query<TexWhatsappNotificationSettingsRow>(
    `
      select
        tis.whatsapp_provider,
        tis.whatsapp_instance_id,
        tis.wappfly_session_id,
        tis.meta_phone_number_id,
        api_secret.secret_value as api_key
      from public.tex_integration_settings tis
      left join public.tenant_integration_secrets api_secret
        on api_secret.tenant_id = tis.tenant_id
       and api_secret.product_key = 'tex'
       and api_secret.integration_key = 'whatsapp'
       and api_secret.secret_name = 'api_key'
       and api_secret.profile_id is null
      where tis.tenant_id = public.current_tenant_id()
      limit 1
    `
  );

  return result.rows[0] ?? null;
}

export async function getTexIntegrationSettingsForProcessing(
  client: TenantQueryClient
): Promise<TexProcessingSettingsRow> {
  const result = await client.query<TexProcessingSettingsRow>(
    `
      select
        ai_receipt_extraction_enabled,
        duplicate_detection_enabled,
        duplicate_auto_reject_enabled,
        duplicate_similarity_threshold::float as duplicate_similarity_threshold
      from public.tex_integration_settings
      where tenant_id = public.current_tenant_id()
      limit 1
    `
  );

  return (
    result.rows[0] ?? {
      ai_receipt_extraction_enabled: true,
      duplicate_detection_enabled: true,
      duplicate_auto_reject_enabled: false,
      duplicate_similarity_threshold: 0.92
    }
  );
}

export async function getTexEmailNotificationSettings(
  client: TenantQueryClient
): Promise<TexEmailNotificationSettingsRow | null> {
  const result = await client.query<TexEmailNotificationSettingsRow>(
    `
      select
        email_notifications_enabled,
        email_report_frequency,
        email_report_recipients
      from public.tex_integration_settings
      where tenant_id = public.current_tenant_id()
      limit 1
    `
  );

  return result.rows[0] ?? null;
}
