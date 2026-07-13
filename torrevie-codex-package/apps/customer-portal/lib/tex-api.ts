import type { TenantQueryClient } from "@torrevie/tenant-context";
import {
  closeTexTrip,
  createTexExpense,
  createTexTrip,
  deleteTexTripLeg,
  listTexBootstrap,
  listTexExpenses,
  listTexFinanceReview,
  listTexTripLegs,
  listTexTrips,
  payTexFinanceItems,
  processTexWhatsappSubmission,
  recordTexWebhookSubmission,
  replaceTexTripLegs,
  updateTexTrip,
  updateTexExpenseStatus,
  type TexActorContext,
  type TexExpenseInput,
  type TexExpenseStatus,
  type TexFinancePaymentInput,
  type TexTripLegInput,
  type TexTripInput,
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

export async function handleTexApiRequest(
  client: TenantQueryClient,
  actor: TexActorContext,
  request: TexApiRequest
): Promise<TexApiResponse> {
  const path = normalizePath(request.path);
  const method = request.method.toUpperCase();

  if (path === "/admin" || path.startsWith("/admin/")) {
    return json(410, {
      error: "TEX administration has moved to admin.torrevie.com. Customer TEX work remains under app.torrevie.com/tex."
    });
  }

  if (path === "/bootstrap" && method === "GET") {
    return json(200, await listTexBootstrap(client, actor));
  }

  if (path === "/expenses" && method === "GET") {
    return json(200, { expenses: await listTexExpenses(client, actor) });
  }

  if (path === "/expenses" && method === "POST") {
    return json(201, { expense: await createTexExpense(client, actor, request.body as TexExpenseInput) });
  }

  if (path === "/trips" && method === "GET") {
    return json(200, { trips: await listTexTrips(client, actor) });
  }

  if (path === "/trips" && method === "POST") {
    return json(201, { trip: await createTexTrip(client, actor, request.body as TexTripInput) });
  }

  if (path === "/places" && method === "GET") {
    return json(200, { places: await googlePlaceSuggestions(request.query?.input ?? "") });
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
    return json(200, await listTexFinanceReview(client, actor, readInteger(query.month), readInteger(query.year)));
  }

  if (path === "/finance-review/pay" && method === "POST") {
    return json(200, await payTexFinanceItems(client, actor, request.body as TexFinancePaymentInput));
  }

  const tripMatch = path.match(/^\/trips\/([0-9a-f-]+)$/i);
  if (tripMatch && method === "PATCH") {
    return json(200, { trip: await updateTexTrip(client, actor, tripMatch[1] ?? "", request.body as TexTripInput) });
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
      submission: await recordTexWebhookSubmission(client, actor, request.body as TexWebhookSubmissionInput)
    });
  }

  if (path === "/webhook-submissions/process" && method === "POST") {
    return json(201, await processTexWhatsappSubmission(client, actor, request.body as TexWebhookSubmissionInput));
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
  return value && typeof value === "object" && !Array.isArray(value) ? (value as Record<string, unknown>) : {};
}

function readGoogleEstimateInput(value: unknown): ResolvedGoogleRouteEstimateInput {
  const body = readRecord(value);

  return {
    origin: readOptionalString(body.origin) ?? "",
    originPlaceId: readOptionalString(body.originPlaceId) ?? readOptionalString(body.origin_place_id),
    destination: readOptionalString(body.destination) ?? "",
    destinationPlaceId: readOptionalString(body.destinationPlaceId) ?? readOptionalString(body.destination_place_id),
    returnToOrigin: body.returnToOrigin === true || body.return_to_origin === true
  };
}

function readExpenseStatus(value: unknown): Exclude<TexExpenseStatus, "pending"> {
  if (value === "approved" || value === "rejected" || value === "paid") {
    return value;
  }

  throw new Error(`Unsupported TEX expense status: ${String(value)}`);
}

function readOptionalString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

function readInteger(value: unknown) {
  const parsed = Number(value);

  if (!Number.isInteger(parsed)) {
    throw new Error(`Invalid integer: ${String(value)}`);
  }

  return parsed;
}

function googleMapsApiKey() {
  return (
    process.env.GOOGLE_MAPS_API_KEY ||
    process.env.GOOGLE_MAPS_PLATFORM_KEY ||
    process.env.GOOGLE_API_KEY ||
    process.env.GOOGLE_AI_KEY ||
    ""
  );
}

async function googlePlaceSuggestions(input: string): Promise<GooglePlaceSuggestion[]> {
  const key = googleMapsApiKey();
  const trimmed = input.trim();

  if (trimmed.length < 3) {
    return [];
  }

  if (!key) {
    const error = new Error("Google Maps API key is not configured.");
    (error as Error & { statusCode?: number }).statusCode = 501;
    throw error;
  }

  const response = await fetch("https://places.googleapis.com/v1/places:autocomplete", {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      "X-Goog-Api-Key": key,
      "X-Goog-FieldMask": "suggestions.placePrediction.placeId,suggestions.placePrediction.text.text"
    },
    body: JSON.stringify({ input: trimmed })
  });
  const result = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    suggestions?: Array<{ placePrediction?: { placeId?: string; text?: { text?: string } } }>;
  };

  if (!response.ok) {
    const error = new Error(result.error?.message || `Google Places rejected the request (${response.status}).`);
    (error as Error & { statusCode?: number }).statusCode = response.status === 401 || response.status === 403 ? 502 : response.status;
    throw error;
  }

  return (result.suggestions ?? [])
    .map((suggestion) => ({
      placeId: suggestion.placePrediction?.placeId ?? "",
      text: suggestion.placePrediction?.text?.text ?? ""
    }))
    .filter((suggestion) => suggestion.placeId && suggestion.text)
    .slice(0, 6);
}

function googleWaypoint(input: { placeId?: string | null; address: string }) {
  if (input.placeId) {
    return { placeId: input.placeId };
  }

  return { address: input.address };
}

async function googleRouteEstimate(input: ResolvedGoogleRouteEstimateInput): Promise<Omit<GoogleRouteEstimate, "isReturnTrip" | "returnDistanceKm" | "returnDurationSeconds" | "totalDistanceKm">> {
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
      destination: googleWaypoint({ placeId: input.destinationPlaceId, address: input.destination }),
      travelMode: "DRIVE",
      routingPreference: "TRAFFIC_UNAWARE",
      units: "METRIC"
    })
  });
  const result = (await response.json().catch(() => ({}))) as {
    error?: { message?: string };
    routes?: Array<{ distanceMeters?: number; duration?: string; polyline?: { encodedPolyline?: string } }>;
  };

  if (!response.ok) {
    const error = new Error(result.error?.message || `Google Routes rejected the request (${response.status}).`);
    (error as Error & { statusCode?: number }).statusCode = response.status === 401 || response.status === 403 ? 502 : response.status;
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

async function googleReturnRouteEstimate(input: ResolvedGoogleRouteEstimateInput): Promise<GoogleRouteEstimate> {
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
