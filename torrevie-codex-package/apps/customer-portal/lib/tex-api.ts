import type { TenantQueryClient } from "@torrevie/tenant-context";
import {
  closeTexTrip,
  createTexDriverAdvance,
  createTexEmployeeProfile,
  createTexExpense,
  createTexExpenseCategory,
  createTexNotification,
  createTexTrip,
  deleteTexBudget,
  deleteTexDriverAdvance,
  deleteTexEmployeeProfile,
  deleteTexExpenseCategory,
  deleteTexTripLeg,
  ignoreTexUnregisteredWhatsappSubmission,
  listTexBootstrap,
  listTexExpenses,
  listTexFinanceReview,
  listTexIntegrationWorkspace,
  listTexNotifications,
  listTexReportWorkspace,
  listTexSettingsWorkspace,
  listTexTripLegs,
  listTexTrips,
  listTexUnregisteredWhatsappSubmissions,
  markAllTexNotificationsRead,
  markTexNotificationRead,
  payTexFinanceItems,
  parseTexReceiptUpload,
  processTexWhatsappSubmission,
  recordTexWebhookSubmission,
  resolveTexUnregisteredWhatsappSubmission,
  replaceTexTripLegs,
  sendTexEmailReport,
  updateTexExpenseCategory,
  updateTexEmployeeProfile,
  updateTexTrip,
  updateTexExpenseStatus,
  uploadTexReceiptFile,
  upsertTexBudget,
  upsertTexSpendPolicy,
  type TexActorContext,
  type TexBudgetInput,
  type TexDriverAdvanceInput,
  type TexExpenseCategoryInput,
  type TexEmployeeProfileInput,
  type TexExpenseInput,
  type TexExpenseStatus,
  type TexFinancePaymentInput,
  type TexNotificationInput,
  type TexReceiptUploadInput,
  type TexEmailReportInput,
  type TexReportInput,
  type TexSpendPolicyInput,
  type TexTripLegInput,
  type TexTripInput,
  type TexUnregisteredWhatsappResolveInput,
  type TexWebhookSubmissionInput
} from "./tex";

export type TexApiRequest = {
  method: string;
  path: string;
  query?: Record<string, string>;
  body?: unknown;
};

export type TexApiResponse = {
  status: number;
  body: unknown;
};

type ResolvedGoogleRouteEstimateInput = {
  origin: string;
  originPlaceId: string | null;
  destination: string;
  destinationPlaceId: string | null;
  returnToOrigin: boolean;
};

type GoogleRouteEstimate = {
  distanceKm: number;
  durationSeconds: number | null;
  routePolyline: string | null;
  source: string;
  isReturnTrip: boolean;
  returnDistanceKm: number | null;
  returnDurationSeconds: number | null;
  totalDistanceKm: number;
};

type GooglePlaceSuggestion = {
  placeId: string;
  text: string;
};

type GooglePlaceSuggestionResult = {
  configured: boolean;
  places: GooglePlaceSuggestion[];
};

export async function handleTexApiRequest(
  client: TenantQueryClient,
  actor: TexActorContext,
  request: TexApiRequest
): Promise<TexApiResponse> {
  const path = normalizePath(request.path);
  const method = request.method.toUpperCase();

  if (path === "/admin" || path.startsWith("/admin/")) {
    return json(410, {
      error:
        "TEX administration has moved to admin.torrevie.com. Customer TEX work remains under app.torrevie.com/tex."
    });
  }

  if (path === "/bootstrap" && method === "GET") {
    return json(200, await listTexBootstrap(client, actor));
  }

  if (path === "/people" && method === "GET") {
    const bootstrap = await listTexBootstrap(client, actor);
    return json(200, {
      employees: bootstrap.employeeProfiles,
      employeeProfiles: bootstrap.employeeProfiles,
      teams: bootstrap.teams
    });
  }

  if ((path === "/people/employees" || path === "/employees") && method === "POST") {
    return json(201, {
      employee: await createTexEmployeeProfile(client, actor, readEmployeeInput(request.body))
    });
  }

  if (path === "/expenses" && method === "GET") {
    return json(200, { expenses: await listTexExpenses(client, actor) });
  }

  if (path === "/expenses" && method === "POST") {
    return json(201, {
      expense: await createTexExpense(client, actor, request.body as TexExpenseInput)
    });
  }

  if (path === "/receipts" && method === "POST") {
    return json(201, {
      receipt: await uploadTexReceiptFile(client, actor, request.body as TexReceiptUploadInput)
    });
  }

  if (path === "/receipts/parse" && method === "POST") {
    const body = readRecord(request.body);
    return json(
      200,
      await parseTexReceiptUpload({
        contentType:
          readOptionalString(body.contentType) ?? readOptionalString(body.content_type) ?? "",
        dataBase64:
          readOptionalString(body.dataBase64) ??
          readOptionalString(body.data_base64) ??
          readOptionalString(body.image_base64) ??
          ""
      })
    );
  }

  if (path === "/trips" && method === "GET") {
    return json(200, { trips: await listTexTrips(client, actor) });
  }

  if (path === "/trips" && method === "POST") {
    return json(201, { trip: await createTexTrip(client, actor, request.body as TexTripInput) });
  }

  if (path === "/places" && method === "GET") {
    return json(200, await googlePlaceSuggestions(request.query?.input ?? ""));
  }

  if (path === "/maps/places/autocomplete" && method === "POST") {
    const body = readRecord(request.body);
    const suggestions = await googlePlaceSuggestions(readOptionalString(body.input) ?? "");
    return json(200, {
      configured: suggestions.configured,
      suggestions: suggestions.places.map((place) => ({
        placeId: place.placeId,
        place_id: place.placeId,
        text: place.text,
        description: place.text
      }))
    });
  }

  const tripLegsMatch = path.match(/^\/trips\/([0-9a-f-]+)\/legs$/i);
  if (tripLegsMatch && method === "GET") {
    return json(200, { legs: await listTexTripLegs(client, actor, tripLegsMatch[1] ?? "") });
  }

  if (tripLegsMatch && method === "PUT") {
    const body = readRecord(request.body);
    return json(200, {
      legs: await replaceTexTripLegs(client, actor, tripLegsMatch[1] ?? "", {
        legs: Array.isArray(body.legs) ? (body.legs as TexTripLegInput[]) : []
      })
    });
  }

  const tripLegEstimateMatch = path.match(/^\/trips\/([0-9a-f-]+)\/legs\/estimate$/i);
  if (tripLegEstimateMatch && method === "POST") {
    await listTexTripLegs(client, actor, tripLegEstimateMatch[1] ?? "");
    const estimate = await googleReturnRouteEstimate(readGoogleEstimateInput(request.body));
    return json(200, { estimate });
  }

  if (path === "/finance-review" && method === "GET") {
    const query = request.query ?? {};
    return json(
      200,
      await listTexFinanceReview(client, actor, readInteger(query.month), readInteger(query.year))
    );
  }

  if ((path === "/reports" || path === "/dashboard") && method === "GET") {
    return json(200, await listTexReportWorkspace(client, actor, readReportInput(request.query)));
  }

  if ((path === "/reports/email" || path === "/email-reports/send") && method === "POST") {
    return json(200, await sendTexEmailReport(client, actor, readEmailReportInput(request.body)));
  }

  if (path === "/integrations" && method === "GET") {
    return json(200, await listTexIntegrationWorkspace(client, actor));
  }

  if (path === "/finance-review/pay" && method === "POST") {
    return json(
      200,
      await payTexFinanceItems(client, actor, request.body as TexFinancePaymentInput)
    );
  }

  if (path === "/driver-advances" && method === "POST") {
    return json(201, {
      advance: await createTexDriverAdvance(client, actor, readDriverAdvanceInput(request.body))
    });
  }

  const driverAdvanceMatch = path.match(/^\/driver-advances\/([0-9a-f-]+)$/i);
  if (driverAdvanceMatch && method === "DELETE") {
    await deleteTexDriverAdvance(client, actor, driverAdvanceMatch[1] ?? "");
    return json(200, { ok: true });
  }

  const employeeMatch =
    path.match(/^\/people\/employees\/([0-9a-f-]+)$/i) ??
    path.match(/^\/employees\/([0-9a-f-]+)$/i);
  if (employeeMatch && method === "PATCH") {
    return json(200, {
      employee: await updateTexEmployeeProfile(
        client,
        actor,
        employeeMatch[1] ?? "",
        readEmployeeInput(request.body)
      )
    });
  }

  if (employeeMatch && method === "DELETE") {
    await deleteTexEmployeeProfile(client, actor, employeeMatch[1] ?? "");
    return json(200, { ok: true });
  }

  if (path === "/notifications" && method === "GET") {
    return json(200, { notifications: await listTexNotifications(client, actor) });
  }

  if (path === "/notifications" && method === "POST") {
    return json(201, {
      notification: await createTexNotification(client, actor, readNotificationInput(request.body))
    });
  }

  if (path === "/notifications/read-all" && method === "PATCH") {
    return json(200, await markAllTexNotificationsRead(client, actor));
  }

  const notificationReadMatch = path.match(/^\/notifications\/([0-9a-f-]+)\/read$/i);
  if (notificationReadMatch && method === "PATCH") {
    return json(200, {
      notification: await markTexNotificationRead(client, actor, notificationReadMatch[1] ?? "")
    });
  }

  if (path === "/settings" && method === "GET") {
    return json(
      200,
      await listTexSettingsWorkspace(
        client,
        actor,
        readOptionalInteger(request.query?.month) ?? undefined,
        readOptionalInteger(request.query?.year) ?? undefined
      )
    );
  }

  if (path === "/settings/categories" && method === "POST") {
    return json(201, {
      category: await createTexExpenseCategory(client, actor, readCategoryInput(request.body))
    });
  }

  const settingsCategoryMatch = path.match(/^\/settings\/categories\/([0-9a-f-]+)$/i);
  if (settingsCategoryMatch && method === "PATCH") {
    return json(200, {
      category: await updateTexExpenseCategory(
        client,
        actor,
        settingsCategoryMatch[1] ?? "",
        readCategoryInput(request.body)
      )
    });
  }

  if (settingsCategoryMatch && method === "DELETE") {
    return json(200, await deleteTexExpenseCategory(client, actor, settingsCategoryMatch[1] ?? ""));
  }

  if (path === "/settings/policies" && method === "PUT") {
    return json(200, {
      policy: await upsertTexSpendPolicy(client, actor, readSpendPolicyInput(request.body))
    });
  }

  if (path === "/settings/budgets" && method === "PUT") {
    return json(200, {
      budget: await upsertTexBudget(client, actor, readBudgetInput(request.body))
    });
  }

  const settingsBudgetMatch = path.match(/^\/settings\/budgets\/([0-9a-f-]+)$/i);
  if (settingsBudgetMatch && method === "DELETE") {
    return json(200, await deleteTexBudget(client, actor, settingsBudgetMatch[1] ?? ""));
  }

  if (path === "/unregistered-whatsapp" && method === "GET") {
    return json(200, {
      submissions: await listTexUnregisteredWhatsappSubmissions(
        client,
        actor,
        readSubmissionStatusFilter(request.query?.status)
      )
    });
  }

  const unregisteredResolveMatch = path.match(/^\/unregistered-whatsapp\/([0-9a-f-]+)\/resolve$/i);
  if (unregisteredResolveMatch && method === "PATCH") {
    return json(200, {
      result: await resolveTexUnregisteredWhatsappSubmission(
        client,
        actor,
        unregisteredResolveMatch[1] ?? "",
        readUnregisteredResolveInput(request.body)
      )
    });
  }

  const unregisteredIgnoreMatch = path.match(/^\/unregistered-whatsapp\/([0-9a-f-]+)\/ignore$/i);
  if (unregisteredIgnoreMatch && method === "PATCH") {
    const body = readRecord(request.body);
    return json(200, {
      submission: await ignoreTexUnregisteredWhatsappSubmission(
        client,
        actor,
        unregisteredIgnoreMatch[1] ?? "",
        readOptionalString(body.reason)
      )
    });
  }

  const tripMatch = path.match(/^\/trips\/([0-9a-f-]+)$/i);
  if (tripMatch && method === "PATCH") {
    return json(200, {
      trip: await updateTexTrip(client, actor, tripMatch[1] ?? "", request.body as TexTripInput)
    });
  }

  const closeTripMatch = path.match(/^\/trips\/([0-9a-f-]+)\/close$/i);
  if (closeTripMatch && method === "PATCH") {
    return json(200, { trip: await closeTexTrip(client, actor, closeTripMatch[1] ?? "") });
  }

  const tripLegDeleteMatch = path.match(/^\/trips\/([0-9a-f-]+)\/legs\/([0-9a-f-]+)$/i);
  if (tripLegDeleteMatch && method === "DELETE") {
    await deleteTexTripLeg(client, actor, tripLegDeleteMatch[1] ?? "", tripLegDeleteMatch[2] ?? "");
    return json(200, { ok: true });
  }

  const statusMatch = path.match(/^\/expenses\/([0-9a-f-]+)\/status$/i);
  if (statusMatch && method === "PATCH") {
    const body = readRecord(request.body);
    return json(200, {
      expense: await updateTexExpenseStatus(
        client,
        actor,
        statusMatch[1] ?? "",
        readExpenseStatus(body.status),
        readOptionalString(body.reason)
      )
    });
  }

  if (path === "/webhook-submissions" && method === "POST") {
    return json(201, {
      submission: await recordTexWebhookSubmission(
        client,
        actor,
        request.body as TexWebhookSubmissionInput
      )
    });
  }

  if (path === "/webhook-submissions/process" && method === "POST") {
    return json(
      201,
      await processTexWhatsappSubmission(client, actor, request.body as TexWebhookSubmissionInput)
    );
  }

  return json(404, { error: "TEX API route was not found." });
}

function json(status: number, body: unknown): TexApiResponse {
  return { status, body };
}

function normalizePath(path: string) {
  const normalized = path.trim();
  const withLeadingSlash = normalized.startsWith("/") ? normalized : `/${normalized}`;
  return withLeadingSlash.replace(/\/+$/, "") || "/";
}

function readRecord(value: unknown) {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function readGoogleEstimateInput(value: unknown): ResolvedGoogleRouteEstimateInput {
  const body = readRecord(value);

  return {
    origin: readOptionalString(body.origin) ?? "",
    originPlaceId:
      readOptionalString(body.originPlaceId) ?? readOptionalString(body.origin_place_id),
    destination: readOptionalString(body.destination) ?? "",
    destinationPlaceId:
      readOptionalString(body.destinationPlaceId) ?? readOptionalString(body.destination_place_id),
    returnToOrigin: body.returnToOrigin === true || body.return_to_origin === true
  };
}

function readDriverAdvanceInput(value: unknown): TexDriverAdvanceInput {
  const body = readRecord(value);

  return {
    employeeProfileId:
      readOptionalString(body.employeeProfileId) ??
      readOptionalString(body.employee_profile_id) ??
      readOptionalString(body.employeeId) ??
      readOptionalString(body.employee_id),
    amount: readNumber(body.amount, "driver advance amount"),
    currency: readOptionalString(body.currency),
    baseAmount: readOptionalNumber(body.baseAmount) ?? readOptionalNumber(body.base_amount),
    advanceDate: readOptionalString(body.advanceDate) ?? readOptionalString(body.advance_date),
    month: readOptionalInteger(body.month),
    year: readOptionalInteger(body.year),
    notes: readOptionalString(body.notes)
  };
}

function readNotificationInput(value: unknown): TexNotificationInput {
  const body = readRecord(value);

  return {
    userId: readOptionalString(body.userId) ?? readOptionalString(body.user_id),
    title: readOptionalString(body.title) ?? "",
    body: readOptionalString(body.body),
    type: readOptionalString(body.type),
    relatedExpenseId:
      readOptionalString(body.relatedExpenseId) ?? readOptionalString(body.related_expense_id),
    relatedTripId:
      readOptionalString(body.relatedTripId) ?? readOptionalString(body.related_trip_id)
  };
}

function readCategoryInput(value: unknown): TexExpenseCategoryInput {
  const body = readRecord(value);

  return {
    name: readOptionalString(body.name) ?? "",
    isActive: readOptionalBoolean(body.isActive) ?? readOptionalBoolean(body.is_active),
    sortOrder: readOptionalInteger(body.sortOrder) ?? readOptionalInteger(body.sort_order)
  };
}

function readEmployeeInput(value: unknown): TexEmployeeProfileInput {
  const body = readRecord(value);

  return {
    name: readOptionalString(body.name) ?? readOptionalString(body.full_name) ?? "",
    phoneNumber:
      readOptionalString(body.phoneNumber) ??
      readOptionalString(body.phone_number) ??
      readOptionalString(body.whatsappPhone) ??
      readOptionalString(body.whatsapp_phone) ??
      "",
    department: readOptionalString(body.department),
    monthlySalary:
      readOptionalNumber(body.monthlySalary) ?? readOptionalNumber(body.monthly_salary),
    submissionFrequency:
      readSubmissionFrequency(body.submissionFrequency) ??
      readSubmissionFrequency(body.submission_frequency),
    isActive: readOptionalBoolean(body.isActive) ?? readOptionalBoolean(body.is_active) ?? true
  };
}

function readSpendPolicyInput(value: unknown): TexSpendPolicyInput {
  const body = readRecord(value);

  return {
    category: readOptionalString(body.category) ?? "",
    dailyLimit: readOptionalNumber(body.dailyLimit) ?? readOptionalNumber(body.daily_limit),
    monthlyLimit: readOptionalNumber(body.monthlyLimit) ?? readOptionalNumber(body.monthly_limit),
    requiresNotesAbove:
      readOptionalNumber(body.requiresNotesAbove) ?? readOptionalNumber(body.requires_notes_above),
    isBlocked: readOptionalBoolean(body.isBlocked) ?? readOptionalBoolean(body.is_blocked)
  };
}

function readBudgetInput(value: unknown): TexBudgetInput {
  const body = readRecord(value);

  return {
    department: readOptionalString(body.department) ?? "",
    month: readOptionalInteger(body.month) ?? 0,
    year: readOptionalInteger(body.year) ?? 0,
    budgetAmount:
      readOptionalNumber(body.budgetAmount) ?? readOptionalNumber(body.budget_amount) ?? -1
  };
}

function readReportInput(value: unknown): TexReportInput {
  const body = readRecord(value);

  return {
    dateFrom: readOptionalString(body.dateFrom) ?? readOptionalString(body.date_from),
    dateTo: readOptionalString(body.dateTo) ?? readOptionalString(body.date_to)
  };
}

function readEmailReportInput(value: unknown): TexEmailReportInput {
  const body = readRecord(value);
  const recipients = readRecipients(body.recipients);

  return {
    ...readReportInput(value),
    recipients: recipients.length ? recipients : undefined
  };
}

function readRecipients(value: unknown) {
  if (Array.isArray(value)) {
    return value.filter((recipient): recipient is string => typeof recipient === "string");
  }

  if (typeof value === "string") {
    return value
      .split(/[,\n;]/)
      .map((recipient) => recipient.trim())
      .filter(Boolean);
  }

  return [];
}

function readUnregisteredResolveInput(value: unknown): TexUnregisteredWhatsappResolveInput {
  const body = readRecord(value);
  const mode = readOptionalString(body.mode);

  if (mode !== "existing_employee" && mode !== "new_employee") {
    throw new Error("WhatsApp submission resolve mode must be existing_employee or new_employee.");
  }

  return {
    mode,
    employeeProfileId:
      readOptionalString(body.employeeProfileId) ??
      readOptionalString(body.employee_profile_id) ??
      readOptionalString(body.employeeId) ??
      readOptionalString(body.employee_id),
    employeeName: readOptionalString(body.employeeName) ?? readOptionalString(body.employee_name),
    phoneNumber: readOptionalString(body.phoneNumber) ?? readOptionalString(body.phone_number),
    department: readOptionalString(body.department)
  };
}

function readSubmissionStatusFilter(value: unknown): "open" | "resolved" | "ignored" | "all" {
  if (value === "resolved" || value === "ignored" || value === "all") {
    return value;
  }

  return "open";
}

function readExpenseStatus(value: unknown): Exclude<TexExpenseStatus, "pending"> {
  if (value === "approved" || value === "rejected" || value === "paid") {
    return value;
  }

  throw new Error(`Unsupported TEX expense status: ${String(value)}`);
}

function readSubmissionFrequency(value: unknown) {
  if (value === "realtime" || value === "daily" || value === "weekly" || value === "monthly") {
    return value;
  }

  return null;
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readOptionalBoolean(value: unknown) {
  return typeof value === "boolean" ? value : null;
}

function readInteger(value: unknown) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid integer: ${String(value)}`);
  }

  return parsed;
}

function readOptionalInteger(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return readInteger(value);
}

function readNumber(value: unknown, label: string) {
  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Invalid ${label}.`);
  }

  return parsed;
}

function readOptionalNumber(value: unknown) {
  if (value === null || value === undefined || value === "") {
    return null;
  }

  return readNumber(value, "number");
}

function googleMapsApiKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_API_KEY ||
    process.env.NEXT_PUBLIC_GOOGLE_MAPS_PLATFORM_KEY ||
    process.env.VITE_GOOGLE_MAPS_API_KEY ||
    process.env.VITE_GOOGLE_MAPS_PLATFORM_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_AI_KEY ||
    ""
  );
}

async function googlePlaceSuggestions(input: string): Promise<GooglePlaceSuggestionResult> {
  const key = googleMapsApiKey();
  const trimmed = input.trim();

  if (trimmed.length < 3) {
    return { configured: Boolean(key), places: [] };
  }

  if (!key) {
    return { configured: false, places: [] };
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask":
        "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text"
    },
    body: JSON.stringify({ input: trimmed })
  });
  const result = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }>;
  };

  if (!response.ok) {
    const error = new Error(
      result.error?.message || `Google Places rejected the request (${response.status}).`
    );
    (error as Error & { statusCode?: number }).statusCode =
      response.status === 401 || response.status === 403 ? 502 : response.status;
    throw error;
  }

  return {
    configured: true,
    places: (result.suggestions ?? [])
      .map((suggestion) => ({
        placeId: suggestion.placePrediction?.placeId ?? "",
        text: suggestion.placePrediction?.text?.text ?? ""
      }))
      .filter((suggestion) => suggestion.placeId && suggestion.text)
      .slice(0, 6)
  };
}

function googleWaypoint(input: { placeId?: string | null; address: string }) {
  if (input.placeId) {
    return { placeId: input.placeId };
  }

  return { address: input.address };
}

async function googleRouteEstimate(
  input: ResolvedGoogleRouteEstimateInput
): Promise<
  Omit<
    GoogleRouteEstimate,
    "isReturnTrip" | "returnDistanceKm" | "returnDurationSeconds" | "totalDistanceKm"
  >
> {
  const key = googleMapsApiKey();

  if (!input.origin.trim() || !input.destination.trim()) {
    throw new Error("Origin and destination are required.");
  }

  if (!key) {
    const error = new Error("Google Maps API key is not configured.");
    (error as Error & { statusCode?: number }).statusCode = 501;
    throw error;
  }

  const response = await fetch("https://routes.googleapis.com/directions/v2:computeRoutes", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "routes.distanceMeters,routes.duration,routes.polyline.encodedPolyline"
    },
    body: JSON.stringify({
      origin: googleWaypoint({ placeId: input.originPlaceId, address: input.origin }),
      destination: googleWaypoint({
        placeId: input.destinationPlaceId,
        address: input.destination
      }),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      units: "METRIC"
    })
  });
  const result = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    routes?: Array<{
      distanceMeters?: number;
      duration?: string;
      polyline?: { encodedPolyline?: string };
    }>;
  };

  if (!response.ok) {
    const error = new Error(
      result.error?.message || `Google Routes rejected the request (${response.status}).`
    );
    (error as Error & { statusCode?: number }).statusCode =
      response.status === 401 || response.status === 403 ? 502 : response.status;
    throw error;
  }

  const route = result.routes?.[0];

  if (!route?.distanceMeters) {
    const error = new Error("Google Maps could not estimate this route.");
    (error as Error & { statusCode?: number }).statusCode = 404;
    throw error;
  }

  const durationSeconds = route.duration ? Number(String(route.duration).replace(/s$/, "")) : null;

  return {
    distanceKm: Math.round((route.distanceMeters / 1000) * 10) / 10,
    durationSeconds: Number.isFinite(durationSeconds) ? durationSeconds : null,
    routePolyline: route.polyline?.encodedPolyline || null,
    source: "google_maps_routes"
  };
}

async function googleReturnRouteEstimate(
  input: ResolvedGoogleRouteEstimateInput
): Promise<GoogleRouteEstimate> {
  const outbound = await googleRouteEstimate(input);

  if (!input.returnToOrigin) {
    return {
      ...outbound,
      isReturnTrip: false,
      returnDistanceKm: null,
      returnDurationSeconds: null,
      totalDistanceKm: outbound.distanceKm
    };
  }

  try {
    const inbound = await googleRouteEstimate({
      origin: input.destination,
      originPlaceId: input.destinationPlaceId,
      destination: input.origin,
      destinationPlaceId: input.originPlaceId,
      returnToOrigin: false
    });

    return {
      ...outbound,
      isReturnTrip: true,
      returnDistanceKm: inbound.distanceKm,
      returnDurationSeconds: inbound.durationSeconds,
      totalDistanceKm: Math.round((outbound.distanceKm + inbound.distanceKm) * 10) / 10,
      source: "google_maps_routes_return"
    };
  } catch {
    return {
      ...outbound,
      isReturnTrip: true,
      returnDistanceKm: outbound.distanceKm,
      returnDurationSeconds: outbound.durationSeconds,
      totalDistanceKm: Math.round(outbound.distanceKm * 2 * 10) / 10,
      source: "google_maps_routes_return_estimated"
    };
  }
}
