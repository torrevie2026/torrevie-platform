import type { TenantQueryClient } from "@torrevie/tenant-context";
import type { TexReportExpenseRow } from "./db-types";

export type TexReportExpensePeriodRow = TexReportExpenseRow & {
  report_period: "current" | "previous";
};

export function queryTexReportExpensePeriods(
  client: TenantQueryClient,
  period: {
    dateFrom: string;
    dateTo: string;
    previousDateFrom: string;
    previousDateTo: string;
  }
) {
  return client.query<TexReportExpensePeriodRow>(
    `
      with report_periods as (
        select 'current'::text as report_period, $1::date as date_from, $2::date as date_to
        union all
        select 'previous'::text as report_period, $3::date as date_from, $4::date as date_to
      )
      select
        rp.report_period,
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
      from report_periods rp
      join public.tex_expenses e
        on e.tenant_id = public.current_tenant_id()
       and e.expense_date >= rp.date_from
       and e.expense_date <= rp.date_to
      left join public.tex_employee_profiles ep
        on ep.tenant_id = e.tenant_id
       and ep.id = e.employee_profile_id
      left join public.tex_trips t
        on t.tenant_id = e.tenant_id
       and t.id = e.trip_id
      order by rp.report_period asc, e.expense_date desc, e.created_at desc
      limit 2000
    `,
    [period.dateFrom, period.dateTo, period.previousDateFrom, period.previousDateTo]
  );
}
