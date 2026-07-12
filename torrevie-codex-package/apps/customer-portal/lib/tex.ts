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
  origin: string | null;
  destination: string | null;
  status: string;
  startDate: string | null;
  endDate: string | null;
  budgetAmount: number | null;
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
          id,
          name,
          origin,
          destination,
          status,
          start_date::text as start_date,
          end_date::text as end_date,
          budget_amount::float as budget_amount
        from public.tex_trips
        where tenant_id = public.current_tenant_id()
        order by created_at desc
        limit 100
      `
    );

    return result.rows.map(mapTripListItem);
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
    origin: row.origin,
    destination: row.destination,
    status: row.status,
    startDate: row.start_date,
    endDate: row.end_date,
    budgetAmount: row.budget_amount
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
  origin: string | null;
  destination: string | null;
  status: string;
  start_date: string | null;
  end_date: string | null;
  budget_amount: number | null;
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
