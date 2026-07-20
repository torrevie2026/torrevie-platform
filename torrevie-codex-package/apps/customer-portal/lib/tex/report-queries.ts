import type { TenantQueryClient } from "@torrevie/tenant-context";
import type { TexReportExpenseRow } from "./db-types";

export function queryTexReportExpenses(
  client: TenantQueryClient,
  dateFrom: string,
  dateTo: string
) {
  return client.query<TexReportExpenseRow>(
    `
      select
        e.id,
        e.employee_profile_id,
        coalesce(ep.name, e.employee_name) as employee_name,
        e.vendor,
        e.expense_date::text as expense_date,
        e.amount::float as amount,
        e.currency,
        coalesce(e.base_amount, e.amount)::float as base_amount,
        e.category,
        e.trip_id,
        coalesce(t.name, e.trip_name) as trip_name,
        e.payment_method,
        e.source,
        e.status,
        e.policy_flag,
        e.tax_amount::float as tax_amount,
        e.tax_id_number,
        e.approved_at::text as approved_at,
        e.paid_at::text as paid_at,
        e.created_at::text as created_at
      from public.tex_expenses e
      left join public.tex_employee_profiles ep
        on ep.tenant_id = e.tenant_id
       and ep.id = e.employee_profile_id
      left join public.tex_trips t
        on t.tenant_id = e.tenant_id
       and t.id = e.trip_id
      where e.tenant_id = public.current_tenant_id()
        and e.expense_date >= $1::date
        and e.expense_date <= $2::date
      order by e.expense_date desc, e.created_at desc
      limit 1000
    `,
    [dateFrom, dateTo]
  );
}
