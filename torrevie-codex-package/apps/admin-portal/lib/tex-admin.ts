import { hasPermission, type RoleKey } from "@torrevie/permissions";
import type { SupabaseClient } from "@supabase/supabase-js";
import { isLocalReviewBypassEnabled } from "./session";
import { assignSubscription, type SubscriptionStatus } from "./subscription-management";

export const texPlanKeys = ["trial", "lite", "growth", "enterprise"] as const;
export type TexPlanKey = (typeof texPlanKeys)[number];

export const texPlanStatuses = ["trialing", "active", "expired", "suspended", "cancelled"] as const;
export type TexPlanStatus = (typeof texPlanStatuses)[number];

export const texWhatsappProviderScopes = [
  "not_configured",
  "torrevie_managed",
  "customer_owned"
] as const;
export type TexWhatsappProviderScope = (typeof texWhatsappProviderScopes)[number];

export const texBillingStatuses = [
  "not_configured",
  "manual_invoice_pending",
  "invoiced",
  "paid",
  "overdue",
  "waived"
] as const;
export type TexBillingStatus = (typeof texBillingStatuses)[number];

export const texEnterpriseRequestStatuses = [
  "requested",
  "contacted",
  "discovery",
  "proposal",
  "setup",
  "live",
  "closed"
] as const;
export type TexEnterpriseRequestStatus = (typeof texEnterpriseRequestStatuses)[number];

export type TexPlanControlRecord = {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  tenant_name: string;
  tenant_created_at: string;
  plan_key: TexPlanKey;
  plan_status: TexPlanStatus;
  trial_start_date: string | null;
  trial_end_date: string | null;
  employee_limit: number;
  seat_count: number;
  whatsapp_provider_scope: TexWhatsappProviderScope;
  billing_status: TexBillingStatus;
  renewal_date: string | null;
  internal_plan_notes: string;
  updated_at: string;
};

export type TexPlanControlInput = {
  tenantId: string;
  planKey: TexPlanKey;
  planStatus: TexPlanStatus;
  trialStartDate?: string | null;
  trialEndDate?: string | null;
  employeeLimit: number;
  seatCount: number;
  whatsappProviderScope: TexWhatsappProviderScope;
  billingStatus: TexBillingStatus;
  renewalDate?: string | null;
  internalPlanNotes?: string | null;
};

export type TexTrialOverviewRecord = TexPlanControlRecord & {
  employee_count: number;
  whatsapp_connected: boolean;
  first_receipt_received: boolean;
  first_expense_approved: boolean;
  onboarding_progress: number;
  last_activity: string | null;
};

export type TexTenantSupportDetail = TexTrialOverviewRecord & {
  blockers: string[];
  open_whatsapp_submissions: number;
  ocr_pending_count: number;
  manual_review_count: number;
  recent_activity: string[];
};

export type TexEnterpriseRequestRecord = {
  id: string;
  tenant_id: string;
  tenant_name: string;
  status: TexEnterpriseRequestStatus;
  requested_capabilities: string[];
  contact_name: string;
  contact_email: string;
  contact_phone: string;
  contact_position: string;
  internal_owner_user_id: string | null;
  internal_notes: string;
  target_go_live_date: string | null;
  next_follow_up_date: string | null;
  created_at: string;
  updated_at: string;
};

export type TexEnterpriseRequestInput = {
  tenantId: string;
  status: TexEnterpriseRequestStatus;
  requestedCapabilities: string[];
  contactName?: string | null;
  contactEmail?: string | null;
  contactPhone?: string | null;
  contactPosition?: string | null;
  internalOwnerUserId?: string | null;
  internalNotes?: string | null;
  targetGoLiveDate?: string | null;
  nextFollowUpDate?: string | null;
};

type TenantRelation = { id: string; name: string; created_at: string };
type TenantJoined<T> = T & { tenants: TenantRelation | TenantRelation[] | null };

type TexPlanControlRow = {
  id: string;
  tenant_id: string;
  subscription_id: string | null;
  plan_key: TexPlanKey;
  plan_status: TexPlanStatus;
  trial_start_date: string | null;
  trial_end_date: string | null;
  employee_limit: number;
  seat_count: number;
  whatsapp_provider_scope: TexWhatsappProviderScope;
  billing_status: TexBillingStatus;
  renewal_date: string | null;
  internal_plan_notes: string | null;
  updated_at: string;
};

type EnterpriseRequestRow = {
  id: string;
  tenant_id: string;
  status: TexEnterpriseRequestStatus;
  requested_capabilities: string[] | null;
  contact_name: string | null;
  contact_email: string | null;
  contact_phone: string | null;
  contact_position: string | null;
  internal_owner_user_id: string | null;
  internal_notes: string | null;
  target_go_live_date: string | null;
  next_follow_up_date: string | null;
  created_at: string;
  updated_at: string;
};

export async function requirePlatformPermission(
  client: SupabaseClient,
  actorUserId: string,
  permission: "platform.subscription.manage" | "platform.audit.read_all" | "platform.provision"
) {
  if (await isLocalReviewBypassEnabled()) {
    return;
  }

  const roles = await listPlatformRolesForUser(client, actorUserId);
  const decision = hasPermission({ roles, permission });

  if (!decision.allowed) {
    throw new Error(`You do not have permission to perform this action: ${permission}.`);
  }
}

export async function listTexPlanControls(client: SupabaseClient): Promise<TexPlanControlRecord[]> {
  const { data, error } = await client
    .from("tex_plan_controls")
    .select(
      "id,tenant_id,subscription_id,plan_key,plan_status,trial_start_date,trial_end_date,employee_limit,seat_count,whatsapp_provider_scope,billing_status,renewal_date,internal_plan_notes,updated_at,tenants(id,name,created_at)"
    )
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to list TEX plan controls: ${error.message}`);
  }

  return ((data ?? []) as Array<TenantJoined<TexPlanControlRow>>).map(mapPlanControl);
}

export async function listTexTrialOverview(
  client: SupabaseClient
): Promise<TexTrialOverviewRecord[]> {
  const controls = (await listTexPlanControls(client)).filter(
    (control) => control.plan_status === "trialing"
  );
  return enrichTrialOverview(client, controls);
}

export async function getTexTenantSupportDetail(
  client: SupabaseClient,
  tenantId: string
): Promise<TexTenantSupportDetail | null> {
  assertUuid(tenantId, "tenant id");
  const controls = await listTexPlanControls(client);
  const control = controls.find((row) => row.tenant_id === tenantId);

  if (!control) {
    return null;
  }

  const [overview] = await enrichTrialOverview(client, [control]);
  if (!overview) {
    return null;
  }

  const ids = [tenantId];
  const [openSubmissions, ocrPending, manualReview, recentExpenses, recentSubmissions] =
    await Promise.all([
      countRows(client, "tex_unregistered_whatsapp_submissions", ids, {
        column: "status",
        value: "open"
      }),
      countRows(client, "tex_unregistered_whatsapp_submissions", ids, {
        column: "ocr_status",
        value: "pending"
      }),
      countRows(client, "tex_unregistered_whatsapp_submissions", ids, {
        column: "ocr_status",
        value: "manual_review"
      }),
      client
        .from("tex_expenses")
        .select("vendor,status,created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(4),
      client
        .from("tex_unregistered_whatsapp_submissions")
        .select("sender_phone,status,ocr_status,created_at")
        .eq("tenant_id", tenantId)
        .order("created_at", { ascending: false })
        .limit(4)
    ]);

  if (recentExpenses.error) {
    throw new Error(`Unable to list recent TEX expenses: ${recentExpenses.error.message}`);
  }

  if (recentSubmissions.error) {
    throw new Error(
      `Unable to list recent TEX WhatsApp submissions: ${recentSubmissions.error.message}`
    );
  }

  const blockers = [
    overview.trial_start_date ? null : "company profile incomplete",
    overview.whatsapp_connected ? null : "WhatsApp not connected",
    overview.employee_count > 0 ? null : "no employees invited",
    overview.first_receipt_received ? null : "no receipt received",
    (ocrPending.get(tenantId) ?? 0) + (manualReview.get(tenantId) ?? 0) > 0
      ? "receipt stuck in OCR/manual review"
      : null,
    overview.first_expense_approved ? null : "no approval completed",
    overview.last_activity ? null : "dashboard not viewed"
  ].filter((blocker): blocker is string => Boolean(blocker));

  const activity = [
    ...(
      (recentExpenses.data ?? []) as Array<{
        vendor: string | null;
        status: string;
        created_at: string;
      }>
    ).map(
      (expense) =>
        `Expense ${expense.vendor ?? "receipt"} is ${expense.status} (${formatDateTime(expense.created_at)})`
    ),
    ...(
      (recentSubmissions.data ?? []) as Array<{
        sender_phone: string | null;
        status: string;
        ocr_status: string;
        created_at: string;
      }>
    ).map(
      (submission) =>
        `WhatsApp ${submission.sender_phone ?? "sender"} is ${submission.status}/${submission.ocr_status} (${formatDateTime(
          submission.created_at
        )})`
    )
  ];

  return {
    ...overview,
    blockers,
    open_whatsapp_submissions: openSubmissions.get(tenantId) ?? 0,
    ocr_pending_count: ocrPending.get(tenantId) ?? 0,
    manual_review_count: manualReview.get(tenantId) ?? 0,
    recent_activity: activity
  };
}

export async function upsertTexPlanControl(
  client: SupabaseClient,
  input: TexPlanControlInput,
  actorUserId: string
): Promise<TexPlanControlRecord> {
  const sanitized = sanitizePlanControlInput(input);
  const plan = await getTexPlan(client, sanitized.planKey);
  const subscription = await assignSubscription(
    client,
    {
      tenantId: sanitized.tenantId,
      planId: plan.id,
      status: subscriptionStatusForTexStatus(sanitized.planStatus),
      startsAt: dateToTimestamp(sanitized.trialStartDate) ?? new Date().toISOString(),
      expiresAt: dateToTimestamp(sanitized.trialEndDate ?? sanitized.renewalDate)
    },
    actorUserId
  );
  await updateTexEmployeeLimitEntitlement(
    client,
    subscription.id,
    sanitized.employeeLimit,
    actorUserId
  );

  const previous = await getExistingPlanControl(client, sanitized.tenantId);
  const { data, error } = await client
    .from("tex_plan_controls")
    .upsert(
      {
        tenant_id: sanitized.tenantId,
        subscription_id: subscription.id,
        plan_key: sanitized.planKey,
        plan_status: sanitized.planStatus,
        trial_start_date: sanitized.trialStartDate,
        trial_end_date: sanitized.trialEndDate,
        employee_limit: sanitized.employeeLimit,
        seat_count: sanitized.seatCount,
        whatsapp_provider_scope: sanitized.whatsappProviderScope,
        billing_status: sanitized.billingStatus,
        renewal_date: sanitized.renewalDate,
        internal_plan_notes: sanitized.internalPlanNotes,
        created_by: actorUserId,
        updated_by: actorUserId
      },
      { onConflict: "tenant_id" }
    )
    .select(
      "id,tenant_id,subscription_id,plan_key,plan_status,trial_start_date,trial_end_date,employee_limit,seat_count,whatsapp_provider_scope,billing_status,renewal_date,internal_plan_notes,updated_at,tenants(id,name,created_at)"
    )
    .single();

  if (error) {
    throw new Error(`Unable to save TEX plan control: ${error.message}`);
  }

  await writeTexAuditEvent(client, {
    tenantId: sanitized.tenantId,
    actorUserId,
    action: previous ? "tex.plan_control.updated" : "tex.plan_control.created",
    targetType: "tex_plan_control",
    targetId: (data as TexPlanControlRow).id,
    metadata: {
      previous_plan_key: previous?.plan_key ?? "",
      next_plan_key: sanitized.planKey,
      previous_plan_status: previous?.plan_status ?? "",
      next_plan_status: sanitized.planStatus,
      employee_limit: String(sanitized.employeeLimit),
      billing_status: sanitized.billingStatus
    }
  });

  return mapPlanControl(data as TenantJoined<TexPlanControlRow>);
}

export async function listTexEnterpriseRequests(
  client: SupabaseClient
): Promise<TexEnterpriseRequestRecord[]> {
  const { data, error } = await client
    .from("tex_enterprise_requests")
    .select(
      "id,tenant_id,status,requested_capabilities,contact_name,contact_email,contact_phone,contact_position,internal_owner_user_id,internal_notes,target_go_live_date,next_follow_up_date,created_at,updated_at,tenants(id,name,created_at)"
    )
    .order("updated_at", { ascending: false });

  if (error) {
    throw new Error(`Unable to list TEX Enterprise requests: ${error.message}`);
  }

  return ((data ?? []) as Array<TenantJoined<EnterpriseRequestRow>>).map(mapEnterpriseRequest);
}

export async function upsertTexEnterpriseRequest(
  client: SupabaseClient,
  input: TexEnterpriseRequestInput,
  actorUserId: string
) {
  const sanitized = sanitizeEnterpriseRequestInput(input);
  const { data, error } = await client
    .from("tex_enterprise_requests")
    .insert({
      tenant_id: sanitized.tenantId,
      status: sanitized.status,
      requested_capabilities: sanitized.requestedCapabilities,
      contact_name: sanitized.contactName,
      contact_email: sanitized.contactEmail,
      contact_phone: sanitized.contactPhone,
      contact_position: sanitized.contactPosition,
      internal_owner_user_id: sanitized.internalOwnerUserId,
      internal_notes: sanitized.internalNotes,
      target_go_live_date: sanitized.targetGoLiveDate,
      next_follow_up_date: sanitized.nextFollowUpDate,
      closed_at: sanitized.status === "closed" ? new Date().toISOString() : null,
      created_by: actorUserId,
      updated_by: actorUserId
    })
    .select("id")
    .single();

  if (error) {
    throw new Error(`Unable to create TEX Enterprise request: ${error.message}`);
  }

  await writeTexAuditEvent(client, {
    tenantId: sanitized.tenantId,
    actorUserId,
    action: "tex.enterprise_request.created",
    targetType: "tex_enterprise_request",
    targetId: String(data.id),
    metadata: {
      status: sanitized.status,
      requested_capabilities: sanitized.requestedCapabilities.join(",")
    }
  });

  return data;
}

export async function updateTexEnterpriseRequestStatus(
  client: SupabaseClient,
  requestId: string,
  status: TexEnterpriseRequestStatus,
  actorUserId: string
) {
  assertUuid(requestId, "Enterprise request id");
  assertIn(status, texEnterpriseRequestStatuses, "Enterprise request status");

  const { data: existing, error: existingError } = await client
    .from("tex_enterprise_requests")
    .select("tenant_id,status")
    .eq("id", requestId)
    .single();

  if (existingError || !existing) {
    throw new Error(
      `Unable to load TEX Enterprise request: ${existingError?.message ?? "missing row"}`
    );
  }

  const { error } = await client
    .from("tex_enterprise_requests")
    .update({
      status,
      closed_at: status === "closed" ? new Date().toISOString() : null,
      updated_by: actorUserId
    })
    .eq("id", requestId);

  if (error) {
    throw new Error(`Unable to update TEX Enterprise request status: ${error.message}`);
  }

  await writeTexAuditEvent(client, {
    tenantId: String(existing.tenant_id),
    actorUserId,
    action: "tex.enterprise_request.status_changed",
    targetType: "tex_enterprise_request",
    targetId: requestId,
    metadata: {
      previous_status: String(existing.status),
      next_status: status
    }
  });
}

async function enrichTrialOverview(
  client: SupabaseClient,
  controls: TexPlanControlRecord[]
): Promise<TexTrialOverviewRecord[]> {
  const tenantIds = controls.map((control) => control.tenant_id);
  if (tenantIds.length === 0) {
    return [];
  }

  const [employees, settings, receipts, approvals, onboarding] = await Promise.all([
    countRows(client, "tex_employee_profiles", tenantIds),
    countRows(client, "tex_integration_settings", tenantIds),
    countRows(client, "tex_unregistered_whatsapp_submissions", tenantIds),
    countRows(client, "tex_expenses", tenantIds, { column: "status", value: "approved" }),
    client
      .from("tex_onboarding_status")
      .select(
        "tenant_id,company_profile_completed_at,whatsapp_connected_at,first_employee_invited_at,first_receipt_received_at,first_expense_approved_at,dashboard_first_viewed_at,last_activity_at"
      )
      .in("tenant_id", tenantIds)
  ]);

  if (onboarding.error) {
    throw new Error(`Unable to list TEX onboarding status: ${onboarding.error.message}`);
  }

  const onboardingByTenant = new Map(
    ((onboarding.data ?? []) as Array<{ tenant_id: string; [key: string]: string | null }>).map(
      (row) => [row.tenant_id, row]
    )
  );

  return controls.map((control) => {
    const row = onboardingByTenant.get(control.tenant_id);
    const employeeCount = employees.get(control.tenant_id) ?? 0;
    const whatsappConnected = Boolean(
      settings.get(control.tenant_id) || row?.whatsapp_connected_at
    );
    const firstReceiptReceived = Boolean(
      receipts.get(control.tenant_id) || row?.first_receipt_received_at
    );
    const firstExpenseApproved = Boolean(
      approvals.get(control.tenant_id) || row?.first_expense_approved_at
    );
    const milestones = [
      control.trial_start_date || row?.company_profile_completed_at,
      whatsappConnected,
      employeeCount > 0 || row?.first_employee_invited_at,
      firstReceiptReceived,
      firstExpenseApproved,
      row?.dashboard_first_viewed_at
    ];

    return {
      ...control,
      employee_count: employeeCount,
      whatsapp_connected: whatsappConnected,
      first_receipt_received: firstReceiptReceived,
      first_expense_approved: firstExpenseApproved,
      onboarding_progress: Math.round(
        (milestones.filter(Boolean).length / milestones.length) * 100
      ),
      last_activity: row?.last_activity_at ?? control.updated_at
    };
  });
}

async function countRows(
  client: SupabaseClient,
  table: string,
  tenantIds: string[],
  filter?: { column: string; value: string }
) {
  if (tenantIds.length === 0) {
    return new Map<string, number>();
  }

  let query = client.from(table).select("tenant_id").in("tenant_id", tenantIds);

  if (filter) {
    query = query.eq(filter.column, filter.value);
  }

  const { data, error } = await query;

  if (error) {
    throw new Error(`Unable to count ${table}: ${error.message}`);
  }

  const counts = new Map<string, number>();
  for (const row of (data ?? []) as Array<{ tenant_id: string }>) {
    counts.set(row.tenant_id, (counts.get(row.tenant_id) ?? 0) + 1);
  }

  return counts;
}

async function getTexPlan(client: SupabaseClient, planKey: TexPlanKey): Promise<{ id: string }> {
  const { data, error } = await client
    .from("plans")
    .select("id,products!inner(key)")
    .eq("key", planKey)
    .eq("products.key", "tex")
    .single();

  if (error || !data) {
    throw new Error(`Unable to find TEX ${planKey} plan: ${error?.message ?? "missing plan"}`);
  }

  return { id: String(data.id) };
}

async function getExistingPlanControl(client: SupabaseClient, tenantId: string) {
  const { data, error } = await client
    .from("tex_plan_controls")
    .select("plan_key,plan_status")
    .eq("tenant_id", tenantId)
    .maybeSingle();

  if (error) {
    throw new Error(`Unable to get existing TEX plan control: ${error.message}`);
  }

  return data as Pick<TexPlanControlRow, "plan_key" | "plan_status"> | null;
}

async function updateTexEmployeeLimitEntitlement(
  client: SupabaseClient,
  subscriptionId: string,
  employeeLimit: number,
  actorUserId: string
) {
  const { data: subscription, error: subscriptionError } = await client
    .from("subscriptions")
    .select("tenant_id")
    .eq("id", subscriptionId)
    .single();

  if (subscriptionError || !subscription) {
    throw new Error(
      `Unable to resolve TEX subscription for limit update: ${subscriptionError?.message ?? "missing row"}`
    );
  }

  const { error } = await client.from("subscription_entitlements").upsert(
    {
      tenant_id: String(subscription.tenant_id),
      subscription_id: subscriptionId,
      feature_key: "tex.employee_limit",
      enabled: true,
      limit_value: employeeLimit,
      override_reason: "manual_tex_plan_control",
      created_by: actorUserId,
      updated_by: actorUserId
    },
    { onConflict: "subscription_id,feature_key" }
  );

  if (error) {
    throw new Error(`Unable to update TEX employee limit entitlement: ${error.message}`);
  }
}

async function listPlatformRolesForUser(
  client: SupabaseClient,
  actorUserId: string
): Promise<RoleKey[]> {
  const { data, error } = await client
    .from("user_role_assignments")
    .select("roles!inner(key,scope)")
    .eq("user_id", actorUserId)
    .eq("roles.scope", "platform");

  if (error) {
    throw new Error(`Unable to resolve platform roles: ${error.message}`);
  }

  return ((data ?? []) as Array<{ roles: { key?: string } | Array<{ key?: string }> | null }>)
    .map((row) => firstRelation(row.roles)?.key)
    .filter((role): role is RoleKey => isPlatformRole(role));
}

async function writeTexAuditEvent(
  client: SupabaseClient,
  event: {
    tenantId: string;
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, string>;
  }
) {
  const { error } = await client.from("audit_events").insert({
    tenant_id: event.tenantId,
    actor_user_id: event.actorUserId,
    action: event.action,
    target_type: event.targetType,
    target_id: event.targetId,
    metadata: event.metadata
  });

  if (error) {
    throw new Error(`Unable to write TEX audit event: ${error.message}`);
  }
}

function sanitizePlanControlInput(input: TexPlanControlInput): Required<TexPlanControlInput> {
  assertUuid(input.tenantId, "tenant id");
  assertIn(input.planKey, texPlanKeys, "TEX plan");
  assertIn(input.planStatus, texPlanStatuses, "TEX plan status");
  assertIn(input.whatsappProviderScope, texWhatsappProviderScopes, "WhatsApp provider scope");
  assertIn(input.billingStatus, texBillingStatuses, "billing status");

  if (!Number.isInteger(input.employeeLimit) || input.employeeLimit < 0) {
    throw new Error("Employee limit must be a non-negative integer.");
  }

  if (!Number.isInteger(input.seatCount) || input.seatCount < 0) {
    throw new Error("Seat count must be a non-negative integer.");
  }

  const trialStartDate = optionalDate(input.trialStartDate, "trial start date");
  const trialEndDate = optionalDate(input.trialEndDate, "trial end date");
  const renewalDate = optionalDate(input.renewalDate, "renewal date");

  if (trialStartDate && trialEndDate && trialEndDate <= trialStartDate) {
    throw new Error("Trial end date must be after trial start date.");
  }

  return {
    tenantId: input.tenantId,
    planKey: input.planKey,
    planStatus: input.planStatus,
    trialStartDate: trialStartDate?.toISOString().slice(0, 10) ?? null,
    trialEndDate: trialEndDate?.toISOString().slice(0, 10) ?? null,
    employeeLimit: input.employeeLimit,
    seatCount: input.seatCount,
    whatsappProviderScope: input.whatsappProviderScope,
    billingStatus: input.billingStatus,
    renewalDate: renewalDate?.toISOString().slice(0, 10) ?? null,
    internalPlanNotes: input.internalPlanNotes?.trim() ?? ""
  };
}

function sanitizeEnterpriseRequestInput(
  input: TexEnterpriseRequestInput
): Required<TexEnterpriseRequestInput> {
  assertUuid(input.tenantId, "tenant id");
  assertIn(input.status, texEnterpriseRequestStatuses, "Enterprise request status");
  const internalOwnerUserId = input.internalOwnerUserId?.trim() || null;

  if (internalOwnerUserId) {
    assertUuid(internalOwnerUserId, "internal owner user id");
  }

  return {
    tenantId: input.tenantId,
    status: input.status,
    requestedCapabilities: input.requestedCapabilities
      .map((capability) => capability.trim())
      .filter(Boolean),
    contactName: input.contactName?.trim() ?? "",
    contactEmail: input.contactEmail?.trim() ?? "",
    contactPhone: input.contactPhone?.trim() ?? "",
    contactPosition: input.contactPosition?.trim() ?? "",
    internalOwnerUserId,
    internalNotes: input.internalNotes?.trim() ?? "",
    targetGoLiveDate:
      optionalDate(input.targetGoLiveDate, "target go-live date")?.toISOString().slice(0, 10) ??
      null,
    nextFollowUpDate:
      optionalDate(input.nextFollowUpDate, "next follow-up date")?.toISOString().slice(0, 10) ??
      null
  };
}

function subscriptionStatusForTexStatus(status: TexPlanStatus): SubscriptionStatus {
  if (status === "trialing") return "trial";
  if (status === "active") return "active";
  if (status === "cancelled") return "cancelled";
  return "expired";
}

function optionalDate(value: string | null | undefined, label: string) {
  const clean = value?.trim();
  if (!clean) return null;
  const date = new Date(clean);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label}.`);
  }

  return date;
}

function dateToTimestamp(value: string | null | undefined) {
  const date = optionalDate(value, "date");
  return date?.toISOString() ?? null;
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function assertIn<T extends readonly string[]>(
  value: string,
  allowed: T,
  label: string
): asserts value is T[number] {
  if (!allowed.includes(value)) {
    throw new Error(`Unsupported ${label}: ${value}`);
  }
}

function isPlatformRole(value: string | undefined): value is RoleKey {
  return Boolean(value?.startsWith("torrevie_"));
}

function mapPlanControl(row: TenantJoined<TexPlanControlRow>): TexPlanControlRecord {
  const tenant = firstRelation(row.tenants);

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    subscription_id: row.subscription_id,
    tenant_name: tenant?.name ?? row.tenant_id,
    tenant_created_at: tenant?.created_at ?? "",
    plan_key: row.plan_key,
    plan_status: row.plan_status,
    trial_start_date: row.trial_start_date,
    trial_end_date: row.trial_end_date,
    employee_limit: row.employee_limit,
    seat_count: row.seat_count,
    whatsapp_provider_scope: row.whatsapp_provider_scope,
    billing_status: row.billing_status,
    renewal_date: row.renewal_date,
    internal_plan_notes: row.internal_plan_notes ?? "",
    updated_at: row.updated_at
  };
}

function mapEnterpriseRequest(row: TenantJoined<EnterpriseRequestRow>): TexEnterpriseRequestRecord {
  const tenant = firstRelation(row.tenants);

  return {
    id: row.id,
    tenant_id: row.tenant_id,
    tenant_name: tenant?.name ?? row.tenant_id,
    status: row.status,
    requested_capabilities: row.requested_capabilities ?? [],
    contact_name: row.contact_name ?? "",
    contact_email: row.contact_email ?? "",
    contact_phone: row.contact_phone ?? "",
    contact_position: row.contact_position ?? "",
    internal_owner_user_id: row.internal_owner_user_id,
    internal_notes: row.internal_notes ?? "",
    target_go_live_date: row.target_go_live_date,
    next_follow_up_date: row.next_follow_up_date,
    created_at: row.created_at,
    updated_at: row.updated_at
  };
}

function firstRelation<T>(relation: T | T[] | null): T | null {
  return Array.isArray(relation) ? (relation[0] ?? null) : relation;
}

function formatDateTime(value: string) {
  return new Date(value).toISOString().slice(0, 16).replace("T", " ");
}
