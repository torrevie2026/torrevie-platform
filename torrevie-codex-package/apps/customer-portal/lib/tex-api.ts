import type { TenantQueryClient } from "@torrevie/tenant-context";
import {
  createTexExpense,
  listTexBootstrap,
  recordTexWebhookSubmission,
  updateTexExpenseStatus,
  type TexActorContext,
  type TexExpenseInput,
  type TexExpenseStatus,
  type TexWebhookSubmissionInput
} from "./tex";

export type TexApiRequest = {
  method: string;
  path: string;
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

  if (path === "/expenses" && method === "POST") {
    return json(201, { expense: await createTexExpense(client, actor, request.body as TexExpenseInput) });
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
