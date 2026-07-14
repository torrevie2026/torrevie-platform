import { randomUUID } from "node:crypto";
import {
  assertPermission,
  roleKeys,
  type PermissionKey,
  type ProductKey,
  type RoleKey
} from "@torrevie/permissions";
import {
  dispatchWhatsAppNotification,
  type WhatsAppDispatchResult,
  type WhatsAppProvider
} from "@torrevie/notifications";
import {
  withTenantContext,
  type ResolvedTenantContext,
  type TenantQueryClient
} from "@torrevie/tenant-context";
import { extractReceiptWithAI, type TexReceiptExtraction } from "./tex-ai";

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
  sortOrder: number;
};

export type TexExpenseCategoryInput = {
  name: string;
  isActive?: boolean | null;
  sortOrder?: number | null;
};

export type TexEmployeeProfile = {
  id: string;
  userId: string | null;
  name: string;
  phoneNumber: string;
  department: string | null;
  isActive: boolean;
};

export type TexEmployeeProfileInput = {
  name: string;
  phoneNumber: string;
  department?: string | null;
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
  aiReceiptExtractionEnabled: boolean;
  duplicateDetectionEnabled: boolean;
  duplicateAutoRejectEnabled: boolean;
  duplicateSimilarityThreshold: number;
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
  paymentMethod?: string | null;
  taxIdNumber?: string | null;
  taxAmount?: number | null;
  receiptFileId?: string | null;
  extractionSource?: "manual" | "web_ai" | "whatsapp_ai" | null;
  extractionConfidence?: number | null;
  extractionPayload?: Record<string, unknown> | null;
  source?: string | null;
};

export type TexExpenseRecord = {
  id: string;
  status: TexExpenseStatus;
  amount: number;
  currency: string;
};

export type TexReceiptUploadInput = {
  fileName: string;
  contentType: string;
  dataBase64: string;
};

export type TexReceiptFileRecord = {
  id: string;
  storagePath: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
  url: string;
};

export type TexExpenseListItem = TexExpenseRecord & {
  employeeName: string | null;
  vendor: string | null;
  expenseDate: string;
  category: string | null;
  tripName: string | null;
  notes: string | null;
  createdAt: string;
  duplicateStatus: "clear" | "suspected" | "duplicate";
  duplicateReason: string | null;
  managerReviewRequired: boolean;
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
  legCount: number;
  totalDistanceKm: number;
  expenseCount: number;
  spendAmount: number;
};

export type TexTripLegMode = "road" | "sea" | "air" | "rail";
export type TexTripLegStatus = "planned" | "in_transit" | "completed" | "cancelled";

export type TexTripLeg = {
  id: string;
  sequence: number;
  origin: string;
  originPlaceId: string | null;
  originLat: number | null;
  originLng: number | null;
  originCountry: string | null;
  destination: string;
  destinationPlaceId: string | null;
  destinationLat: number | null;
  destinationLng: number | null;
  destinationCountry: string | null;
  mode: TexTripLegMode | null;
  status: TexTripLegStatus;
  plannedStart: string | null;
  plannedEnd: string | null;
  actualStart: string | null;
  actualEnd: string | null;
  distanceKm: number | null;
  isReturnTrip: boolean;
  returnDistanceKm: number | null;
  returnDurationSeconds: number | null;
  totalDistanceKm: number | null;
  durationSeconds: number | null;
  distanceSource: string | null;
  routePolyline: string | null;
  budgetAmount: number | null;
  containerRef: string | null;
  notes: string | null;
};

export type TexTripLegInput = {
  id?: string | null;
  sequence?: number | null;
  origin: string;
  originPlaceId?: string | null;
  originLat?: number | null;
  originLng?: number | null;
  originCountry?: string | null;
  destination: string;
  destinationPlaceId?: string | null;
  destinationLat?: number | null;
  destinationLng?: number | null;
  destinationCountry?: string | null;
  mode?: TexTripLegMode | null;
  status?: TexTripLegStatus | null;
  plannedStart?: string | null;
  plannedEnd?: string | null;
  actualStart?: string | null;
  actualEnd?: string | null;
  distanceKm?: number | null;
  isReturnTrip?: boolean | null;
  returnDistanceKm?: number | null;
  returnDurationSeconds?: number | null;
  totalDistanceKm?: number | null;
  durationSeconds?: number | null;
  distanceSource?: string | null;
  routePolyline?: string | null;
  budgetAmount?: number | null;
  containerRef?: string | null;
  notes?: string | null;
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

export type TexDriverAdvanceInput = {
  employeeProfileId?: string | null;
  amount: number;
  currency?: string | null;
  baseAmount?: number | null;
  advanceDate?: string | null;
  month?: number | null;
  year?: number | null;
  notes?: string | null;
};

export type TexDriverAdvance = {
  id: string;
  employeeProfileId: string;
  amount: number;
  currency: string;
  baseAmount: number;
  advanceDate: string;
  month: number;
  year: number;
  notes: string | null;
};

export type TexNotificationInput = {
  userId?: string | null;
  title: string;
  body?: string | null;
  type?: string | null;
  relatedExpenseId?: string | null;
  relatedTripId?: string | null;
};

export type TexNotification = {
  id: string;
  userId: string | null;
  title: string;
  body: string | null;
  type: string | null;
  relatedExpenseId: string | null;
  relatedTripId: string | null;
  isRead: boolean;
  createdAt: string;
};

export type TexSpendPolicy = {
  id: string | null;
  category: string;
  dailyLimit: number | null;
  monthlyLimit: number | null;
  requiresNotesAbove: number | null;
  isBlocked: boolean;
};

export type TexSpendPolicyInput = {
  category: string;
  dailyLimit?: number | null;
  monthlyLimit?: number | null;
  requiresNotesAbove?: number | null;
  isBlocked?: boolean | null;
};

export type TexBudget = {
  id: string;
  department: string;
  month: number;
  year: number;
  budgetAmount: number;
  spentAmount: number;
  remainingAmount: number;
};

export type TexBudgetInput = {
  department: string;
  month: number;
  year: number;
  budgetAmount: number;
};

export type TexSettingsWorkspace = {
  categories: TexExpenseCategory[];
  policies: TexSpendPolicy[];
  budgets: TexBudget[];
  departments: string[];
  month: number;
  year: number;
};

export type TexWebhookSubmissionInput = {
  senderRaw?: string | null;
  senderPhone?: string | null;
  whatsappChatJid?: string | null;
  messageId?: string | null;
  sessionId?: string | null;
  messageText?: string | null;
  receiptFileId?: string | null;
  mediaUrl?: string | null;
  mediaMimeType?: string | null;
  extractedReceipt?: TexReceiptExtraction | null;
  payload: Record<string, unknown>;
};

export type TexWebhookSubmissionRecord = {
  id: string;
  status: "open" | "resolved" | "ignored";
};

export type TexUnregisteredWhatsappSubmission = TexWebhookSubmissionRecord & {
  senderRaw: string | null;
  senderPhone: string | null;
  whatsappChatJid: string | null;
  messageId: string | null;
  sessionId: string | null;
  messageText: string | null;
  receiptFileId: string | null;
  mediaUrl: string | null;
  mediaMimeType: string | null;
  messageType: "receipt" | "status" | "text";
  ocrStatus: TexWhatsappReceiptResult["ocrStatus"];
  ocrResult: TexReceiptExtraction | null;
  ocrError: string | null;
  whatsappReplyText: string | null;
  resolvedExpenseId: string | null;
  resolvedEmployeeProfileId: string | null;
  resolvedAt: string | null;
  createdAt: string;
};

export type TexUnregisteredWhatsappResolveInput = {
  mode: "existing_employee" | "new_employee";
  employeeProfileId?: string | null;
  employeeName?: string | null;
  phoneNumber?: string | null;
  department?: string | null;
};

export type TexUnregisteredWhatsappResolveResult = {
  submission: TexWebhookSubmissionRecord;
  employee: TexEmployeeProfile;
  expense: TexExpenseRecord;
  delivery: WhatsAppDispatchResult | null;
};

export type TexWhatsappReceiptResult = {
  submission: TexWebhookSubmissionRecord;
  replyText: string;
  expense: TexExpenseRecord | null;
  ocrStatus: "pending" | "processing" | "extracted" | "failed" | "manual_review" | "not_applicable";
  delivery: WhatsAppDispatchResult | null;
};

let texWhatsappNotificationDispatcher = dispatchWhatsAppNotification;

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

export async function listTexBootstrap(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexBootstrap> {
  assertTexPermission(actor, "tex.expense.read");

  return withTenantContext(client, actor, async () => {
    const [categories, employeeProfiles, teams, integrationSettings] = await Promise.all([
      client.query<TexExpenseCategoryRow>(
        `
          select id, name, is_active, is_system, sort_order
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
            meta_whatsapp_business_account_id,
            ai_receipt_extraction_enabled,
            duplicate_detection_enabled,
            duplicate_auto_reject_enabled,
            duplicate_similarity_threshold::float as duplicate_similarity_threshold
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
      integrationSettings: integrationSettings.rows[0]
        ? mapIntegrationSettings(integrationSettings.rows[0])
        : null
    };
  });
}

export async function listTexExpenses(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexExpenseListItem[]> {
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
          e.created_at::text as created_at,
          e.duplicate_status,
          e.duplicate_reason,
          e.manager_review_required
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

export async function updateTexEmployeeProfile(
  client: TenantQueryClient,
  actor: TexActorContext,
  employeeProfileId: string,
  input: TexEmployeeProfileInput
): Promise<TexEmployeeProfile> {
  assertTexPermission(actor, "tex.people.manage");
  assertUuid(employeeProfileId, "employee profile id");

  const name = cleanRequired(input.name, "Employee name");
  const phoneNumber = normalizePhoneDigits(input.phoneNumber);
  const department = cleanOptional(input.department);

  if (!phoneNumber) {
    throw new Error("Employee WhatsApp phone is required.");
  }

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexEmployeeProfileRow>(
      `
        update public.tex_employee_profiles
           set name = $2,
               phone_number = $3,
               department = $4,
               is_active = $5,
               updated_by = $6
         where tenant_id = public.current_tenant_id()
           and id = $1
        returning id, user_id, name, phone_number, department, is_active
      `,
      [employeeProfileId, name, phoneNumber, department, input.isActive, actor.userId]
    );
    const employee = requireSingleRow(result.rows, "employee profile");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.employee.updated",
      "tex_employee_profile",
      employee.id,
      {
        employee_name: employee.name
      }
    );

    return mapEmployeeProfile(employee);
  });
}

export async function deleteTexEmployeeProfile(
  client: TenantQueryClient,
  actor: TexActorContext,
  employeeProfileId: string
): Promise<void> {
  assertTexPermission(actor, "tex.people.manage");
  assertUuid(employeeProfileId, "employee profile id");

  await withTenantContext(client, actor, async () => {
    const result = await client.query<{ id: string; name: string }>(
      `
        delete from public.tex_employee_profiles
         where tenant_id = public.current_tenant_id()
           and id = $1
        returning id, name
      `,
      [employeeProfileId]
    );
    const employee = requireSingleRow(result.rows, "employee profile");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.employee.deleted",
      "tex_employee_profile",
      employee.id,
      {
        employee_name: employee.name
      }
    );
  });
}

export async function listTexTrips(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexTripListItem[]> {
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
          (select count(*)::int from public.tex_trip_legs leg where leg.tenant_id = t.tenant_id and leg.trip_id = t.id) as leg_count,
          (
            select coalesce(sum(coalesce(leg.total_distance_km, leg.distance_km, 0)), 0)::float
            from public.tex_trip_legs leg
            where leg.tenant_id = t.tenant_id
              and leg.trip_id = t.id
          ) as total_distance_km,
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
          0::int as leg_count,
          0::float as total_distance_km,
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
          0::int as leg_count,
          0::float as total_distance_km,
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
          (select count(*)::int from public.tex_trip_legs where tenant_id = public.current_tenant_id() and trip_id = public.tex_trips.id) as leg_count,
          (select coalesce(sum(coalesce(total_distance_km, distance_km, 0)), 0)::float from public.tex_trip_legs where tenant_id = public.current_tenant_id() and trip_id = public.tex_trips.id) as total_distance_km,
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

export async function listTexTripLegs(
  client: TenantQueryClient,
  actor: TexActorContext,
  tripId: string
): Promise<TexTripLeg[]> {
  assertTexPermission(actor, "tex.expense.read");
  assertUuid(tripId, "trip id");

  return withTenantContext(client, actor, async () => {
    await assertTripExists(client, tripId);
    const result = await client.query<TexTripLegRow>(
      `
        select
          id,
          sequence,
          origin,
          origin_place_id,
          origin_lat::float as origin_lat,
          origin_lng::float as origin_lng,
          origin_country,
          destination,
          destination_place_id,
          destination_lat::float as destination_lat,
          destination_lng::float as destination_lng,
          destination_country,
          mode,
          status,
          planned_start::text as planned_start,
          planned_end::text as planned_end,
          actual_start::text as actual_start,
          actual_end::text as actual_end,
          distance_km::float as distance_km,
          is_return_trip,
          return_distance_km::float as return_distance_km,
          return_duration_seconds,
          total_distance_km::float as total_distance_km,
          duration_seconds,
          distance_source,
          route_polyline,
          budget_amount::float as budget_amount,
          container_ref,
          notes
        from public.tex_trip_legs
        where tenant_id = public.current_tenant_id()
          and trip_id = $1
        order by sequence asc, created_at asc
      `,
      [tripId]
    );

    return result.rows.map(mapTripLeg);
  });
}

export async function replaceTexTripLegs(
  client: TenantQueryClient,
  actor: TexActorContext,
  tripId: string,
  input: { legs?: TexTripLegInput[] }
): Promise<TexTripLeg[]> {
  assertTexPermission(actor, "tex.trip.manage");
  assertUuid(tripId, "trip id");
  const legs = sanitizeTripLegs(input.legs ?? []);

  return withTenantContext(client, actor, async () => {
    await assertTripExists(client, tripId);
    const savedIds: string[] = [];

    for (const leg of legs) {
      const result = leg.id
        ? await client.query<{ id: string }>(
            `
              update public.tex_trip_legs
                 set sequence = $1,
                     origin = $2,
                     origin_place_id = $3,
                     origin_lat = $4,
                     origin_lng = $5,
                     origin_country = $6,
                     destination = $7,
                     destination_place_id = $8,
                     destination_lat = $9,
                     destination_lng = $10,
                     destination_country = $11,
                     mode = $12,
                     status = $13,
                     planned_start = $14,
                     planned_end = $15,
                     actual_start = $16,
                     actual_end = $17,
                     distance_km = $18,
                     is_return_trip = $19,
                     return_distance_km = $20,
                     return_duration_seconds = $21,
                     total_distance_km = $22,
                     duration_seconds = $23,
                     distance_source = $24,
                     route_polyline = $25,
                     budget_amount = $26,
                     container_ref = $27,
                     notes = $28,
                     updated_by = $29
               where tenant_id = public.current_tenant_id()
                 and trip_id = $30
                 and id = $31
              returning id
            `,
            [...tripLegValues(leg), actor.userId, tripId, leg.id]
          )
        : await client.query<{ id: string }>(
            `
              insert into public.tex_trip_legs (
                tenant_id,
                trip_id,
                sequence,
                origin,
                origin_place_id,
                origin_lat,
                origin_lng,
                origin_country,
                destination,
                destination_place_id,
                destination_lat,
                destination_lng,
                destination_country,
                mode,
                status,
                planned_start,
                planned_end,
                actual_start,
                actual_end,
                distance_km,
                is_return_trip,
                return_distance_km,
                return_duration_seconds,
                total_distance_km,
                duration_seconds,
                distance_source,
                route_polyline,
                budget_amount,
                container_ref,
                notes,
                created_by,
                updated_by
              )
              values (
                public.current_tenant_id(),
                $29,
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
                $19,
                $20,
                $21,
                $22,
                $23,
                $24,
                $25,
                $26,
                $27,
                $28,
                $30,
                $30
              )
              returning id
            `,
            [...tripLegValues(leg), tripId, actor.userId]
          );
      const row = requireSingleRow(result.rows, "trip leg");
      savedIds.push(row.id);
    }

    if (savedIds.length > 0) {
      await client.query(
        `
          delete from public.tex_trip_legs
           where tenant_id = public.current_tenant_id()
             and trip_id = $1
             and not (id = any(string_to_array($2, ',')::uuid[]))
        `,
        [tripId, savedIds.join(",")]
      );
    } else {
      await client.query(
        `
          delete from public.tex_trip_legs
           where tenant_id = public.current_tenant_id()
             and trip_id = $1
        `,
        [tripId]
      );
    }

    await writeTexAuditEvent(client, actor, "tex.trip.legs_updated", "tex_trip", tripId, {
      leg_count: String(savedIds.length)
    });

    return listTexTripLegs(client, actor, tripId);
  });
}

export async function deleteTexTripLeg(
  client: TenantQueryClient,
  actor: TexActorContext,
  tripId: string,
  legId: string
): Promise<void> {
  assertTexPermission(actor, "tex.trip.manage");
  assertUuid(tripId, "trip id");
  assertUuid(legId, "trip leg id");

  await withTenantContext(client, actor, async () => {
    await assertTripExists(client, tripId);
    await client.query(
      `
        delete from public.tex_trip_legs
         where tenant_id = public.current_tenant_id()
           and trip_id = $1
           and id = $2
      `,
      [tripId, legId]
    );
    await writeTexAuditEvent(client, actor, "tex.trip.leg_deleted", "tex_trip_leg", legId, {
      trip_id: tripId
    });
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

export async function createTexDriverAdvance(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexDriverAdvanceInput
): Promise<TexDriverAdvance> {
  assertTexPermission(actor, "tex.finance.review");
  const advance = sanitizeDriverAdvance(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexDriverAdvanceRow>(
      `
        insert into public.tex_driver_advances (
          tenant_id,
          employee_profile_id,
          amount,
          currency,
          base_amount,
          advance_date,
          month,
          year,
          notes,
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
          $9
        )
        returning
          id,
          employee_profile_id,
          amount::float as amount,
          currency,
          base_amount::float as base_amount,
          advance_date::text as advance_date,
          month,
          year,
          notes
      `,
      [
        advance.employeeProfileId,
        advance.amount,
        advance.currency,
        advance.baseAmount,
        advance.advanceDate,
        advance.month,
        advance.year,
        advance.notes,
        actor.userId
      ]
    );
    const row = requireSingleRow(result.rows, "driver advance");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.finance.driver_advance_created",
      "tex_driver_advance",
      row.id,
      {
        employee_profile_id: row.employee_profile_id
      }
    );

    return mapDriverAdvance(row);
  });
}

export async function deleteTexDriverAdvance(
  client: TenantQueryClient,
  actor: TexActorContext,
  advanceId: string
): Promise<void> {
  assertTexPermission(actor, "tex.finance.review");
  assertUuid(advanceId, "driver advance id");

  await withTenantContext(client, actor, async () => {
    const result = await client.query<{ id: string; employee_profile_id: string }>(
      `
        delete from public.tex_driver_advances
        where tenant_id = public.current_tenant_id()
          and id = $1
        returning id, employee_profile_id
      `,
      [advanceId]
    );
    const row = requireSingleRow(result.rows, "driver advance");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.finance.driver_advance_deleted",
      "tex_driver_advance",
      row.id,
      {
        employee_profile_id: row.employee_profile_id
      }
    );
  });
}

export async function listTexNotifications(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexNotification[]> {
  assertTexPermission(actor, "tex.expense.read");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexNotificationRow>(
      `
        select
          id,
          user_id,
          title,
          body,
          type,
          related_expense_id,
          related_trip_id,
          is_read,
          created_at::text as created_at
        from public.tex_notifications
        where tenant_id = public.current_tenant_id()
          and (user_id = $1 or ($2::boolean and user_id is null))
        order by created_at desc
        limit 100
      `,
      [actor.userId, canReadBroadcastTexNotifications(actor)]
    );

    return result.rows.map(mapNotification);
  });
}

export async function createTexNotification(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexNotificationInput
): Promise<TexNotification> {
  assertTexPermission(actor, "tex.expense.manage");
  const notification = sanitizeNotification(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexNotificationRow>(
      `
        insert into public.tex_notifications (
          tenant_id,
          user_id,
          title,
          body,
          type,
          related_expense_id,
          related_trip_id,
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
          $7
        )
        returning
          id,
          user_id,
          title,
          body,
          type,
          related_expense_id,
          related_trip_id,
          is_read,
          created_at::text as created_at
      `,
      [
        notification.userId,
        notification.title,
        notification.body,
        notification.type,
        notification.relatedExpenseId,
        notification.relatedTripId,
        actor.userId
      ]
    );
    const row = requireSingleRow(result.rows, "notification");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.notification.created",
      "tex_notification",
      row.id,
      {
        target_user_id: row.user_id ?? "broadcast"
      }
    );

    return mapNotification(row);
  });
}

export async function markTexNotificationRead(
  client: TenantQueryClient,
  actor: TexActorContext,
  notificationId: string
): Promise<TexNotification> {
  assertTexPermission(actor, "tex.expense.read");
  assertUuid(notificationId, "notification id");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexNotificationRow>(
      `
        update public.tex_notifications
           set is_read = true,
               updated_by = $1
         where tenant_id = public.current_tenant_id()
           and id = $2
           and (user_id = $1 or ($3::boolean and user_id is null))
        returning
          id,
          user_id,
          title,
          body,
          type,
          related_expense_id,
          related_trip_id,
          is_read,
          created_at::text as created_at
      `,
      [actor.userId, notificationId, canReadBroadcastTexNotifications(actor)]
    );
    const row = requireSingleRow(result.rows, "notification");

    await writeTexAuditEvent(client, actor, "tex.notification.read", "tex_notification", row.id, {
      target_user_id: row.user_id ?? "broadcast"
    });

    return mapNotification(row);
  });
}

export async function markAllTexNotificationsRead(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<{ updated: number }> {
  assertTexPermission(actor, "tex.expense.read");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<{ id: string }>(
      `
        update public.tex_notifications
           set is_read = true,
               updated_by = $1
         where tenant_id = public.current_tenant_id()
           and is_read = false
           and (user_id = $1 or ($2::boolean and user_id is null))
        returning id
      `,
      [actor.userId, canReadBroadcastTexNotifications(actor)]
    );

    await writeTexAuditEvent(
      client,
      actor,
      "tex.notification.read_all",
      "tex_notification",
      actor.userId,
      {
        updated: String(result.rows.length)
      }
    );

    return { updated: result.rows.length };
  });
}

export async function listTexSettingsWorkspace(
  client: TenantQueryClient,
  actor: TexActorContext,
  month = new Date().getUTCMonth() + 1,
  year = new Date().getUTCFullYear()
): Promise<TexSettingsWorkspace> {
  assertTexPermission(actor, "tex.expense.read");
  const normalizedMonth = sanitizeMonth(month);
  const normalizedYear = sanitizeYear(year);

  return withTenantContext(client, actor, async () => {
    const [categoriesResult, policiesResult, budgetsResult, departmentsResult] = await Promise.all([
      client.query<TexExpenseCategoryRow>(
        `
          select id, name, is_active, is_system, sort_order
          from public.tex_expense_categories
          where tenant_id = public.current_tenant_id()
          order by sort_order asc, name asc
        `
      ),
      client.query<TexSpendPolicyRow>(
        `
          select
            id,
            category,
            daily_limit::float as daily_limit,
            monthly_limit::float as monthly_limit,
            requires_notes_above::float as requires_notes_above,
            is_blocked
          from public.tex_spend_policies
          where tenant_id = public.current_tenant_id()
          order by category asc
        `
      ),
      client.query<TexBudgetRow>(
        `
          select
            b.id,
            b.department,
            b.month,
            b.year,
            b.budget_amount::float as budget_amount,
            coalesce(spent.spent_amount, 0)::float as spent_amount
          from public.tex_budgets b
          left join lateral (
            select coalesce(sum(coalesce(e.base_amount, e.amount)), 0) as spent_amount
            from public.tex_expenses e
            left join public.tex_employee_profiles ep
              on ep.tenant_id = e.tenant_id
             and ep.id = e.employee_profile_id
            where e.tenant_id = public.current_tenant_id()
              and e.status <> 'rejected'
              and extract(month from e.expense_date)::int = b.month
              and extract(year from e.expense_date)::int = b.year
              and coalesce(ep.department, '') = b.department
          ) spent on true
          where b.tenant_id = public.current_tenant_id()
            and b.month = $1
            and b.year = $2
          order by b.department asc
        `,
        [normalizedMonth, normalizedYear]
      ),
      client.query<{ department: string }>(
        `
          select distinct department
          from public.tex_employee_profiles
          where tenant_id = public.current_tenant_id()
            and department is not null
            and trim(department) <> ''
          order by department asc
        `
      )
    ]);

    return {
      categories: categoriesResult.rows.map(mapCategory),
      policies: mergePoliciesWithCategories(categoriesResult.rows, policiesResult.rows),
      budgets: budgetsResult.rows.map(mapBudget),
      departments: departmentsResult.rows.map((row) => row.department),
      month: normalizedMonth,
      year: normalizedYear
    };
  });
}

export async function createTexExpenseCategory(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexExpenseCategoryInput
): Promise<TexExpenseCategory> {
  assertTexPermission(actor, "tex.policy.manage");
  const category = sanitizeExpenseCategoryInput(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexExpenseCategoryRow>(
      `
        insert into public.tex_expense_categories (
          tenant_id,
          name,
          is_active,
          is_system,
          sort_order,
          created_by,
          updated_by
        )
        values (public.current_tenant_id(), $1, $2, false, $3, $4, $4)
        returning id, name, is_active, is_system, sort_order
      `,
      [category.name, category.isActive, category.sortOrder, actor.userId]
    );
    const row = requireSingleRow(result.rows, "expense category");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.category.created",
      "tex_expense_category",
      row.id,
      {
        name: row.name
      }
    );

    return mapCategory(row);
  });
}

export async function updateTexExpenseCategory(
  client: TenantQueryClient,
  actor: TexActorContext,
  categoryId: string,
  input: TexExpenseCategoryInput
): Promise<TexExpenseCategory> {
  assertTexPermission(actor, "tex.policy.manage");
  assertUuid(categoryId, "expense category id");
  const category = sanitizeExpenseCategoryInput(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexExpenseCategoryRow>(
      `
        update public.tex_expense_categories
           set name = $1,
               is_active = $2,
               sort_order = $3,
               updated_by = $4
         where tenant_id = public.current_tenant_id()
           and id = $5
        returning id, name, is_active, is_system, sort_order
      `,
      [category.name, category.isActive, category.sortOrder, actor.userId, categoryId]
    );
    const row = requireSingleRow(result.rows, "expense category");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.category.updated",
      "tex_expense_category",
      row.id,
      {
        name: row.name
      }
    );

    return mapCategory(row);
  });
}

export async function deleteTexExpenseCategory(
  client: TenantQueryClient,
  actor: TexActorContext,
  categoryId: string
): Promise<{ deleted: string }> {
  assertTexPermission(actor, "tex.policy.manage");
  assertUuid(categoryId, "expense category id");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<{ id: string; name: string }>(
      `
        delete from public.tex_expense_categories
        where tenant_id = public.current_tenant_id()
          and id = $1
          and is_system = false
        returning id, name
      `,
      [categoryId]
    );
    const row = requireSingleRow(result.rows, "expense category");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.category.deleted",
      "tex_expense_category",
      row.id,
      {
        name: row.name
      }
    );

    return { deleted: row.id };
  });
}

export async function upsertTexSpendPolicy(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexSpendPolicyInput
): Promise<TexSpendPolicy> {
  assertTexPermission(actor, "tex.policy.manage");
  const policy = sanitizeSpendPolicyInput(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexSpendPolicyRow>(
      `
        insert into public.tex_spend_policies (
          tenant_id,
          category,
          daily_limit,
          monthly_limit,
          requires_notes_above,
          is_blocked,
          created_by,
          updated_by
        )
        values (public.current_tenant_id(), $1, $2, $3, $4, $5, $6, $6)
        on conflict (tenant_id, category)
        do update set
          daily_limit = excluded.daily_limit,
          monthly_limit = excluded.monthly_limit,
          requires_notes_above = excluded.requires_notes_above,
          is_blocked = excluded.is_blocked,
          updated_by = excluded.updated_by,
          updated_at = now()
        returning
          id,
          category,
          daily_limit::float as daily_limit,
          monthly_limit::float as monthly_limit,
          requires_notes_above::float as requires_notes_above,
          is_blocked
      `,
      [
        policy.category,
        policy.dailyLimit,
        policy.monthlyLimit,
        policy.requiresNotesAbove,
        policy.isBlocked,
        actor.userId
      ]
    );
    const row = requireSingleRow(result.rows, "spend policy");

    await writeTexAuditEvent(client, actor, "tex.policy.updated", "tex_spend_policy", row.id, {
      category: row.category
    });

    return mapSpendPolicy(row);
  });
}

export async function upsertTexBudget(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexBudgetInput
): Promise<TexBudget> {
  assertTexPermission(actor, "tex.policy.manage");
  const budget = sanitizeBudgetInput(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexBudgetRow>(
      `
        insert into public.tex_budgets (
          tenant_id,
          department,
          month,
          year,
          budget_amount,
          created_by,
          updated_by
        )
        values (public.current_tenant_id(), $1, $2, $3, $4, $5, $5)
        on conflict (tenant_id, department, month, year)
        do update set
          budget_amount = excluded.budget_amount,
          updated_by = excluded.updated_by,
          updated_at = now()
        returning
          id,
          department,
          month,
          year,
          budget_amount::float as budget_amount,
          0::float as spent_amount
      `,
      [budget.department, budget.month, budget.year, budget.budgetAmount, actor.userId]
    );
    const row = requireSingleRow(result.rows, "budget");

    await writeTexAuditEvent(client, actor, "tex.budget.updated", "tex_budget", row.id, {
      department: row.department,
      month: String(row.month),
      year: String(row.year)
    });

    return mapBudget(row);
  });
}

export async function deleteTexBudget(
  client: TenantQueryClient,
  actor: TexActorContext,
  budgetId: string
): Promise<{ deleted: string }> {
  assertTexPermission(actor, "tex.policy.manage");
  assertUuid(budgetId, "budget id");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<{ id: string; department: string }>(
      `
        delete from public.tex_budgets
        where tenant_id = public.current_tenant_id()
          and id = $1
        returning id, department
      `,
      [budgetId]
    );
    const row = requireSingleRow(result.rows, "budget");

    await writeTexAuditEvent(client, actor, "tex.budget.deleted", "tex_budget", row.id, {
      department: row.department
    });

    return { deleted: row.id };
  });
}

export function setTexWhatsappNotificationDispatcherForTest(
  dispatcher: typeof dispatchWhatsAppNotification | null
) {
  texWhatsappNotificationDispatcher = dispatcher ?? dispatchWhatsAppNotification;
}

export async function uploadTexReceiptFile(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexReceiptUploadInput
): Promise<TexReceiptFileRecord> {
  assertTexPermission(actor, "tex.expense.submit");
  const receipt = sanitizeReceiptUpload(input);
  const fileId = randomUUID();
  const extension = extensionForContentType(receipt.contentType);
  const storagePath = `tenant/${actor.tenantId}/tex/receipts/${fileId}.${extension}`;

  await uploadReceiptObject(storagePath, receipt.contentType, receipt.buffer);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<{
      id: string;
      storage_path: string;
      filename: string;
      content_type: string;
      size_bytes: number;
    }>(
      `
        insert into public.files (
          id,
          tenant_id,
          storage_path,
          filename,
          content_type,
          size_bytes,
          uploaded_by,
          created_by,
          updated_by
        )
        values (
          $1,
          public.current_tenant_id(),
          $2,
          $3,
          $4,
          $5,
          $6,
          $6,
          $6
        )
        returning id, storage_path, filename, content_type, size_bytes::int as size_bytes
      `,
      [
        fileId,
        storagePath,
        receipt.fileName,
        receipt.contentType,
        receipt.buffer.length,
        actor.userId
      ]
    );
    const row = requireSingleRow(result.rows, "receipt file");

    await writeTexAuditEvent(client, actor, "tex.receipt.uploaded", "file", row.id, {
      filename: row.filename,
      content_type: row.content_type
    });

    return {
      id: row.id,
      storagePath: row.storage_path,
      filename: row.filename,
      contentType: row.content_type,
      sizeBytes: row.size_bytes,
      url: `/api/tex/receipts/${row.id}`
    };
  });
}

export async function parseTexReceiptUpload(
  input: Pick<TexReceiptUploadInput, "contentType" | "dataBase64">
): Promise<TexReceiptExtraction> {
  const contentType = cleanContentType(input.contentType);
  if (!contentType.startsWith("image/")) {
    throw new Error("OCR currently supports image receipts only.");
  }

  const buffer = receiptBufferFromBase64(input.dataBase64);
  return extractReceiptWithAI(`data:${contentType};base64,${buffer.toString("base64")}`);
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
          payment_method,
          tax_id_number,
          tax_amount,
          receipt_file_id,
          source,
          extraction_source,
          extraction_confidence,
          extraction_payload,
          duplicate_status,
          duplicate_of_expense_id,
          duplicate_reason,
          manager_review_required,
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
          $18::jsonb,
          'clear',
          null,
          null,
          false,
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
        expense.paymentMethod,
        expense.taxIdNumber,
        expense.taxAmount,
        expense.receiptFileId,
        expense.source,
        expense.extractionSource,
        expense.extractionConfidence,
        JSON.stringify(expense.extractionPayload ?? {})
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
          message_type,
          media_url,
          media_mime_type,
          ocr_status,
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
          $8,
          $9,
          $10,
          $11,
          $12::jsonb,
          $13,
          $13
        )
        on conflict (tenant_id, message_id)
        where message_id is not null
        do update set
          payload = excluded.payload,
          message_type = excluded.message_type,
          media_url = excluded.media_url,
          media_mime_type = excluded.media_mime_type,
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
        classifyWhatsappMessage(submission),
        submission.mediaUrl,
        submission.mediaMimeType,
        submission.mediaUrl ? "pending" : "manual_review",
        JSON.stringify(submission.payload),
        actor.userId
      ]
    );
    const row = requireSingleRow(result.rows, "webhook submission");
    await writeTexAuditEvent(
      client,
      actor,
      "tex.webhook.submission_recorded",
      "tex_unregistered_whatsapp_submission",
      row.id,
      {
        provider: "whatsapp",
        message_id: submission.messageId ?? ""
      }
    );

    return {
      id: row.id,
      status: row.status
    };
  });
}

export async function processTexWhatsappSubmission(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexWebhookSubmissionInput
): Promise<TexWhatsappReceiptResult> {
  assertTexPermission(actor, "tex.integration.manage");
  const submission = sanitizeWebhookSubmission(input);
  const messageType = classifyWhatsappMessage(submission);

  if (messageType === "status") {
    return withTenantContext(client, actor, async () => {
      const replyText = await buildWhatsappStatusReply(client, submission.senderPhone);
      const row = await insertWhatsappSubmission(client, actor, submission, {
        messageType,
        ocrStatus: "not_applicable",
        ocrResult: {},
        replyText
      });
      const delivery = await deliverTexWhatsappReply(client, actor, submission, replyText, row.id);

      return { submission: row, replyText, expense: null, ocrStatus: "not_applicable", delivery };
    });
  }

  let extraction: TexReceiptExtraction | null = submission.extractedReceipt;
  let extractionError: string | null = null;

  if (!extraction && submission.mediaUrl) {
    try {
      extraction = await extractReceiptWithAI(submission.mediaUrl);
    } catch (error) {
      extractionError = error instanceof Error ? error.message : "Receipt extraction failed.";
    }
  }

  return withTenantContext(client, actor, async () => {
    const settings = await getTexIntegrationSettingsForProcessing(client);
    const employee = await findEmployeeByPhone(client, submission.senderPhone);

    if (!employee) {
      const replyText =
        "Receipt received, but this WhatsApp number is not enrolled for TEX. Please ask your tenant admin to enroll your number.";
      const row = await insertWhatsappSubmission(client, actor, submission, {
        messageType,
        ocrStatus: "manual_review",
        ocrResult: extraction ?? {},
        ocrError: extractionError,
        replyText
      });
      const delivery = await deliverTexWhatsappReply(client, actor, submission, replyText, row.id);

      return { submission: row, replyText, expense: null, ocrStatus: "manual_review", delivery };
    }

    if (!settings.ai_receipt_extraction_enabled) {
      const replyText =
        "Receipt received. AI extraction is disabled for your company, so the finance team will review it manually.";
      const row = await insertWhatsappSubmission(client, actor, submission, {
        messageType,
        ocrStatus: "manual_review",
        ocrResult: extraction ?? {},
        ocrError: extractionError,
        replyText
      });
      const delivery = await deliverTexWhatsappReply(client, actor, submission, replyText, row.id);

      return { submission: row, replyText, expense: null, ocrStatus: "manual_review", delivery };
    }

    if (!extraction || !extraction.expenseDate || !extraction.amount || !extraction.currency) {
      const replyText =
        "Receipt received, but TEX could not read the key fields. It has been sent for manual review.";
      const row = await insertWhatsappSubmission(client, actor, submission, {
        messageType,
        ocrStatus: extractionError ? "failed" : "manual_review",
        ocrResult: extraction ?? {},
        ocrError: extractionError,
        replyText
      });
      const delivery = await deliverTexWhatsappReply(client, actor, submission, replyText, row.id);

      return {
        submission: row,
        replyText,
        expense: null,
        ocrStatus: extractionError ? "failed" : "manual_review",
        delivery
      };
    }

    const duplicate = settings.duplicate_detection_enabled
      ? await findDuplicateExpense(client, employee.id, extraction)
      : null;
    const shouldAutoReject = Boolean(duplicate && settings.duplicate_auto_reject_enabled);
    const expense = await createExpenseFromWhatsappReceipt(client, actor, {
      employee,
      extraction,
      submission,
      duplicate,
      shouldAutoReject
    });
    const replyText = shouldAutoReject
      ? `Receipt received but auto-rejected as a likely duplicate of ${duplicate?.vendor ?? "an existing expense"}.`
      : duplicate
        ? "Receipt received and flagged as a possible duplicate for manager review."
        : `Receipt received and submitted for ${formatMoney(extraction.amount, extraction.currency)}.`;
    const row = await insertWhatsappSubmission(client, actor, submission, {
      messageType,
      ocrStatus: "extracted",
      ocrResult: extraction,
      replyText,
      resolvedExpenseId: expense.id,
      resolvedEmployeeProfileId: employee.id
    });
    const delivery = await deliverTexWhatsappReply(client, actor, submission, replyText, row.id);

    await writeTexAuditEvent(
      client,
      actor,
      "tex.whatsapp.receipt_processed",
      "tex_expense",
      expense.id,
      {
        duplicate_status: duplicate ? (shouldAutoReject ? "duplicate" : "suspected") : "clear"
      }
    );

    return { submission: row, replyText, expense, ocrStatus: "extracted", delivery };
  });
}

export async function listTexUnregisteredWhatsappSubmissions(
  client: TenantQueryClient,
  actor: TexActorContext,
  status: "open" | "resolved" | "ignored" | "all" = "open"
): Promise<TexUnregisteredWhatsappSubmission[]> {
  assertTexPermission(actor, "tex.receipt.review");
  const normalizedStatus = sanitizeSubmissionStatusFilter(status);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexUnregisteredWhatsappSubmissionRow>(
      `
        select
          id,
          sender_raw,
          sender_phone,
          whatsapp_chat_jid,
          message_id,
          session_id,
          message_text,
          receipt_file_id,
          media_url,
          media_mime_type,
          message_type,
          ocr_status,
          ocr_result,
          ocr_error,
          whatsapp_reply_text,
          status,
          resolved_expense_id,
          resolved_employee_profile_id,
          resolved_at::text as resolved_at,
          created_at::text as created_at
        from public.tex_unregistered_whatsapp_submissions
        where tenant_id = public.current_tenant_id()
          and ($1::text is null or status = $1)
        order by created_at desc
        limit 100
      `,
      [normalizedStatus === "all" ? null : normalizedStatus]
    );

    return result.rows.map(mapUnregisteredWhatsappSubmission);
  });
}

export async function ignoreTexUnregisteredWhatsappSubmission(
  client: TenantQueryClient,
  actor: TexActorContext,
  submissionId: string,
  reason?: string | null
): Promise<TexWebhookSubmissionRecord> {
  assertTexPermission(actor, "tex.receipt.review");
  assertUuid(submissionId, "WhatsApp submission id");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexWebhookSubmissionRow>(
      `
        update public.tex_unregistered_whatsapp_submissions
           set status = 'ignored',
               resolved_by = $1,
               resolved_at = now(),
               updated_by = $1
         where tenant_id = public.current_tenant_id()
           and id = $2
           and status = 'open'
        returning id, status
      `,
      [actor.userId, submissionId]
    );
    const row = requireSingleRow(result.rows, "WhatsApp submission");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.whatsapp_submission.ignored",
      "tex_unregistered_whatsapp_submission",
      row.id,
      {
        reason: cleanOptional(reason) ?? ""
      }
    );

    return {
      id: row.id,
      status: row.status
    };
  });
}

export async function resolveTexUnregisteredWhatsappSubmission(
  client: TenantQueryClient,
  actor: TexActorContext,
  submissionId: string,
  input: TexUnregisteredWhatsappResolveInput
): Promise<TexUnregisteredWhatsappResolveResult> {
  assertTexPermission(actor, "tex.receipt.review");
  assertUuid(submissionId, "WhatsApp submission id");

  return withTenantContext(client, actor, async () => {
    const submission = requireSingleRow(
      (
        await client.query<TexUnregisteredWhatsappSubmissionRow>(
          `
            select
              id,
              sender_raw,
              sender_phone,
              whatsapp_chat_jid,
              message_id,
              session_id,
              message_text,
              receipt_file_id,
              media_url,
              media_mime_type,
              message_type,
              ocr_status,
              ocr_result,
              ocr_error,
              whatsapp_reply_text,
              status,
              resolved_expense_id,
              resolved_employee_profile_id,
              resolved_at::text as resolved_at,
              created_at::text as created_at
            from public.tex_unregistered_whatsapp_submissions
            where tenant_id = public.current_tenant_id()
              and id = $1
            limit 1
          `,
          [submissionId]
        )
      ).rows,
      "WhatsApp submission"
    );

    if (submission.status !== "open") {
      throw new Error("This WhatsApp submission has already been resolved.");
    }

    const employee =
      input.mode === "existing_employee"
        ? await getTexEmployeeProfile(
            client,
            cleanRequired(input.employeeProfileId, "Employee profile")
          )
        : await createTexEmployeeProfileFromWhatsapp(client, actor, {
            name: cleanRequired(input.employeeName, "Employee name"),
            phoneNumber:
              input.phoneNumber ?? submission.sender_phone ?? submission.sender_raw ?? "",
            department: input.department
          });
    const extraction = parseSubmissionExtraction(submission.ocr_result);
    const resolved = resolveWhatsappExpenseFields(submission, extraction);
    const expense = await insertResolvedWhatsappExpense(client, actor, {
      submission,
      employee,
      extraction,
      ...resolved
    });
    const updated = requireSingleRow(
      (
        await client.query<TexWebhookSubmissionRow>(
          `
            update public.tex_unregistered_whatsapp_submissions
               set status = 'resolved',
                   resolved_expense_id = $1,
                   resolved_employee_profile_id = $2,
                   resolved_by = $3,
                   resolved_at = now(),
                   updated_by = $3
             where tenant_id = public.current_tenant_id()
               and id = $4
            returning id, status
          `,
          [expense.id, employee.id, actor.userId, submission.id]
        )
      ).rows,
      "WhatsApp submission"
    );

    await writeTexAuditEvent(
      client,
      actor,
      "tex.whatsapp_submission.resolved",
      "tex_unregistered_whatsapp_submission",
      submission.id,
      {
        expense_id: expense.id,
        employee_profile_id: employee.id
      }
    );
    const replyText = `Receipt reviewed and linked to ${employee.name}. It is now pending finance review.`;
    const delivery = await deliverTexWhatsappReply(
      client,
      actor,
      {
        senderRaw: submission.sender_raw,
        senderPhone: submission.sender_phone,
        whatsappChatJid: submission.whatsapp_chat_jid
      },
      replyText,
      submission.id
    );

    return {
      submission: updated,
      employee,
      expense,
      delivery
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

async function insertWhatsappSubmission(
  client: TenantQueryClient,
  actor: TexActorContext,
  submission: Required<TexWebhookSubmissionInput>,
  options: {
    messageType: "receipt" | "status" | "text";
    ocrStatus: TexWhatsappReceiptResult["ocrStatus"];
    ocrResult: Record<string, unknown>;
    ocrError?: string | null;
    replyText: string;
    resolvedExpenseId?: string | null;
    resolvedEmployeeProfileId?: string | null;
  }
): Promise<TexWebhookSubmissionRecord> {
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
        message_type,
        media_url,
        media_mime_type,
        ocr_status,
        ocr_result,
        ocr_error,
        whatsapp_reply_text,
        payload,
        status,
        resolved_expense_id,
        resolved_employee_profile_id,
        resolved_by,
        resolved_at,
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
        $12::jsonb,
        $13,
        $14,
        $15::jsonb,
        $16,
        $17,
        $18,
        $19,
        case when $16 = 'resolved' then now() else null end,
        $19,
        $19
      )
      on conflict (tenant_id, message_id)
      where message_id is not null
      do update set
        payload = excluded.payload,
        message_type = excluded.message_type,
        media_url = excluded.media_url,
        media_mime_type = excluded.media_mime_type,
        ocr_status = excluded.ocr_status,
        ocr_result = excluded.ocr_result,
        ocr_error = excluded.ocr_error,
        whatsapp_reply_text = excluded.whatsapp_reply_text,
        status = excluded.status,
        resolved_expense_id = excluded.resolved_expense_id,
        resolved_employee_profile_id = excluded.resolved_employee_profile_id,
        resolved_by = excluded.resolved_by,
        resolved_at = excluded.resolved_at,
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
      options.messageType,
      submission.mediaUrl,
      submission.mediaMimeType,
      options.ocrStatus,
      JSON.stringify(options.ocrResult),
      cleanOptional(options.ocrError),
      options.replyText,
      JSON.stringify(submission.payload),
      options.resolvedExpenseId ? "resolved" : "open",
      options.resolvedExpenseId ?? null,
      options.resolvedEmployeeProfileId ?? null,
      actor.userId
    ]
  );
  const row = requireSingleRow(result.rows, "webhook submission");

  await writeTexAuditEvent(
    client,
    actor,
    "tex.webhook.submission_recorded",
    "tex_unregistered_whatsapp_submission",
    row.id,
    {
      provider: "whatsapp",
      message_id: submission.messageId ?? ""
    }
  );

  return {
    id: row.id,
    status: row.status
  };
}

async function deliverTexWhatsappReply(
  client: TenantQueryClient,
  actor: TexActorContext,
  submission: Pick<TexWebhookSubmissionInput, "senderPhone" | "senderRaw" | "whatsappChatJid">,
  replyText: string,
  submissionId: string
): Promise<WhatsAppDispatchResult | null> {
  const to = submission.senderPhone ?? submission.senderRaw ?? submission.whatsappChatJid ?? null;

  if (!to || !replyText.trim()) {
    return null;
  }

  const settings = await getTexWhatsappNotificationSettings(client);
  const result = settings
    ? await texWhatsappNotificationDispatcher({
        provider: settings.whatsapp_provider,
        to,
        message: replyText,
        apiKey: settings.api_key,
        instanceId: settings.whatsapp_instance_id,
        wappflySessionId: settings.wappfly_session_id,
        metaPhoneNumberId: settings.meta_phone_number_id
      })
    : {
        ok: false,
        provider: "ultramsg" as const,
        status: "skipped" as const,
        messageId: null,
        error: "TEX WhatsApp integration is not configured.",
        httpStatus: null
      };

  await writeTexAuditEvent(
    client,
    actor,
    `tex.notification.whatsapp_reply_${result.status}`,
    "tex_unregistered_whatsapp_submission",
    submissionId,
    {
      provider: result.provider,
      message_id: result.messageId ?? "",
      error: result.error ?? "",
      http_status: result.httpStatus === null ? "" : String(result.httpStatus)
    }
  );

  return result;
}

async function getTexWhatsappNotificationSettings(
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

async function getTexIntegrationSettingsForProcessing(
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

async function findEmployeeByPhone(client: TenantQueryClient, phone: string | null) {
  const digits = normalizePhoneDigits(phone);

  if (!digits) {
    return null;
  }

  const result = await client.query<TexEmployeeProfileRow>(
    `
      select id, user_id, name, phone_number, department, is_active
      from public.tex_employee_profiles
      where tenant_id = public.current_tenant_id()
        and is_active = true
        and regexp_replace(phone_number, '[^0-9]', '', 'g') = $1
      limit 1
    `,
    [digits]
  );

  return result.rows[0] ?? null;
}

async function buildWhatsappStatusReply(client: TenantQueryClient, phone: string | null) {
  const employee = await findEmployeeByPhone(client, phone);

  if (!employee) {
    return "No TEX employee profile is enrolled for this WhatsApp number.";
  }

  const result = await client.query<{ status: TexExpenseStatus; count: number; total: number }>(
    `
      select status, count(*)::int as count, coalesce(sum(amount), 0)::float as total
      from public.tex_expenses
      where tenant_id = public.current_tenant_id()
        and employee_profile_id = $1
      group by status
    `,
    [employee.id]
  );
  const totals = new Map(result.rows.map((row) => [row.status, row]));
  const pending = totals.get("pending");
  const approved = totals.get("approved");
  const rejected = totals.get("rejected");
  const paid = totals.get("paid");

  return [
    `TEX status for ${employee.name}:`,
    `Pending: ${pending?.count ?? 0} (${formatMoney(pending?.total ?? 0, "AED")})`,
    `Approved: ${approved?.count ?? 0} (${formatMoney(approved?.total ?? 0, "AED")})`,
    `Rejected: ${rejected?.count ?? 0} (${formatMoney(rejected?.total ?? 0, "AED")})`,
    `Paid: ${paid?.count ?? 0} (${formatMoney(paid?.total ?? 0, "AED")})`
  ].join("\n");
}

async function findDuplicateExpense(
  client: TenantQueryClient,
  employeeProfileId: string,
  extraction: TexReceiptExtraction
): Promise<TexDuplicateCandidateRow | null> {
  if (!extraction.expenseDate || !extraction.amount || !extraction.currency) {
    return null;
  }

  const result = await client.query<TexDuplicateCandidateRow>(
    `
      select id, vendor, amount::float as amount, currency, expense_date::text as expense_date
      from public.tex_expenses
      where tenant_id = public.current_tenant_id()
        and employee_profile_id = $1
        and expense_date = $2::date
        and amount = $3
        and currency = $4
        and status <> 'rejected'
      order by created_at desc
      limit 1
    `,
    [employeeProfileId, extraction.expenseDate, extraction.amount, extraction.currency]
  );

  return result.rows[0] ?? null;
}

async function createExpenseFromWhatsappReceipt(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: {
    employee: TexEmployeeProfileRow;
    extraction: TexReceiptExtraction;
    submission: Required<TexWebhookSubmissionInput>;
    duplicate: TexDuplicateCandidateRow | null;
    shouldAutoReject: boolean;
  }
): Promise<TexExpenseRecord> {
  const duplicateStatus = input.duplicate
    ? input.shouldAutoReject
      ? "duplicate"
      : "suspected"
    : "clear";
  const duplicateReason = input.duplicate
    ? `Matched ${input.duplicate.vendor ?? "existing receipt"} on employee, date, amount, and currency.`
    : null;
  const result = await client.query<TexExpenseRow>(
    `
      insert into public.tex_expenses (
        tenant_id,
        submitter_user_id,
        employee_profile_id,
        employee_name,
        employee_phone,
        whatsapp_chat_jid,
        vendor,
        expense_date,
        amount,
        currency,
        category,
        notes,
        tax_id_number,
        tax_amount,
        receipt_file_id,
        source,
        extraction_source,
        extraction_confidence,
        extraction_payload,
        duplicate_status,
        duplicate_of_expense_id,
        duplicate_reason,
        manager_review_required,
        status,
        rejected_by,
        rejected_at,
        rejected_reason,
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
        'whatsapp',
        'whatsapp_ai',
        $15,
        $16::jsonb,
        $17,
        $18,
        $19,
        $20,
        $21,
        case when $21 = 'rejected' then $1 else null end,
        case when $21 = 'rejected' then now() else null end,
        case when $21 = 'rejected' then $19 else null end,
        $1,
        $1
      )
      returning id, status, amount::float as amount, currency
    `,
    [
      actor.userId,
      input.employee.id,
      input.employee.name,
      input.employee.phone_number,
      input.submission.whatsappChatJid,
      input.extraction.vendor,
      input.extraction.expenseDate,
      input.extraction.amount,
      input.extraction.currency,
      input.extraction.category,
      input.extraction.notes,
      input.extraction.taxIdNumber,
      input.extraction.taxAmount,
      input.submission.receiptFileId,
      input.extraction.confidence,
      JSON.stringify(input.extraction),
      duplicateStatus,
      input.duplicate?.id ?? null,
      duplicateReason,
      Boolean(input.duplicate && !input.shouldAutoReject),
      input.shouldAutoReject ? "rejected" : "pending"
    ]
  );
  const row = requireSingleRow(result.rows, "expense");

  return mapExpense(row);
}

async function assertTripExists(client: TenantQueryClient, tripId: string) {
  const result = await client.query<{ id: string }>(
    `
      select id
      from public.tex_trips
      where tenant_id = public.current_tenant_id()
        and id = $1
      limit 1
    `,
    [tripId]
  );

  if (result.rows.length !== 1) {
    throw new Error("Unable to find trip.");
  }
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
    paymentMethod: cleanOptional(input.paymentMethod),
    taxIdNumber: cleanOptional(input.taxIdNumber),
    taxAmount: optionalNonNegative(input.taxAmount, "tax amount"),
    receiptFileId: cleanOptional(input.receiptFileId),
    extractionSource: sanitizeExtractionSource(input.extractionSource),
    extractionConfidence: sanitizeExtractionConfidence(input.extractionConfidence),
    extractionPayload:
      input.extractionPayload &&
      typeof input.extractionPayload === "object" &&
      !Array.isArray(input.extractionPayload)
        ? input.extractionPayload
        : {},
    source: cleanOptional(input.source) ?? "web"
  };
}

function sanitizeReceiptUpload(input: TexReceiptUploadInput) {
  const contentType = cleanContentType(input.contentType);
  if (!isAllowedReceiptType(contentType)) {
    throw new Error("Unsupported receipt file type.");
  }

  const buffer = receiptBufferFromBase64(input.dataBase64);
  return {
    fileName: sanitizeFileName(input.fileName),
    contentType,
    buffer
  };
}

function cleanContentType(value: string) {
  return value.trim().toLowerCase().split(";")[0]?.trim() ?? "";
}

function sanitizeFileName(value: string) {
  const name = value
    .trim()
    .replace(/[^\w.\- ()]/g, "_")
    .slice(0, 160);
  return name || "receipt";
}

function isAllowedReceiptType(contentType: string) {
  return [
    "image/jpeg",
    "image/jpg",
    "image/png",
    "image/webp",
    "image/heic",
    "image/heif",
    "application/pdf"
  ].includes(contentType);
}

function receiptBufferFromBase64(value: string) {
  const base64 = stripDataUrl(value);
  if (!base64) {
    throw new Error("Receipt data is required.");
  }

  const buffer = Buffer.from(base64, "base64");
  if (buffer.length <= 0) {
    throw new Error("Receipt file is empty.");
  }

  if (buffer.length > 20 * 1024 * 1024) {
    throw new Error("Receipt file exceeds 20MB.");
  }

  return buffer;
}

function stripDataUrl(value: string) {
  const trimmed = value.trim();
  return trimmed.includes(",") ? (trimmed.split(",").pop()?.trim() ?? "") : trimmed;
}

function extensionForContentType(contentType: string) {
  if (contentType === "image/png") return "png";
  if (contentType === "image/webp") return "webp";
  if (contentType === "image/heic") return "heic";
  if (contentType === "image/heif") return "heif";
  if (contentType === "application/pdf") return "pdf";
  return "jpg";
}

function receiptBucketName() {
  return process.env.SUPABASE_RECEIPTS_BUCKET?.trim() || "receipts";
}

function supabaseProjectUrl() {
  const url = process.env.SUPABASE_URL?.trim() || process.env.NEXT_PUBLIC_SUPABASE_URL?.trim();
  if (!url) {
    throw new Error("SUPABASE_URL or NEXT_PUBLIC_SUPABASE_URL is not configured.");
  }

  return url.replace(/\/+$/, "");
}

function supabaseServiceRoleKey() {
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY?.trim();
  if (!key) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured on the customer portal Vercel project."
    );
  }

  return key;
}

async function uploadReceiptObject(storagePath: string, contentType: string, buffer: Buffer) {
  const bucket = receiptBucketName();
  const encodedPath = storagePath.split("/").map(encodeURIComponent).join("/");
  const serviceKey = supabaseServiceRoleKey();
  const response = await fetch(
    `${supabaseProjectUrl()}/storage/v1/object/${encodeURIComponent(bucket)}/${encodedPath}`,
    {
      method: "POST",
      headers: {
        ...supabaseServiceHeaders(serviceKey),
        "Content-Type": contentType,
        "x-upsert": "false"
      },
      body: buffer
    }
  );

  if (!response.ok) {
    const text = await response.text();
    throw new Error(`Receipt storage upload failed: ${response.status} ${text.slice(0, 240)}`);
  }
}

function supabaseServiceHeaders(key: string) {
  const headers: Record<string, string> = {
    apikey: key
  };

  if (key.startsWith("eyJ")) {
    headers.Authorization = `Bearer ${key}`;
  }

  return headers;
}

function sanitizeExtractionSource(
  value: TexExpenseInput["extractionSource"]
): "manual" | "web_ai" | "whatsapp_ai" {
  if (value === "web_ai" || value === "whatsapp_ai") {
    return value;
  }

  return "manual";
}

function sanitizeExtractionConfidence(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Extraction confidence must be numeric.");
  }

  return Math.min(Math.max(parsed, 0), 1);
}

function sanitizeWebhookSubmission(
  input: TexWebhookSubmissionInput
): Required<TexWebhookSubmissionInput> {
  return {
    senderRaw: cleanOptional(input.senderRaw),
    senderPhone: cleanOptional(input.senderPhone),
    whatsappChatJid: cleanOptional(input.whatsappChatJid),
    messageId: cleanOptional(input.messageId),
    sessionId: cleanOptional(input.sessionId),
    messageText: cleanOptional(input.messageText),
    receiptFileId: cleanOptional(input.receiptFileId),
    mediaUrl: cleanOptional(input.mediaUrl),
    mediaMimeType: cleanOptional(input.mediaMimeType),
    extractedReceipt: input.extractedReceipt ?? null,
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
  const subcontractorAmount =
    optionalNonNegative(input.subcontractorAmount, "subcontractor amount") ?? 0;
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

function sanitizeTripLegs(input: TexTripLegInput[]): Required<TexTripLegInput>[] {
  return input.map((leg, index) => sanitizeTripLeg(leg, index + 1));
}

function sanitizeTripLeg(
  input: TexTripLegInput,
  fallbackSequence: number
): Required<TexTripLegInput> {
  const origin = input.origin.trim();
  const destination = input.destination.trim();

  if (!origin || !destination) {
    throw new Error("Every trip leg needs an origin and destination.");
  }

  const sequence = Number(input.sequence ?? fallbackSequence);

  if (!Number.isInteger(sequence) || sequence < 1) {
    throw new Error("Trip leg sequence must be a positive integer.");
  }

  const mode = sanitizeTripLegMode(input.mode);
  const status = sanitizeTripLegStatus(input.status);
  const distanceKm = optionalNonNegative(input.distanceKm, "leg distance");
  const returnDistanceKm = optionalNonNegative(input.returnDistanceKm, "leg return distance");
  const totalDistanceKm =
    optionalNonNegative(input.totalDistanceKm, "leg total distance") ??
    (distanceKm === null
      ? null
      : input.isReturnTrip
        ? distanceKm + (returnDistanceKm ?? distanceKm)
        : distanceKm);

  return {
    id: cleanOptional(input.id),
    sequence,
    origin,
    originPlaceId: cleanOptional(input.originPlaceId),
    originLat: optionalNumber(input.originLat, "origin latitude"),
    originLng: optionalNumber(input.originLng, "origin longitude"),
    originCountry: cleanOptional(input.originCountry),
    destination,
    destinationPlaceId: cleanOptional(input.destinationPlaceId),
    destinationLat: optionalNumber(input.destinationLat, "destination latitude"),
    destinationLng: optionalNumber(input.destinationLng, "destination longitude"),
    destinationCountry: cleanOptional(input.destinationCountry),
    mode,
    status,
    plannedStart: input.plannedStart
      ? parseIsoDate(input.plannedStart.slice(0, 10), "planned start")
      : null,
    plannedEnd: input.plannedEnd
      ? parseIsoDate(input.plannedEnd.slice(0, 10), "planned end")
      : null,
    actualStart: input.actualStart
      ? parseIsoDate(input.actualStart.slice(0, 10), "actual start")
      : null,
    actualEnd: input.actualEnd ? parseIsoDate(input.actualEnd.slice(0, 10), "actual end") : null,
    distanceKm,
    isReturnTrip: Boolean(input.isReturnTrip),
    returnDistanceKm: input.isReturnTrip ? returnDistanceKm : null,
    returnDurationSeconds: input.isReturnTrip
      ? optionalInteger(input.returnDurationSeconds, "return duration")
      : null,
    totalDistanceKm,
    durationSeconds: optionalInteger(input.durationSeconds, "duration"),
    distanceSource: cleanOptional(input.distanceSource),
    routePolyline: cleanOptional(input.routePolyline),
    budgetAmount: optionalNonNegative(input.budgetAmount, "leg budget"),
    containerRef: cleanOptional(input.containerRef),
    notes: cleanOptional(input.notes)
  };
}

function tripLegValues(leg: Required<TexTripLegInput>) {
  return [
    leg.sequence,
    leg.origin,
    leg.originPlaceId,
    leg.originLat,
    leg.originLng,
    leg.originCountry,
    leg.destination,
    leg.destinationPlaceId,
    leg.destinationLat,
    leg.destinationLng,
    leg.destinationCountry,
    leg.mode,
    leg.status,
    leg.plannedStart,
    leg.plannedEnd,
    leg.actualStart,
    leg.actualEnd,
    leg.distanceKm,
    leg.isReturnTrip,
    leg.returnDistanceKm,
    leg.returnDurationSeconds,
    leg.totalDistanceKm,
    leg.durationSeconds,
    leg.distanceSource,
    leg.routePolyline,
    leg.budgetAmount,
    leg.containerRef,
    leg.notes
  ];
}

function sanitizeTripLegMode(value: string | null | undefined): TexTripLegMode | null {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  if (value === "road" || value === "sea" || value === "air" || value === "rail") {
    return value;
  }

  throw new Error(`Unsupported trip leg mode: ${value}`);
}

function sanitizeTripLegStatus(value: string | null | undefined): TexTripLegStatus {
  if (!value) {
    return "planned";
  }

  if (
    value === "planned" ||
    value === "in_transit" ||
    value === "completed" ||
    value === "cancelled"
  ) {
    return value;
  }

  throw new Error(`Unsupported trip leg status: ${value}`);
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

function optionalNumber(value: number | null | undefined, label: string) {
  if (value === null || value === undefined || value === 0) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Trip ${label} must be numeric.`);
  }

  return parsed;
}

function optionalInteger(value: number | null | undefined, label: string) {
  if (value === null || value === undefined || value === 0) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Trip ${label} must be a non-negative integer.`);
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

function sanitizeDriverAdvance(input: TexDriverAdvanceInput): Required<TexDriverAdvanceInput> {
  const employeeProfileId = cleanRequired(input.employeeProfileId, "Driver employee profile");
  assertUuid(employeeProfileId, "driver employee profile id");

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Driver advance amount must be greater than zero.");
  }

  const currency = cleanOptional(input.currency)?.toUpperCase() ?? "AED";
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Driver advance currency must be a three-letter ISO code.");
  }

  const now = new Date();
  const advanceDate = input.advanceDate
    ? parseIsoDate(input.advanceDate, "driver advance date")
    : now.toISOString().slice(0, 10);
  const month = input.month ?? Number(advanceDate.slice(5, 7));
  const year = input.year ?? Number(advanceDate.slice(0, 4));
  const period = sanitizeFinancePeriod(month, year);

  return {
    employeeProfileId,
    amount,
    currency,
    baseAmount: optionalNonNegative(input.baseAmount, "driver advance base amount") ?? amount,
    advanceDate,
    month: period.month,
    year: period.year,
    notes: cleanOptional(input.notes)
  };
}

function sanitizeNotification(input: TexNotificationInput): Required<TexNotificationInput> {
  const userId = cleanOptional(input.userId);
  const relatedExpenseId = cleanOptional(input.relatedExpenseId);
  const relatedTripId = cleanOptional(input.relatedTripId);

  if (userId) {
    assertUuid(userId, "notification user id");
  }

  if (relatedExpenseId) {
    assertUuid(relatedExpenseId, "related expense id");
  }

  if (relatedTripId) {
    assertUuid(relatedTripId, "related trip id");
  }

  return {
    userId,
    title: cleanRequired(input.title, "Notification title"),
    body: cleanOptional(input.body),
    type: cleanOptional(input.type),
    relatedExpenseId,
    relatedTripId
  };
}

function canReadBroadcastTexNotifications(actor: TexActorContext) {
  return actor.roles.some((role) =>
    [
      "customer_admin",
      "customer_module_admin",
      "customer_manager",
      "torrevie_platform_admin"
    ].includes(role)
  );
}

function sanitizeSubmissionStatusFilter(value: "open" | "resolved" | "ignored" | "all") {
  if (value === "open" || value === "resolved" || value === "ignored" || value === "all") {
    return value;
  }

  throw new Error(`Unsupported WhatsApp submission status: ${String(value)}`);
}

async function getTexEmployeeProfile(
  client: TenantQueryClient,
  employeeProfileId: string
): Promise<TexEmployeeProfile> {
  assertUuid(employeeProfileId, "employee profile id");
  const result = await client.query<TexEmployeeProfileRow>(
    `
      select id, user_id, name, phone_number, department, is_active
      from public.tex_employee_profiles
      where tenant_id = public.current_tenant_id()
        and id = $1
        and is_active = true
      limit 1
    `,
    [employeeProfileId]
  );

  return mapEmployeeProfile(requireSingleRow(result.rows, "employee profile"));
}

async function createTexEmployeeProfileFromWhatsapp(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: Pick<TexEmployeeProfileInput, "name" | "phoneNumber" | "department">
): Promise<TexEmployeeProfile> {
  const name = cleanRequired(input.name, "Employee name");
  const phoneNumber = normalizePhoneDigits(input.phoneNumber);
  const department = cleanOptional(input.department);

  if (!phoneNumber) {
    throw new Error("Employee WhatsApp phone is required.");
  }

  const result = await client.query<TexEmployeeProfileRow>(
    `
      insert into public.tex_employee_profiles (
        tenant_id,
        name,
        phone_number,
        department,
        is_active,
        created_by,
        updated_by
      )
      values (
        public.current_tenant_id(),
        $1,
        $2,
        $3,
        true,
        $4,
        $4
      )
      on conflict (tenant_id, phone_number)
      do update set
        name = excluded.name,
        department = coalesce(excluded.department, public.tex_employee_profiles.department),
        is_active = true,
        updated_by = excluded.updated_by,
        updated_at = now()
      returning id, user_id, name, phone_number, department, is_active
    `,
    [name, phoneNumber, department, actor.userId]
  );
  const employee = mapEmployeeProfile(requireSingleRow(result.rows, "employee profile"));

  await writeTexAuditEvent(
    client,
    actor,
    "tex.people.employee_created_from_whatsapp",
    "tex_employee_profile",
    employee.id,
    {
      phone_number: employee.phoneNumber
    }
  );

  return employee;
}

function parseSubmissionExtraction(value: unknown): TexReceiptExtraction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Partial<TexReceiptExtraction>;
  if (!record.expenseDate && !record.amount && !record.vendor) {
    return null;
  }

  return {
    vendor: typeof record.vendor === "string" ? record.vendor : null,
    expenseDate: typeof record.expenseDate === "string" ? record.expenseDate : null,
    amount: typeof record.amount === "number" ? record.amount : null,
    currency: typeof record.currency === "string" ? record.currency : null,
    category: typeof record.category === "string" ? record.category : null,
    taxAmount: typeof record.taxAmount === "number" ? record.taxAmount : null,
    taxIdNumber: typeof record.taxIdNumber === "string" ? record.taxIdNumber : null,
    confidence: typeof record.confidence === "number" ? record.confidence : 0,
    notes: typeof record.notes === "string" ? record.notes : null
  };
}

function resolveWhatsappExpenseFields(
  submission: TexUnregisteredWhatsappSubmissionRow,
  extraction: TexReceiptExtraction | null
) {
  const amount = extraction?.amount && extraction.amount > 0 ? extraction.amount : 0.01;
  const currency = extraction?.currency?.trim().toUpperCase() || "AED";
  const expenseDate = extraction?.expenseDate ?? new Date().toISOString().slice(0, 10);
  const notes = [
    extraction?.notes,
    submission.message_text,
    `Originally received from unregistered WhatsApp sender ${submission.sender_phone ?? submission.sender_raw ?? "unknown"}.`,
    amount === 0.01 ? "Receipt requires manual amount review." : null
  ]
    .filter(Boolean)
    .join(" ");

  return {
    vendor: extraction?.vendor ?? null,
    expenseDate,
    amount,
    currency,
    notes
  };
}

async function insertResolvedWhatsappExpense(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: {
    submission: TexUnregisteredWhatsappSubmissionRow;
    employee: TexEmployeeProfile;
    extraction: TexReceiptExtraction | null;
    vendor: string | null;
    expenseDate: string;
    amount: number;
    currency: string;
    notes: string;
  }
): Promise<TexExpenseRecord> {
  const result = await client.query<TexExpenseRow>(
    `
      insert into public.tex_expenses (
        tenant_id,
        submitter_user_id,
        employee_profile_id,
        employee_name,
        employee_phone,
        whatsapp_chat_jid,
        vendor,
        expense_date,
        amount,
        currency,
        base_amount,
        category,
        payment_method,
        notes,
        tax_id_number,
        tax_amount,
        receipt_file_id,
        status,
        source,
        extraction_source,
        extraction_confidence,
        extraction_payload,
        policy_flag,
        policy_flag_reason,
        manager_review_required,
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
        $8,
        $10,
        $11,
        $12,
        $13,
        $14,
        $15,
        'pending',
        'whatsapp',
        'whatsapp_ai',
        $16,
        $17::jsonb,
        true,
        $18,
        true,
        $1,
        $1
      )
      returning id, status, amount::float as amount, currency
    `,
    [
      actor.userId,
      input.employee.id,
      input.employee.name,
      input.employee.phoneNumber,
      input.submission.whatsapp_chat_jid,
      input.vendor,
      parseIsoDate(input.expenseDate, "expense date"),
      input.amount,
      input.currency,
      input.extraction?.category ?? "Receipt",
      null,
      input.notes,
      input.extraction?.taxIdNumber ?? null,
      input.extraction?.taxAmount ?? null,
      input.submission.receipt_file_id,
      input.extraction?.confidence ?? null,
      JSON.stringify(input.extraction ?? {}),
      "Receipt came from an unregistered WhatsApp number and was assigned by a reviewer."
    ]
  );

  return mapExpense(requireSingleRow(result.rows, "expense"));
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

function assertExpenseStatus(
  status: string
): asserts status is Exclude<TexExpenseStatus, "pending"> {
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

function cleanRequired(value: string | null | undefined, label: string) {
  const clean = cleanOptional(value);

  if (!clean) {
    throw new Error(`${label} is required.`);
  }

  return clean;
}

function sanitizeExpenseCategoryInput(input: TexExpenseCategoryInput) {
  return {
    name: cleanRequired(input.name, "Category name"),
    isActive: input.isActive ?? true,
    sortOrder: sanitizeInteger(input.sortOrder, "Sort order", 0)
  };
}

function sanitizeSpendPolicyInput(input: TexSpendPolicyInput): Required<TexSpendPolicyInput> {
  return {
    category: cleanRequired(input.category, "Policy category"),
    dailyLimit: sanitizeOptionalAmount(input.dailyLimit, "Daily limit"),
    monthlyLimit: sanitizeOptionalAmount(input.monthlyLimit, "Monthly limit"),
    requiresNotesAbove: sanitizeOptionalAmount(input.requiresNotesAbove, "Notes threshold"),
    isBlocked: input.isBlocked ?? false
  };
}

function sanitizeBudgetInput(input: TexBudgetInput) {
  return {
    department: cleanRequired(input.department, "Department"),
    month: sanitizeMonth(input.month),
    year: sanitizeYear(input.year),
    budgetAmount: sanitizeRequiredAmount(input.budgetAmount, "Budget amount")
  };
}

function sanitizeMonth(value: number) {
  const month = sanitizeInteger(value, "Month", 1);

  if (month < 1 || month > 12) {
    throw new Error("Month must be between 1 and 12.");
  }

  return month;
}

function sanitizeYear(value: number) {
  const year = sanitizeInteger(value, "Year", new Date().getUTCFullYear());

  if (year < 2000 || year > 2200) {
    throw new Error("Year must be between 2000 and 2200.");
  }

  return year;
}

function sanitizeInteger(value: number | null | undefined, label: string, fallback: number) {
  const numberValue = value === null || value === undefined ? fallback : Number(value);

  if (!Number.isInteger(numberValue)) {
    throw new Error(`${label} must be a whole number.`);
  }

  return numberValue;
}

function sanitizeOptionalAmount(value: number | null | undefined, label: string) {
  if (value === null || value === undefined || value === 0) {
    return null;
  }

  return sanitizeRequiredAmount(value, label);
}

function sanitizeRequiredAmount(value: number, label: string) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} must be a positive amount.`);
  }

  return Math.round(amount * 100) / 100;
}

function classifyWhatsappMessage(
  submission: Required<TexWebhookSubmissionInput>
): "receipt" | "status" | "text" {
  if (submission.messageText?.trim().toUpperCase() === "STATUS") {
    return "status";
  }

  return submission.mediaUrl || submission.receiptFileId ? "receipt" : "text";
}

function normalizePhoneDigits(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || null;
}

function formatMoney(amount: number, currency: string) {
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
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
    isSystem: row.is_system,
    sortOrder: row.sort_order
  };
}

function mergePoliciesWithCategories(
  categories: readonly TexExpenseCategoryRow[],
  policies: readonly TexSpendPolicyRow[]
) {
  const policyByCategory = new Map(policies.map((policy) => [policy.category, policy]));
  const merged = categories.map((category) => {
    const policy = policyByCategory.get(category.name);
    return policy
      ? mapSpendPolicy(policy)
      : {
          id: null,
          category: category.name,
          dailyLimit: null,
          monthlyLimit: null,
          requiresNotesAbove: null,
          isBlocked: false
        };
  });
  const categoryNames = new Set(categories.map((category) => category.name));
  const customPolicies = policies
    .filter((policy) => !categoryNames.has(policy.category))
    .map(mapSpendPolicy);

  return [...merged, ...customPolicies];
}

function mapSpendPolicy(row: TexSpendPolicyRow): TexSpendPolicy {
  return {
    id: row.id,
    category: row.category,
    dailyLimit: row.daily_limit,
    monthlyLimit: row.monthly_limit,
    requiresNotesAbove: row.requires_notes_above,
    isBlocked: row.is_blocked
  };
}

function mapBudget(row: TexBudgetRow): TexBudget {
  const spentAmount = row.spent_amount ?? 0;
  return {
    id: row.id,
    department: row.department,
    month: row.month,
    year: row.year,
    budgetAmount: row.budget_amount,
    spentAmount,
    remainingAmount: row.budget_amount - spentAmount
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
    metaWhatsappBusinessAccountId: row.meta_whatsapp_business_account_id,
    aiReceiptExtractionEnabled: row.ai_receipt_extraction_enabled,
    duplicateDetectionEnabled: row.duplicate_detection_enabled,
    duplicateAutoRejectEnabled: row.duplicate_auto_reject_enabled,
    duplicateSimilarityThreshold: row.duplicate_similarity_threshold
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
    createdAt: row.created_at,
    duplicateStatus: row.duplicate_status,
    duplicateReason: row.duplicate_reason,
    managerReviewRequired: row.manager_review_required
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
    legCount: row.leg_count,
    totalDistanceKm: row.total_distance_km,
    expenseCount: row.expense_count,
    spendAmount: row.spend_amount
  };
}

function mapTripLeg(row: TexTripLegRow): TexTripLeg {
  return {
    id: row.id,
    sequence: row.sequence,
    origin: row.origin,
    originPlaceId: row.origin_place_id,
    originLat: row.origin_lat,
    originLng: row.origin_lng,
    originCountry: row.origin_country,
    destination: row.destination,
    destinationPlaceId: row.destination_place_id,
    destinationLat: row.destination_lat,
    destinationLng: row.destination_lng,
    destinationCountry: row.destination_country,
    mode: row.mode,
    status: row.status,
    plannedStart: row.planned_start,
    plannedEnd: row.planned_end,
    actualStart: row.actual_start,
    actualEnd: row.actual_end,
    distanceKm: row.distance_km,
    isReturnTrip: row.is_return_trip,
    returnDistanceKm: row.return_distance_km,
    returnDurationSeconds: row.return_duration_seconds,
    totalDistanceKm: row.total_distance_km,
    durationSeconds: row.duration_seconds,
    distanceSource: row.distance_source,
    routePolyline: row.route_polyline,
    budgetAmount: row.budget_amount,
    containerRef: row.container_ref,
    notes: row.notes
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

function mapDriverAdvance(row: TexDriverAdvanceRow): TexDriverAdvance {
  return {
    id: row.id,
    employeeProfileId: row.employee_profile_id,
    amount: row.amount,
    currency: row.currency,
    baseAmount: row.base_amount,
    advanceDate: row.advance_date,
    month: row.month,
    year: row.year,
    notes: row.notes
  };
}

function mapNotification(row: TexNotificationRow): TexNotification {
  return {
    id: row.id,
    userId: row.user_id,
    title: row.title,
    body: row.body,
    type: row.type,
    relatedExpenseId: row.related_expense_id,
    relatedTripId: row.related_trip_id,
    isRead: row.is_read,
    createdAt: row.created_at
  };
}

function mapUnregisteredWhatsappSubmission(
  row: TexUnregisteredWhatsappSubmissionRow
): TexUnregisteredWhatsappSubmission {
  return {
    id: row.id,
    status: row.status,
    senderRaw: row.sender_raw,
    senderPhone: row.sender_phone,
    whatsappChatJid: row.whatsapp_chat_jid,
    messageId: row.message_id,
    sessionId: row.session_id,
    messageText: row.message_text,
    receiptFileId: row.receipt_file_id,
    mediaUrl: row.media_url,
    mediaMimeType: row.media_mime_type,
    messageType: row.message_type,
    ocrStatus: row.ocr_status,
    ocrResult: parseSubmissionExtraction(row.ocr_result),
    ocrError: row.ocr_error,
    whatsappReplyText: row.whatsapp_reply_text,
    resolvedExpenseId: row.resolved_expense_id,
    resolvedEmployeeProfileId: row.resolved_employee_profile_id,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at
  };
}

type TexExpenseCategoryRow = {
  id: string;
  name: string;
  is_active: boolean;
  is_system: boolean;
  sort_order: number;
};

type TexSpendPolicyRow = {
  id: string;
  category: string;
  daily_limit: number | null;
  monthly_limit: number | null;
  requires_notes_above: number | null;
  is_blocked: boolean;
};

type TexBudgetRow = {
  id: string;
  department: string;
  month: number;
  year: number;
  budget_amount: number;
  spent_amount: number | null;
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
  ai_receipt_extraction_enabled: boolean;
  duplicate_detection_enabled: boolean;
  duplicate_auto_reject_enabled: boolean;
  duplicate_similarity_threshold: number;
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
  duplicate_status: "clear" | "suspected" | "duplicate";
  duplicate_reason: string | null;
  manager_review_required: boolean;
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
  leg_count: number;
  total_distance_km: number;
  expense_count: number;
  spend_amount: number;
};

type TexTripLegRow = {
  id: string;
  sequence: number;
  origin: string;
  origin_place_id: string | null;
  origin_lat: number | null;
  origin_lng: number | null;
  origin_country: string | null;
  destination: string;
  destination_place_id: string | null;
  destination_lat: number | null;
  destination_lng: number | null;
  destination_country: string | null;
  mode: TexTripLegMode | null;
  status: TexTripLegStatus;
  planned_start: string | null;
  planned_end: string | null;
  actual_start: string | null;
  actual_end: string | null;
  distance_km: number | null;
  is_return_trip: boolean;
  return_distance_km: number | null;
  return_duration_seconds: number | null;
  total_distance_km: number | null;
  duration_seconds: number | null;
  distance_source: string | null;
  route_polyline: string | null;
  budget_amount: number | null;
  container_ref: string | null;
  notes: string | null;
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

type TexDriverAdvanceRow = {
  id: string;
  employee_profile_id: string;
  amount: number;
  currency: string;
  base_amount: number;
  advance_date: string;
  month: number;
  year: number;
  notes: string | null;
};

type TexNotificationRow = {
  id: string;
  user_id: string | null;
  title: string;
  body: string | null;
  type: string | null;
  related_expense_id: string | null;
  related_trip_id: string | null;
  is_read: boolean;
  created_at: string;
};

type TexWebhookSubmissionRow = {
  id: string;
  status: "open" | "resolved" | "ignored";
};

type TexWhatsappNotificationSettingsRow = {
  whatsapp_provider: WhatsAppProvider;
  whatsapp_instance_id: string | null;
  wappfly_session_id: string | null;
  meta_phone_number_id: string | null;
  api_key: string | null;
};

type TexUnregisteredWhatsappSubmissionRow = {
  id: string;
  sender_raw: string | null;
  sender_phone: string | null;
  whatsapp_chat_jid: string | null;
  message_id: string | null;
  session_id: string | null;
  message_text: string | null;
  receipt_file_id: string | null;
  media_url: string | null;
  media_mime_type: string | null;
  message_type: "receipt" | "status" | "text";
  ocr_status: TexWhatsappReceiptResult["ocrStatus"];
  ocr_result: unknown;
  ocr_error: string | null;
  whatsapp_reply_text: string | null;
  status: "open" | "resolved" | "ignored";
  resolved_expense_id: string | null;
  resolved_employee_profile_id: string | null;
  resolved_at: string | null;
  created_at: string;
};

type TexProcessingSettingsRow = {
  ai_receipt_extraction_enabled: boolean;
  duplicate_detection_enabled: boolean;
  duplicate_auto_reject_enabled: boolean;
  duplicate_similarity_threshold: number;
};

type TexDuplicateCandidateRow = {
  id: string;
  vendor: string | null;
  amount: number;
  currency: string;
  expense_date: string;
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
  return (
    value === "crm" || value === "fsm" || value === "tex" || value === "cme" || value === "lqs"
  );
}
