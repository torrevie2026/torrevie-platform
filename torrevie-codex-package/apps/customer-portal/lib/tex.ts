import { assertPermission, roleKeys, type PermissionKey, type ProductKey, type RoleKey } from "@torrevie/permissions";
import { withTenantContext, type ResolvedTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";

export type TexActorContext = ResolvedTenantContext & {
  roles: readonly RoleKey[];
  entitledProducts: readonly ProductKey[];
  moduleAdminProducts?: readonly ProductKey[];
  integrationPermissions?: readonly PermissionKey[];
};

export type TexExpenseStatus = "pending" | "approved" | "rejected" | "paid";

export type TexBootstrap = {
  categories: TexExpenseCategory[];
  employeeProfiles: TexEmployeeProfile[];
  teams: TexTeam[];
  integrationSettings: TexIntegrationSettings | null;
};

export type TexExpenseCategory = {
  id: string;
  name: string;
  isActive: boolean;
  isSystem: boolean;
};

export type TexEmployeeProfile = {
  id: string;
  userId: string | null;
  name: string;
  phoneNumber: string;
  department: string | null;
  isActive: boolean;
};

export type TexTeam = {
  id: string;
  name: string;
  description: string | null;
};

export type TexIntegrationSettings = {
  whatsappProvider: "ultramsg" | "wappfly" | "meta";
  whatsappInstanceId: string | null;
  wappflySessionId: string | null;
  metaPhoneNumberId: string | null;
  metaWhatsappBusinessAccountId: string | null;
};

export type TexExpenseInput = {
  employeeProfileId?: string | null;
  vendor?: string | null;
  expenseDate: string;
  amount: number;
  currency: string;
  category?: string | null;
  tripId?: string | null;
  tripLegId?: string | null;
  notes?: string | null;
  receiptFileId?: string | null;
  source?: string | null;
};

export type TexExpenseRecord = {
  id: string;
  status: TexExpenseStatus;
  amount: number;
  currency: string;
};

export type TexExpenseListItem = TexExpenseRecord & {
  employeeName: string | null;
  vendor: string | null;
  expenseDate: string;
  category: string | null;
  tripName: string | null;
  notes: string | null;
  createdAt: string;
};

export type TexTripListItem = {
  id: string;
  name: string;
  description: string | null;
  tripType: "general" | "logistics";
  origin: string | null;
  destination: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budgetAmount: number | null;
  enforceCurrency: boolean;
  enforcedCurrency: string | null;
  teamId: string | null;
  teamName: string | null;
  containerNumber: string | null;
  driverEmployeeProfileId: string | null;
  driverName: string | null;
  driverTripAmount: number;
  subcontractorDriverName: string | null;
  subcontractorAmount: number;
  driverPayoutStatus: string;
  expenseCount: number;
  spendAmount: number;
};

export type TexTripInput = {
  name: string;
  description?: string | null;
  tripType?: "general" | "logistics" | null;
  origin?: string | null;
  destination?: string | null;
  budgetAmount?: number | null;
  startDate?: string | null;
  endDate?: string | null;
  enforceCurrency?: boolean | null;
  enforcedCurrency?: string | null;
  teamId?: string | null;
  containerNumber?: string | null;
  driverEmployeeProfileId?: string | null;
  driverTripAmount?: number | null;
  subcontractorDriverName?: string | null;
  subcontractorAmount?: number | null;
  subcontractorNotes?: string | null;
};

export type TexFinanceReview = {
  month: number;
  year: number;
  currency: string;
  approvedExpenses: TexFinanceExpense[];
  tripPayouts: TexFinanceTripPayout[];
  totals: {
    approvedExpenseAmount: number;
    tripPayoutAmount: number;
    netPayable: number;
  };
};

export type TexFinanceExpense = {
  id: string;
  employeeProfileId: string | null;
  employeeName: string | null;
  vendor: string | null;
  expenseDate: string;
  amount: number;
  currency: string;
  baseAmount: number;
  category: string | null;
  tripName: string | null;
  notes: string | null;
  approvedAt: string | null;
};

export type TexFinanceTripPayout = {
  id: string;
  name: string;
  driverEmployeeProfileId: string | null;
  driverName: string | null;
  origin: string | null;
  destination: string | null;
  startDate: string | null;
  driverTripAmount: number;
  subcontractorDriverName: string | null;
  subcontractorAmount: number;
  totalAmount: number;
};

export type TexFinancePaymentInput = {
  expenseIds?: string[];
  tripIds?: string[];
};

export type TexWebhookSubmissionInput = {
  senderRaw?: string | null;
  senderPhone?: string | null;
  whatsappChatJid?: string | null;
  messageId?: string | null;
  sessionId?: string | null;
  messageText?: string | null;
  receiptFileId?: string | null;
  payload: Record<string, unknown>;
};

export type TexWebhookSubmissionRecord = {
  id: string;
  status: "open" | "resolved" | "ignored";
};

export async function resolveTexActorContext(
  client: TenantQueryClient,
  context: ResolvedTenantContext
): Promise<TexActorContext> {
  assertUuid(context.tenantId, "tenant id");
  assertUuid(context.userId, "user id");

  return withTenantContext(client, context, async () => {
    const membership = await client.query<TexMembershipValidationRow>(
      `
        select tm.status as membership_status, u.status as user_status
        from public.tenant_memberships tm
        join public.users u on u.id = tm.user_id
        where tm.tenant_id = public.current_tenant_id()
          and tm.user_id = $1
        limit 1
      `,
      [context.userId]
    );
    const membershipRow = membership.rows[0];

    if (!membershipRow || membershipRow.membership_status !== "active") {
      throw new Error("No active tenant membership was found.");
    }

    if (membershipRow.user_status !== "active") {
      throw new Error("The user is deactivated.");
    }

    const [roles, entitledProducts] = await Promise.all([
      client.query<TexRoleRow>(
        `
          select r.key
          from public.user_role_assignments ura
          join public.roles r on r.id = ura.role_id
          where ura.tenant_id = public.current_tenant_id()
            and ura.user_id = $1
        `,
        [context.userId]
      ),
      client.query<TexProductRow>(
        `
          select p.key
          from public.subscriptions s
          join public.products p on p.id = s.product_id
          where s.tenant_id = public.current_tenant_id()
            and s.status in ('trial', 'active')
            and s.starts_at <= now()
            and (s.expires_at is null or s.expires_at > now())
        `
      )
    ]);
    const resolvedRoles = roles.rows.map((row) => row.key).filter(isRoleKey);
    const resolvedProducts = entitledProducts.rows.map((row) => row.key).filter(isProductKey);

    return {
      ...context,
      roles: resolvedRoles,
      entitledProducts: resolvedProducts,
      moduleAdminProducts: resolvedRoles.includes("customer_module_admin") ? resolvedProducts : []
    };
  });
}

export async function listTexBootstrap(client: TenantQueryClient, actor: TexActorContext): Promise<TexBootstrap> {
  assertTexPermission(actor, "tex.expense.read");

  return withTenantContext(client, actor, async () => {
    const [categories, employeeProfiles, teams, integrationSettings] = await Promise.all([
      client.query<TexExpenseCategoryRow>(
        `
          select id, name, is_active, is_system
          from public.tex_expense_categories
          where tenant_id = public.current_tenant_id()
          order by sort_order asc, name asc
        `
      ),
      client.query<TexEmployeeProfileRow>(
        `
          select id, user_id, name, phone_number, department, is_active
          from public.tex_employee_profiles
          where tenant_id = public.current_tenant_id()
          order by name asc
        `
      ),
      client.query<TexTeamRow>(
        `
          select id, name, description
          from public.tex_teams
          where tenant_id = public.current_tenant_id()
          order by name asc
        `
      ),
      client.query<TexIntegrationSettingsRow>(
        `
          select
            whatsapp_provider,
            whatsapp_instance_id,
            wappfly_session_id,
            meta_phone_number_id,
            meta_whatsapp_business_account_id
          from public.tex_integration_settings
          where tenant_id = public.current_tenant_id()
          limit 1
        `
      )
    ]);

    return {
      categories: categories.rows.map(mapCategory),
      employeeProfiles: employeeProfiles.rows.map(mapEmployeeProfile),
      teams: teams.rows.map(mapTeam),
      integrationSettings: integrationSettings.rows[0] ? mapIntegrationSettings(integrationSettings.rows[0]) : null
    };
  });
}

export async function listTexExpenses(client: TenantQueryClient, actor: TexActorContext): Promise<TexExpenseListItem[]> {
  assertTexPermission(actor, "tex.expense.read");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexExpenseListRow>(
      `
        select
          e.id,
          coalesce(ep.name, e.employee_name) as employee_name,
          e.vendor,
          e.expense_date::text as expense_date,
          e.amount::float as amount,
          e.currency,
          e.category,
          coalesce(t.name, e.trip_name) as trip_name,
          e.notes,
          e.status,
          e.created_at::text as created_at
        from public.tex_expenses e
        left join public.tex_employee_profiles ep
          on ep.tenant_id = e.tenant_id
         and ep.id = e.employee_profile_id
        left join public.tex_trips t
          on t.tenant_id = e.tenant_id
         and t.id = e.trip_id
        where e.tenant_id = public.current_tenant_id()
        order by e.created_at desc
        limit 100
      `
    );

    return result.rows.map(mapExpenseListItem);
  });
}

export async function listTexTrips(client: TenantQueryClient, actor: TexActorContext): Promise<TexTripListItem[]> {
  assertTexPermission(actor, "tex.expense.read");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexTripListRow>(
      `
        select
          t.id,
          t.name,
          t.description,
          t.trip_type,
          t.origin,
          t.destination,
          t.status,
          t.start_date::text as start_date,
          t.end_date::text as end_date,
          t.budget_amount::float as budget_amount,
          t.enforce_currency,
          t.enforced_currency,
          t.team_id,
          team.name as team_name,
          t.container_number,
          t.driver_employee_profile_id,
          driver.name as driver_name,
          t.driver_trip_amount::float as driver_trip_amount,
          t.subcontractor_driver_name,
          t.subcontractor_amount::float as subcontractor_amount,
          t.driver_payout_status,
          count(e.id)::int as expense_count,
          coalesce(sum(e.amount), 0)::float as spend_amount
        from public.tex_trips t
        left join public.tex_teams team
          on team.tenant_id = t.tenant_id
         and team.id = t.team_id
        left join public.tex_employee_profiles driver
          on driver.tenant_id = t.tenant_id
         and driver.id = t.driver_employee_profile_id
        left join public.tex_expenses e
          on e.tenant_id = t.tenant_id
         and e.trip_id = t.id
        where t.tenant_id = public.current_tenant_id()
        group by t.id, team.name, driver.name
        order by t.status = 'open' desc, t.created_at desc
        limit 100
      `
    );

    return result.rows.map(mapTripListItem);
  });
}

export async function createTexTrip(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexTripInput
): Promise<TexTripListItem> {
  assertTexPermission(actor, "tex.expense.manage");
  const trip = sanitizeTrip(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexTripListRow>(
      `
        insert into public.tex_trips (
          tenant_id,
          name,
          description,
          trip_type,
          origin,
          destination,
          budget_amount,
          start_date,
          end_date,
          enforce_currency,
          enforced_currency,
          team_id,
          container_number,
          driver_employee_profile_id,
          driver_trip_amount,
          subcontractor_driver_name,
          subcontractor_amount,
          subcontractor_notes,
          created_by,
          updated_by
        )
        values (
          public.current_tenant_id(),
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $18,
          $18
        )
        returning
          id,
          name,
          description,
          trip_type,
          origin,
          destination,
          status,
          start_date::text as start_date,
          end_date::text as end_date,
          budget_amount::float as budget_amount,
          enforce_currency,
          enforced_currency,
          team_id,
          null::text as team_name,
          container_number,
          driver_employee_profile_id,
          null::text as driver_name,
          driver_trip_amount::float as driver_trip_amount,
          subcontractor_driver_name,
          subcontractor_amount::float as subcontractor_amount,
          driver_payout_status,
          0::int as expense_count,
          0::float as spend_amount
      `,
      tripValues(trip, actor.userId)
    );
    const row = requireSingleRow(result.rows, "trip");
    await writeTexAuditEvent(client, actor, "tex.trip.created", "tex_trip", row.id, {
      name: row.name
    });

    return mapTripListItem(row);
  });
}

export async function updateTexTrip(
  client: TenantQueryClient,
  actor: TexActorContext,
  tripId: string,
  input: TexTripInput
): Promise<TexTripListItem> {
  assertTexPermission(actor, "tex.expense.manage");
  assertUuid(tripId, "trip id");
  const trip = sanitizeTrip(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexTripListRow>(
      `
        update public.tex_trips
           set name = $1,
               description = $2,
               trip_type = $3,
               origin = $4,
               destination = $5,
               budget_amount = $6,
               start_date = $7,
               end_date = $8,
               enforce_currency = $9,
               enforced_currency = $10,
               team_id = $11,
               container_number = $12,
               driver_employee_profile_id = $13,
               driver_trip_amount = $14,
               subcontractor_driver_name = $15,
               subcontractor_amount = $16,
               subcontractor_notes = $17,
               updated_by = $18
         where tenant_id = public.current_tenant_id()
           and id = $19
        returning
          id,
          name,
          description,
          trip_type,
          origin,
          destination,
          status,
          start_date::text as start_date,
          end_date::text as end_date,
          budget_amount::float as budget_amount,
          enforce_currency,
          enforced_currency,
          team_id,
          null::text as team_name,
          container_number,
          driver_employee_profile_id,
          null::text as driver_name,
          driver_trip_amount::float as driver_trip_amount,
          subcontractor_driver_name,
          subcontractor_amount::float as subcontractor_amount,
          driver_payout_status,
          0::int as expense_count,
          0::float as spend_amount
      `,
      [...tripValues(trip, actor.userId), tripId]
    );
    const row = requireSingleRow(result.rows, "trip");
    await writeTexAuditEvent(client, actor, "tex.trip.updated", "tex_trip", row.id, {
      name: row.name
    });

    return mapTripListItem(row);
  });
}

export async function closeTexTrip(
  client: TenantQueryClient,
  actor: TexActorContext,
  tripId: string
): Promise<TexTripListItem> {
  assertTexPermission(actor, "tex.expense.manage");
  assertUuid(tripId, "trip id");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexTripListRow>(
      `
        update public.tex_trips
           set status = 'closed',
               updated_by = $1
         where tenant_id = public.current_tenant_id()
           and id = $2
        returning
          id,
          name,
          description,
          trip_type,
          origin,
          destination,
          status,
          start_date::text as start_date,
          end_date::text as end_date,
          budget_amount::float as budget_amount,
          enforce_currency,
          enforced_currency,
          team_id,
          null::text as team_name,
          container_number,
          driver_employee_profile_id,
          null::text as driver_name,
          driver_trip_amount::float as driver_trip_amount,
          subcontractor_driver_name,
          subcontractor_amount::float as subcontractor_amount,
          driver_payout_status,
          0::int as expense_count,
          0::float as spend_amount
      `,
      [actor.userId, tripId]
    );
    const row = requireSingleRow(result.rows, "trip");
    await writeTexAuditEvent(client, actor, "tex.trip.closed", "tex_trip", row.id, {
      name: row.name
    });

    return mapTripListItem(row);
  });
}

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
        await writeTexAuditEvent(client, actor, "tex.finance.trip_payout_paid", "tex_trip", row.id, {
          status: "paid"
        });
      }
    }

    return { paidExpenses, paidTrips };
  });
}

export async function createTexExpense(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexExpenseInput
): Promise<TexExpenseRecord> {
  assertTexPermission(actor, "tex.expense.submit");
  const expense = sanitizeExpense(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexExpenseRow>(
      `
        insert into public.tex_expenses (
          tenant_id,
          submitter_user_id,
          employee_profile_id,
          vendor,
          expense_date,
          amount,
          currency,
          category,
          trip_id,
          trip_leg_id,
          notes,
          receipt_file_id,
          source,
          created_by,
          updated_by
        )
        values (
          public.current_tenant_id(),
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8,
          $9,
          $10,
          $11,
          $12,
          $1,
          $1
        )
        returning id, status, amount::float as amount, currency
      `,
      [
        actor.userId,
        expense.employeeProfileId,
        expense.vendor,
        expense.expenseDate,
        expense.amount,
        expense.currency,
        expense.category,
        expense.tripId,
        expense.tripLegId,
        expense.notes,
        expense.receiptFileId,
        expense.source
      ]
    );
    const row = requireSingleRow(result.rows, "expense");
    await writeTexAuditEvent(client, actor, "tex.expense.created", "tex_expense", row.id, {
      amount: String(row.amount),
      currency: row.currency,
      source: expense.source ?? "web"
    });

    return mapExpense(row);
  });
}

export async function updateTexExpenseStatus(
  client: TenantQueryClient,
  actor: TexActorContext,
  expenseId: string,
  status: Exclude<TexExpenseStatus, "pending">,
  reason?: string | null
): Promise<TexExpenseRecord> {
  assertUuid(expenseId, "expense id");
  assertExpenseStatus(status);

  if (status === "paid") {
    assertTexPermission(actor, "tex.finance.review");
  } else {
    assertTexPermission(actor, "tex.expense.approve");
  }

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexExpenseRow>(
      `
        update public.tex_expenses
           set status = $1,
               approved_by = case when $1 = 'approved' then $2 else approved_by end,
               approved_at = case when $1 = 'approved' then now() else approved_at end,
               rejected_by = case when $1 = 'rejected' then $2 else rejected_by end,
               rejected_at = case when $1 = 'rejected' then now() else rejected_at end,
               rejected_reason = case when $1 = 'rejected' then $3 else rejected_reason end,
               paid_by = case when $1 = 'paid' then $2 else paid_by end,
               paid_at = case when $1 = 'paid' then now() else paid_at end,
               updated_by = $2
         where tenant_id = public.current_tenant_id()
           and id = $4
         returning id, status, amount::float as amount, currency
      `,
      [status, actor.userId, cleanOptional(reason), expenseId]
    );
    const row = requireSingleRow(result.rows, "expense");
    await writeTexAuditEvent(client, actor, `tex.expense.${status}`, "tex_expense", row.id, {
      status
    });

    return mapExpense(row);
  });
}

export async function recordTexWebhookSubmission(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexWebhookSubmissionInput
): Promise<TexWebhookSubmissionRecord> {
  assertTexPermission(actor, "tex.integration.manage");
  const submission = sanitizeWebhookSubmission(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexWebhookSubmissionRow>(
      `
        insert into public.tex_unregistered_whatsapp_submissions (
          tenant_id,
          sender_raw,
          sender_phone,
          whatsapp_chat_jid,
          message_id,
          session_id,
          message_text,
          receipt_file_id,
          payload,
          created_by,
          updated_by
        )
        values (
          public.current_tenant_id(),
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::jsonb,
          $9,
          $9
        )
        on conflict (tenant_id, message_id)
        where message_id is not null
        do update set
          payload = excluded.payload,
          updated_by = excluded.updated_by,
          updated_at = now()
        returning id, status
      `,
      [
        submission.senderRaw,
        submission.senderPhone,
        submission.whatsappChatJid,
        submission.messageId,
        submission.sessionId,
        submission.messageText,
        submission.receiptFileId,
        JSON.stringify(submission.payload),
        actor.userId
      ]
    );
    const row = requireSingleRow(result.rows, "webhook submission");
    await writeTexAuditEvent(client, actor, "tex.webhook.submission_recorded", "tex_unregistered_whatsapp_submission", row.id, {
      provider: "whatsapp",
      message_id: submission.messageId ?? ""
    });

    return {
      id: row.id,
      status: row.status
    };
  });
}

function assertTexPermission(actor: TexActorContext, permission: PermissionKey) {
  if (actor.roleScope !== "customer") {
    throw new Error("TEX access requires a customer tenant context.");
  }

  assertPermission({
    roles: actor.roles,
    permission,
    entitledProducts: actor.entitledProducts,
    moduleAdminProducts: actor.moduleAdminProducts,
    integrationPermissions: actor.integrationPermissions
  });
}

async function writeTexAuditEvent(
  client: TenantQueryClient,
  actor: TexActorContext,
  action: string,
  targetType: string,
  targetId: string,
  metadata: Record<string, string>
) {
  await client.query(
    `
      insert into public.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
      values (public.current_tenant_id(), $1, $2, $3, $4, $5::jsonb)
    `,
    [actor.userId, action, targetType, targetId, JSON.stringify(metadata)]
  );
}

function sanitizeExpense(input: TexExpenseInput): Required<TexExpenseInput> {
  const amount = Number(input.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Expense amount must be greater than zero.");
  }

  const expenseDate = parseIsoDate(input.expenseDate, "expense date");
  const currency = input.currency.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Expense currency must be a three-letter ISO code.");
  }

  return {
    employeeProfileId: cleanOptional(input.employeeProfileId),
    vendor: cleanOptional(input.vendor),
    expenseDate,
    amount,
    currency,
    category: cleanOptional(input.category),
    tripId: cleanOptional(input.tripId),
    tripLegId: cleanOptional(input.tripLegId),
    notes: cleanOptional(input.notes),
    receiptFileId: cleanOptional(input.receiptFileId),
    source: cleanOptional(input.source) ?? "web"
  };
}

function sanitizeWebhookSubmission(input: TexWebhookSubmissionInput): Required<TexWebhookSubmissionInput> {
  return {
    senderRaw: cleanOptional(input.senderRaw),
    senderPhone: cleanOptional(input.senderPhone),
    whatsappChatJid: cleanOptional(input.whatsappChatJid),
    messageId: cleanOptional(input.messageId),
    sessionId: cleanOptional(input.sessionId),
    messageText: cleanOptional(input.messageText),
    receiptFileId: cleanOptional(input.receiptFileId),
    payload: input.payload ?? {}
  };
}

function sanitizeTrip(input: TexTripInput): Required<TexTripInput> {
  const name = input.name.trim();

  if (!name) {
    throw new Error("Trip name is required.");
  }

  const tripType = input.tripType === "logistics" ? "logistics" : "general";
  const budgetAmount = optionalNonNegative(input.budgetAmount, "budget amount");
  const driverTripAmount = optionalNonNegative(input.driverTripAmount, "driver trip amount") ?? 0;
  const subcontractorAmount = optionalNonNegative(input.subcontractorAmount, "subcontractor amount") ?? 0;
  const enforceCurrency = Boolean(input.enforceCurrency);
  const enforcedCurrency = cleanOptional(input.enforcedCurrency)?.toUpperCase() ?? null;

  if (enforceCurrency && (!enforcedCurrency || !/^[A-Z]{3}$/.test(enforcedCurrency))) {
    throw new Error("Enforced currency must be a three-letter ISO code.");
  }

  return {
    name,
    description: cleanOptional(input.description),
    tripType,
    origin: cleanOptional(input.origin),
    destination: cleanOptional(input.destination),
    budgetAmount,
    startDate: input.startDate ? parseIsoDate(input.startDate, "start date") : null,
    endDate: input.endDate ? parseIsoDate(input.endDate, "end date") : null,
    enforceCurrency,
    enforcedCurrency: enforceCurrency ? enforcedCurrency : null,
    teamId: cleanOptional(input.teamId),
    containerNumber: cleanOptional(input.containerNumber),
    driverEmployeeProfileId: cleanOptional(input.driverEmployeeProfileId),
    driverTripAmount,
    subcontractorDriverName: cleanOptional(input.subcontractorDriverName),
    subcontractorAmount,
    subcontractorNotes: cleanOptional(input.subcontractorNotes)
  };
}

function optionalNonNegative(value: number | null | undefined, label: string) {
  if (value === null || value === undefined || value === 0) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Trip ${label} cannot be negative.`);
  }

  return parsed;
}

function tripValues(trip: Required<TexTripInput>, userId: string) {
  return [
    trip.name,
    trip.description,
    trip.tripType,
    trip.origin,
    trip.destination,
    trip.budgetAmount,
    trip.startDate,
    trip.endDate,
    trip.enforceCurrency,
    trip.enforcedCurrency,
    trip.teamId,
    trip.containerNumber,
    trip.driverEmployeeProfileId,
    trip.driverTripAmount,
    trip.subcontractorDriverName,
    trip.subcontractorAmount,
    trip.subcontractorNotes,
    userId
  ];
}

function sanitizeFinancePeriod(month: number, year: number) {
  const parsedMonth = Number(month);
  const parsedYear = Number(year);

  if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    throw new Error("Invalid finance review month.");
  }

  if (!Number.isInteger(parsedYear) || parsedYear < 2020 || parsedYear > 2100) {
    throw new Error("Invalid finance review year.");
  }

  return { month: parsedMonth, year: parsedYear };
}

function uniqueUuids(values: string[], label: string) {
  const unique = Array.from(new Set(values));

  for (const value of unique) {
    assertUuid(value, label);
  }

  return unique;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function parseIsoDate(value: string, label: string) {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid ${label}.`);
  }

  const date = new Date(`${trimmed}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label}.`);
  }

  return trimmed;
}

function assertExpenseStatus(status: string): asserts status is Exclude<TexExpenseStatus, "pending"> {
  if (status !== "approved" && status !== "rejected" && status !== "paid") {
    throw new Error(`Unsupported TEX expense status: ${status}`);
  }
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function cleanOptional(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function requireSingleRow<Row>(rows: readonly Row[], label: string) {
  const [row] = rows;

  if (!row) {
    throw new Error(`Unable to find ${label}.`);
  }

  return row;
}

function mapCategory(row: TexExpenseCategoryRow): TexExpenseCategory {
  return {
    id: row.id,
    name: row.name,
    isActive: row.is_active,
    isSystem: row.is_system
  };
}

function mapEmployeeProfile(row: TexEmployeeProfileRow): TexEmployeeProfile {
  return {
    id: row.id,
    userId: row.user_id,
    name: row.name,
    phoneNumber: row.phone_number,
    department: row.department,
    isActive: row.is_active
  };
}

function mapTeam(row: TexTeamRow): TexTeam {
  return {
    id: row.id,
    name: row.name,
    description: row.description
  };
}

function mapIntegrationSettings(row: TexIntegrationSettingsRow): TexIntegrationSettings {
  return {
    whatsappProvider: row.whatsapp_provider,
    whatsappInstanceId: row.whatsapp_instance_id,
    wappflySessionId: row.wappfly_session_id,
    metaPhoneNumberId: row.meta_phone_number_id,
    metaWhatsappBusinessAccountId: row.meta_whatsapp_business_account_id
  };
}

function mapExpense(row: TexExpenseRow): TexExpenseRecord {
  return {
    id: row.id,
    status: row.status,
    amount: row.amount,
    currency: row.currency
  };
}

function mapExpenseListItem(row: TexExpenseListRow): TexExpenseListItem {
  return {
    id: row.id,
    status: row.status,
    amount: row.amount,
    currency: row.currency,
    employeeName: row.employee_name,
    vendor: row.vendor,
    expenseDate: row.expense_date,
    category: row.category,
    tripName: row.trip_name,
    notes: row.notes,
    createdAt: row.created_at
  };
}

function mapTripListItem(row: TexTripListRow): TexTripListItem {
  return {
    id: row.id,
    name: row.name,
    description: row.description,
    tripType: row.trip_type,
    origin: row.origin,
    destination: row.destination,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    budgetAmount: row.budget_amount,
    enforceCurrency: row.enforce_currency,
    enforcedCurrency: row.enforced_currency,
    teamId: row.team_id,
    teamName: row.team_name,
    containerNumber: row.container_number,
    driverEmployeeProfileId: row.driver_employee_profile_id,
    driverName: row.driver_name,
    driverTripAmount: row.driver_trip_amount,
    subcontractorDriverName: row.subcontractor_driver_name,
    subcontractorAmount: row.subcontractor_amount,
    driverPayoutStatus: row.driver_payout_status,
    expenseCount: row.expense_count,
    spendAmount: row.spend_amount
  };
}

function mapFinanceExpense(row: TexFinanceExpenseRow): TexFinanceExpense {
  return {
    id: row.id,
    employeeProfileId: row.employee_profile_id,
    employeeName: row.employee_name,
    vendor: row.vendor,
    expenseDate: row.expense_date,
    amount: row.amount,
    currency: row.currency,
    baseAmount: row.base_amount,
    category: row.category,
    tripName: row.trip_name,
    notes: row.notes,
    approvedAt: row.approved_at
  };
}

function mapFinanceTripPayout(row: TexFinanceTripPayoutRow): TexFinanceTripPayout {
  return {
    id: row.id,
    name: row.name,
    driverEmployeeProfileId: row.driver_employee_profile_id,
    driverName: row.driver_name,
    origin: row.origin,
    destination: row.destination,
    startDate: row.start_date,
    driverTripAmount: row.driver_trip_amount,
    subcontractorDriverName: row.subcontractor_driver_name,
    subcontractorAmount: row.subcontractor_amount,
    totalAmount: row.total_amount
  };
}

type TexExpenseCategoryRow = {
  id: string;
  name: string;
  is_active: boolean;
  is_system: boolean;
};

type TexEmployeeProfileRow = {
  id: string;
  user_id: string | null;
  name: string;
  phone_number: string;
  department: string | null;
  is_active: boolean;
};

type TexTeamRow = {
  id: string;
  name: string;
  description: string | null;
};

type TexIntegrationSettingsRow = {
  whatsapp_provider: "ultramsg" | "wappfly" | "meta";
  whatsapp_instance_id: string | null;
  wappfly_session_id: string | null;
  meta_phone_number_id: string | null;
  meta_whatsapp_business_account_id: string | null;
};

type TexExpenseRow = {
  id: string;
  status: TexExpenseStatus;
  amount: number;
  currency: string;
};

type TexExpenseListRow = TexExpenseRow & {
  employee_name: string | null;
  vendor: string | null;
  expense_date: string;
  category: string | null;
  trip_name: string | null;
  notes: string | null;
  created_at: string;
};

type TexTripListRow = {
  id: string;
  name: string;
  description: string | null;
  trip_type: "general" | "logistics";
  origin: string | null;
  destination: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  budget_amount: number | null;
  enforce_currency: boolean;
  enforced_currency: string | null;
  team_id: string | null;
  team_name: string | null;
  container_number: string | null;
  driver_employee_profile_id: string | null;
  driver_name: string | null;
  driver_trip_amount: number;
  subcontractor_driver_name: string | null;
  subcontractor_amount: number;
  driver_payout_status: string;
  expense_count: number;
  spend_amount: number;
};

type TexFinanceExpenseRow = {
  id: string;
  employee_profile_id: string | null;
  employee_name: string | null;
  vendor: string | null;
  expense_date: string;
  amount: number;
  currency: string;
  base_amount: number;
  category: string | null;
  trip_name: string | null;
  notes: string | null;
  approved_at: string | null;
};

type TexFinanceTripPayoutRow = {
  id: string;
  name: string;
  driver_employee_profile_id: string | null;
  driver_name: string | null;
  origin: string | null;
  destination: string | null;
  start_date: string | null;
  driver_trip_amount: number;
  subcontractor_driver_name: string | null;
  subcontractor_amount: number;
  total_amount: number;
};

type TexWebhookSubmissionRow = {
  id: string;
  status: "open" | "resolved" | "ignored";
};

type TexMembershipValidationRow = {
  membership_status: "active" | "invited" | "disabled";
  user_status: "active" | "deactivated";
};

type TexRoleRow = {
  key: string;
};

type TexProductRow = {
  key: string;
};

function isRoleKey(value: string): value is RoleKey {
  return (roleKeys as readonly string[]).includes(value);
}

function isProductKey(value: string): value is ProductKey {
  return value === "crm" || value === "fsm" || value === "tex" || value === "cme" || value === "lqs";
}
