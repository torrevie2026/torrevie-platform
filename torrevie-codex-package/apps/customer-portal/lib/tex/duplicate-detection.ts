import type { TenantQueryClient } from "@torrevie/tenant-context";
import type { TexReceiptExtraction } from "../tex-ai";
import type { TexDuplicateCandidateRow } from "./db-types";
import { normalizeDuplicateVendor } from "./whatsapp-receipts";

export async function findDuplicateExpense(
  client: TenantQueryClient,
  employeeProfileId: string,
  extraction: TexReceiptExtraction
): Promise<TexDuplicateCandidateRow | null> {
  if (!extraction.expenseDate || !extraction.amount || !extraction.currency) {
    return null;
  }

  const currency = extraction.currency.trim().toUpperCase();
  const amount = Math.round(Number(extraction.amount) * 100) / 100;
  const amountTolerance = Math.max(0.01, Math.min(2, amount * 0.01));
  const result = await client.query<TexDuplicateCandidateRow>(
    `
      select id, vendor, amount::float as amount, currency, expense_date::text as expense_date
      from public.tex_expenses
      where tenant_id = public.current_tenant_id()
        and employee_profile_id = $1
        and expense_date between ($2::date - interval '1 day') and ($2::date + interval '1 day')
        and abs(amount - $3) <= $5
        and upper(currency) = $4
        and status <> 'rejected'
      order by
        case when expense_date = $2::date then 0 else 1 end,
        abs(amount - $3) asc,
        created_at desc
      limit 3
    `,
    [employeeProfileId, extraction.expenseDate, amount, currency, amountTolerance]
  );

  const vendorKey = normalizeDuplicateVendor(extraction.vendor);
  const exactOrVendorMatch =
    result.rows.find((row) => {
      const sameAmount = Math.abs(row.amount - amount) <= 0.01;
      const sameDate = row.expense_date === extraction.expenseDate;
      const existingVendorKey = normalizeDuplicateVendor(row.vendor);
      return (sameAmount && sameDate) || (Boolean(vendorKey) && vendorKey === existingVendorKey);
    }) ?? null;

  return exactOrVendorMatch ?? (result.rows.length === 1 ? (result.rows[0] ?? null) : null);
}
