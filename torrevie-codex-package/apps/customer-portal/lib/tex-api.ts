import type { TenantQueryClient } from "@torrevie/tenant-context";
import {
  closeTexTrip,
  createTexExpense,
  createTexTrip,
  listTexBootstrap,
  listTexExpenses,
  listTexFinanceReview,
  listTexTrips,
  payTexFinanceItems,
  recordTexWebhookSubmission,
  updateTexTrip,
  updateTexExpenseStatus,
  type TexActorContext,
  type TexExpenseInput,
  type TexExpenseStatus,
  type TexFinancePaymentInput,
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
