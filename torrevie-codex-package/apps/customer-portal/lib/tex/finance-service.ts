import { dispatchEmailNotification } from "@torrevie/notifications";
import { withTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import { assertTexPermission } from "./access";
import { writeTexAuditEvent } from "./audit";
import { TEX_FX_TARGET_CURRENCIES } from "./constants";
import type {
  TexCurrencyPegRow,
  TexFinanceExpenseRow,
  TexFinanceTripPayoutRow,
  TexFxRateRow
} from "./db-types";
import { escapeHtml, sanitizeEmailRecipients, summarizeEmailReport } from "./email-report";
import { fetchTexFxRates } from "./fx-rates";
import { getTexEmailNotificationSettings } from "./integration-settings-queries";
import {
  mapCurrencyPeg,
  mapFinanceExpense,
  mapFinanceTripPayout,
  mapFxRate,
  mapReportExpense
} from "./mappers";
import { queryTexReportExpensePeriods } from "./report-queries";
import { formatMoney, sum, uniqueUuids } from "./shared";
import type {
  TexActorContext,
  TexEmailReportInput,
  TexEmailReportResult,
  TexFinancePaymentInput,
  TexFinanceReview,
  TexFxRefreshResult,
  TexFxWorkspace,
  TexReportInput,
  TexReportWorkspace
} from "./types";
import { sanitizeFinancePeriod, sanitizeReportPeriod, toIsoDate } from "./validation";
import { deliverExpenseStatusWhatsappReply } from "./whatsapp-delivery";

let texEmailNotificationDispatcher = dispatchEmailNotification;

export async function listTexFinanceReview(
  client: TenantQueryClient,
  actor: TexActorContext,
  month: number,
  year: number
): Promise<TexFinanceReview> {
  assertTexPermission(actor, "tex.finance.review");
  const period = sanitizeFinancePeriod(month, year);

  return withTenantContext(client, actor, async () => {
    const expenses = await client.query<TexFinanceExpenseRow>(
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
          coalesce(t.name, e.trip_name) as trip_name,
          e.notes,
          e.receipt_file_id,
          e.approved_at::text as approved_at
        from public.tex_expenses e
        left join public.tex_employee_profiles ep
          on ep.tenant_id = e.tenant_id
         and ep.id = e.employee_profile_id
        left join public.tex_trips t
          on t.tenant_id = e.tenant_id
         and t.id = e.trip_id
        where e.tenant_id = public.current_tenant_id()
          and e.status = 'approved'
          and extract(month from e.expense_date)::int = $1
          and extract(year from e.expense_date)::int = $2
        order by e.expense_date desc, e.created_at desc
      `,
      [period.month, period.year]
    );
    const tripPayouts = await client.query<TexFinanceTripPayoutRow>(
      `
        select
          t.id,
          t.name,
          t.driver_employee_profile_id,
          driver.name as driver_name,
          t.origin,
          t.destination,
          t.start_date::text as start_date,
          t.driver_trip_amount::float as driver_trip_amount,
          t.subcontractor_driver_name,
          t.subcontractor_amount::float as subcontractor_amount,
          (t.driver_trip_amount + t.subcontractor_amount)::float as total_amount
        from public.tex_trips t
        left join public.tex_employee_profiles driver
          on driver.tenant_id = t.tenant_id
         and driver.id = t.driver_employee_profile_id
        where t.tenant_id = public.current_tenant_id()
          and t.driver_payout_status = 'unpaid'
          and (t.driver_trip_amount > 0 or t.subcontractor_amount > 0)
          and extract(month from coalesce(t.start_date, t.created_at::date))::int = $1
          and extract(year from coalesce(t.start_date, t.created_at::date))::int = $2
        order by coalesce(t.start_date, t.created_at::date) desc, t.created_at desc
      `,
      [period.month, period.year]
    );
    const approvedExpenses = expenses.rows.map(mapFinanceExpense);
    const mappedTripPayouts = tripPayouts.rows.map(mapFinanceTripPayout);
    const approvedExpenseAmount = sum(approvedExpenses.map((expense) => expense.baseAmount));
    const tripPayoutAmount = sum(mappedTripPayouts.map((trip) => trip.totalAmount));

    return {
      month: period.month,
      year: period.year,
      currency: "AED",
      approvedExpenses,
      tripPayouts: mappedTripPayouts,
      totals: {
        approvedExpenseAmount,
        tripPayoutAmount,
        netPayable: approvedExpenseAmount + tripPayoutAmount
      }
    };
  });
}

export async function listTexReportWorkspace(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexReportInput = {}
): Promise<TexReportWorkspace> {
  assertTexPermission(actor, "tex.expense.read");
  const period = sanitizeReportPeriod(input.dateFrom, input.dateTo);

  return withTenantContext(client, actor, async () => {
    const reportRows = await queryTexReportExpensePeriods(client, period);
    const expenses = reportRows.rows.filter((row) => row.report_period === "current");
    const previousExpenses = reportRows.rows.filter((row) => row.report_period === "previous");

    return {
      ...period,
      currency: "AED",
      expenses: expenses.map(mapReportExpense),
      previousExpenses: previousExpenses.map(mapReportExpense)
    };
  });
}

export async function sendTexEmailReport(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexEmailReportInput = {}
): Promise<TexEmailReportResult> {
  assertTexPermission(actor, "tex.finance.review");

  return withTenantContext(client, actor, async () => {
    const settings = await getTexEmailNotificationSettings(client);
    const recipients = sanitizeEmailRecipients(
      input.recipients?.length ? input.recipients : (settings?.email_report_recipients ?? [])
    );

    if (!settings?.email_notifications_enabled || settings.email_report_frequency === "off") {
      const result: TexEmailReportResult = {
        status: "skipped",
        provider: null,
        recipients,
        messageId: null,
        error: "TEX email notifications are disabled for this tenant."
      };
      await writeTexAuditEvent(
        client,
        actor,
        "tex.email_report.skipped",
        "tex_integration_settings",
        actor.tenantId,
        {
          reason: "disabled"
        }
      );
      return result;
    }

    if (!recipients.length) {
      const result: TexEmailReportResult = {
        status: "skipped",
        provider: null,
        recipients,
        messageId: null,
        error: "No TEX email report recipients are configured."
      };
      await writeTexAuditEvent(
        client,
        actor,
        "tex.email_report.skipped",
        "tex_integration_settings",
        actor.tenantId,
        {
          reason: "no_recipients"
        }
      );
      return result;
    }

    const report = await listTexReportWorkspace(client, actor, input);
    const metrics = summarizeEmailReport(report);
    const dispatch = await texEmailNotificationDispatcher({
      provider: "postmark",
      to: recipients,
      subject: `Torrevie TEX report: ${report.dateFrom} to ${report.dateTo}`,
      text: [
        `Torrevie TEX report for ${report.dateFrom} to ${report.dateTo}`,
        `Total spend: ${formatMoney(metrics.totalSpend, report.currency)}`,
        `Expenses: ${metrics.expenseCount}`,
        `Pending: ${metrics.pendingCount}`,
        `Approved: ${metrics.approvedCount}`,
        `Paid: ${metrics.paidCount}`,
        `Flagged: ${metrics.flaggedCount}`
      ].join("\n"),
      html: [
        `<p>Torrevie TEX report for <strong>${escapeHtml(report.dateFrom)} to ${escapeHtml(report.dateTo)}</strong></p>`,
        "<ul>",
        `<li>Total spend: ${escapeHtml(formatMoney(metrics.totalSpend, report.currency))}</li>`,
        `<li>Expenses: ${metrics.expenseCount}</li>`,
        `<li>Pending: ${metrics.pendingCount}</li>`,
        `<li>Approved: ${metrics.approvedCount}</li>`,
        `<li>Paid: ${metrics.paidCount}</li>`,
        `<li>Flagged: ${metrics.flaggedCount}</li>`,
        "</ul>"
      ].join("")
    });

    await writeTexAuditEvent(
      client,
      actor,
      `tex.email_report.${dispatch.status}`,
      "tex_integration_settings",
      actor.tenantId,
      {
        recipients: String(recipients.length),
        message_id: dispatch.messageId ?? "",
        error: dispatch.error ?? ""
      }
    );

    return {
      status: dispatch.status,
      provider: dispatch.provider,
      recipients,
      messageId: dispatch.messageId,
      error: dispatch.error
    };
  });
}

export async function listTexFxWorkspace(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexFxWorkspace> {
  assertTexPermission(actor, "tex.finance.review");
  const rateDate = toIsoDate(new Date());

  return withTenantContext(client, actor, async () => {
    const rates = await client.query<TexFxRateRow>(
      `
          select
            id,
            rate_date::text as rate_date,
            from_currency,
            to_currency,
            rate::float as rate,
            source,
            is_manual_override
          from public.tex_fx_rates
          where rate_date = $1::date
          order by from_currency asc
        `,
      [rateDate]
    );
    const pegs = await client.query<TexCurrencyPegRow>(
      `
          select
            from_currency,
            to_currency,
            rate::float as rate,
            effective_from::text as effective_from,
            notes
          from public.tex_currency_pegs
          order by from_currency asc, effective_from desc
        `
    );

    return {
      rateDate,
      baseCurrency: "AED",
      rates: rates.rows.map(mapFxRate),
      pegs: pegs.rows.map(mapCurrencyPeg)
    };
  });
}

export async function refreshTexFxRates(
  client: TenantQueryClient,
  actor: TexActorContext,
  fetcher: typeof fetch = globalThis.fetch.bind(globalThis)
): Promise<TexFxRefreshResult> {
  assertTexPermission(actor, "tex.integration.manage");
  const rateDate = toIsoDate(new Date());

  return withTenantContext(client, actor, async () => {
    const pegs = await client.query<TexCurrencyPegRow>(
      `
        select
          from_currency,
          to_currency,
          rate::float as rate,
          effective_from::text as effective_from,
          notes
        from public.tex_currency_pegs
        order by from_currency asc, effective_from desc
      `
    );
    const peggedCurrencies = new Set(pegs.rows.map((peg) => peg.from_currency));
    const targetCurrencies = TEX_FX_TARGET_CURRENCIES.filter(
      (currency) => !peggedCurrencies.has(currency)
    );
    const errors: string[] = [];
    let source: TexFxRefreshResult["source"] = "none";
    let updated = 0;
    let skipped = 0;
    let pegged = 0;
    const rates = await fetchTexFxRates(targetCurrencies, fetcher, errors);

    source = rates.source;

    await client.query("select set_config('app.platform_service_role', 'true', true)");
    try {
      for (const [currency, rate] of Object.entries(rates.values)) {
        const result = await client.query<{ id: string }>(
          `
            insert into public.tex_fx_rates (
              rate_date,
              from_currency,
              to_currency,
              rate,
              source,
              is_manual_override
            )
            values ($1::date, $2, 'USD', $3, $4, false)
            on conflict (rate_date, from_currency, to_currency)
            do update set
              rate = excluded.rate,
              source = excluded.source,
              is_manual_override = false,
              updated_at = now()
            where public.tex_fx_rates.is_manual_override = false
            returning id
          `,
          [rateDate, currency, rate, source]
        );

        if (result.rows.length) {
          updated += 1;
        } else {
          skipped += 1;
        }
      }

      for (const peg of pegs.rows) {
        const result = await client.query<{ id: string }>(
          `
            insert into public.tex_fx_rates (
              rate_date,
              from_currency,
              to_currency,
              rate,
              source,
              is_manual_override
            )
            values ($1::date, $2, $3, $4, 'peg', false)
            on conflict (rate_date, from_currency, to_currency) do nothing
            returning id
          `,
          [rateDate, peg.from_currency, peg.to_currency, peg.rate]
        );
        pegged += result.rows.length;
      }
    } finally {
      await client.query("select set_config('app.platform_service_role', 'false', true)");
    }

    const result: TexFxRefreshResult = {
      success: errors.length === 0,
      source,
      updated,
      skipped,
      pegged,
      errors,
      rateDate
    };

    await writeTexAuditEvent(
      client,
      actor,
      "tex.fx_rates.refreshed",
      "tex_fx_rates",
      actor.tenantId,
      {
        source,
        updated: String(updated),
        skipped: String(skipped),
        pegged: String(pegged),
        errors: errors.join("; ")
      }
    );

    return result;
  });
}

export async function payTexFinanceItems(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexFinancePaymentInput
): Promise<{ paidExpenses: number; paidTrips: number }> {
  assertTexPermission(actor, "tex.finance.review");
  const expenseIds = uniqueUuids(input.expenseIds ?? [], "expense id");
  const tripIds = uniqueUuids(input.tripIds ?? [], "trip id");

  if (expenseIds.length === 0 && tripIds.length === 0) {
    throw new Error("Select at least one finance item to pay.");
  }

  return withTenantContext(client, actor, async () => {
    let paidExpenses = 0;
    let paidTrips = 0;

    if (expenseIds.length > 0) {
      const result = await client.query<{ id: string }>(
        `
          update public.tex_expenses
             set status = 'paid',
                 finance_reviewed_by = $1,
                 finance_reviewed_at = now(),
                 paid_by = $1,
                 paid_at = now(),
                 updated_by = $1
           where tenant_id = public.current_tenant_id()
             and status = 'approved'
             and id = any(string_to_array($2, ',')::uuid[])
          returning id
        `,
        [actor.userId, expenseIds.join(",")]
      );
      paidExpenses = result.rows.length;

      for (const row of result.rows) {
        await writeTexAuditEvent(client, actor, "tex.finance.expense_paid", "tex_expense", row.id, {
          status: "paid"
        });
        await deliverExpenseStatusWhatsappReply(client, actor, row.id, "paid");
      }
    }

    if (tripIds.length > 0) {
      const result = await client.query<{ id: string }>(
        `
          update public.tex_trips
             set driver_payout_status = 'paid',
                 driver_payout_paid_by = $1,
                 driver_payout_paid_at = now(),
                 updated_by = $1
           where tenant_id = public.current_tenant_id()
             and driver_payout_status = 'unpaid'
             and id = any(string_to_array($2, ',')::uuid[])
          returning id
        `,
        [actor.userId, tripIds.join(",")]
      );
      paidTrips = result.rows.length;

      for (const row of result.rows) {
        await writeTexAuditEvent(
          client,
          actor,
          "tex.finance.trip_payout_paid",
          "tex_trip",
          row.id,
          {
            status: "paid"
          }
        );
      }
    }

    return { paidExpenses, paidTrips };
  });
}

export function setTexEmailNotificationDispatcherForTest(
  dispatcher: typeof dispatchEmailNotification | null
) {
  texEmailNotificationDispatcher = dispatcher ?? dispatchEmailNotification;
}
