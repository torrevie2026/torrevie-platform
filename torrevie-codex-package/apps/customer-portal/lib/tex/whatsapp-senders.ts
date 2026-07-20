import type { TenantQueryClient } from "@torrevie/tenant-context";
import type { TexEmployeeProfileRow, TexUnregisteredWhatsappSubmissionRow } from "./db-types";
import { normalizePhoneDigits } from "./shared";
import type { TexWebhookSubmissionInput } from "./types";

export async function findEmployeeByPhone(client: TenantQueryClient, phone: string | null) {
  const digits = normalizePhoneDigits(phone);

  if (!digits) {
    return null;
  }

  const result = await client.query<TexEmployeeProfileRow & { phone_digits: string | null }>(
    `
      select
        ep.id,
        ep.user_id,
        ep.name,
        ep.phone_number,
        ep.department,
        ep.monthly_salary::float as monthly_salary,
        ep.manager_user_id,
        null::text as manager_name,
        null::text as manager_email,
        ep.submission_frequency,
        ep.is_active,
        regexp_replace(ep.phone_number, '[^0-9]', '', 'g') as phone_digits
      from public.tex_employee_profiles ep
      where ep.tenant_id = public.current_tenant_id()
        and ep.is_active = true
    `,
    []
  );

  const exactMatches = result.rows.filter((row) => row.phone_digits === digits);

  if (exactMatches.length === 1) {
    return exactMatches[0];
  }

  if (exactMatches.length > 1) {
    return null;
  }

  const suffixMatches = result.rows.filter((row) =>
    isSamePhoneBySafeSuffix(row.phone_digits, digits)
  );

  return suffixMatches.length === 1 ? suffixMatches[0] : null;
}

export async function listEmployeePhoneMatchRows(client: TenantQueryClient) {
  const result = await client.query<{ id: string; phone_digits: string | null }>(
    `
      select
        ep.id,
        regexp_replace(ep.phone_number, '[^0-9]', '', 'g') as phone_digits
      from public.tex_employee_profiles ep
      where ep.tenant_id = public.current_tenant_id()
        and ep.is_active = true
    `
  );

  return result.rows;
}

export function findEmployeeIdForSubmissionRow(
  row: Pick<
    TexUnregisteredWhatsappSubmissionRow,
    "sender_phone" | "sender_raw" | "whatsapp_chat_jid"
  >,
  employees: Array<{ id: string; phone_digits: string | null }>
) {
  const candidates = [
    row.sender_phone,
    row.sender_raw,
    row.whatsapp_chat_jid,
    phoneFromWhatsappJid(row.sender_raw),
    phoneFromWhatsappJid(row.whatsapp_chat_jid)
  ]
    .map(normalizePhoneDigits)
    .filter((value): value is string => Boolean(value));

  for (const digits of Array.from(new Set(candidates))) {
    const exactMatches = employees.filter((employee) => employee.phone_digits === digits);
    if (exactMatches.length === 1) {
      return exactMatches[0]?.id ?? null;
    }

    const suffixMatches = employees.filter((employee) =>
      isSamePhoneBySafeSuffix(employee.phone_digits, digits)
    );
    if (suffixMatches.length === 1) {
      return suffixMatches[0]?.id ?? null;
    }
  }

  return null;
}

export async function findEmployeeBySubmissionSender(
  client: TenantQueryClient,
  submission: Pick<
    Required<TexWebhookSubmissionInput>,
    "senderPhone" | "senderRaw" | "whatsappChatJid"
  >
) {
  const candidates = [
    submission.senderPhone,
    submission.senderRaw,
    submission.whatsappChatJid,
    phoneFromWhatsappJid(submission.senderRaw),
    phoneFromWhatsappJid(submission.whatsappChatJid)
  ]
    .map(normalizePhoneDigits)
    .filter((value): value is string => Boolean(value));

  for (const digits of Array.from(new Set(candidates))) {
    const employee = await findEmployeeByPhone(client, digits);
    if (employee) {
      return employee;
    }
  }

  return null;
}

function isSamePhoneBySafeSuffix(left: string | null, right: string | null) {
  if (!left || !right || left.length < 7 || right.length < 7) {
    return false;
  }

  return left.endsWith(right) || right.endsWith(left);
}

function phoneFromWhatsappJid(value: string | null) {
  if (!value) {
    return null;
  }

  return value.split("@")[0] ?? null;
}
