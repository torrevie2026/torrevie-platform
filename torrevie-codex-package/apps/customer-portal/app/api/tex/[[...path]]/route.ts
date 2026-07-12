import { NextResponse, type NextRequest } from "next/server";
import { handleTexApiRequest } from "../../../../lib/tex-api";
import { resolveTexActorContext } from "../../../../lib/tex";
import {
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../../lib/server/tenant-query-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    path?: string[];
  }>;
};

export async function GET(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function POST(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

export async function PATCH(request: NextRequest, context: RouteContext) {
  return handle(request, context);
}

async function handle(request: NextRequest, context: RouteContext) {
  try {
    const session = await requireVerifiedCustomerSession();
    const client = new PostgresTenantQueryClient(session.userId);
    const tenantContext = await resolveCustomerTenantContext(client, session);
    const actor = await resolveTexActorContext(client, tenantContext);
    const path = await pathFromContext(context);
    const response = await handleTexApiRequest(client, actor, {
      method: request.method,
      path,
      query: Object.fromEntries(request.nextUrl.searchParams.entries()),
      body: await readBody(request)
    });

    return json(response.status, response.body);
  } catch (error) {
    return json(statusForError(error), { error: messageForError(error) });
  }
}

async function pathFromContext(context: RouteContext) {
  const params = await context.params;
  return `/${params.path?.join("/") ?? ""}`;
}

async function readBody(request: NextRequest) {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const text = await request.text();
  return text ? JSON.parse(text) : undefined;
}

function json(status: number, body: unknown) {
  return NextResponse.json(body, { status });
}

function statusForError(error: unknown) {
  if (isCustomerSessionError(error)) {
    return 401;
  }

  const message = messageForError(error);

  if (message.includes("Permission denied") || message.includes("TEX access requires")) {
    return 403;
  }

  if (message.includes("active tenant membership") || message.includes("deactivated")) {
    return 403;
  }

  if (message.includes("Invalid") || message.includes("Unsupported") || message.includes("must be")) {
    return 400;
  }

  return 500;
}

function messageForError(error: unknown) {
  return error instanceof Error ? error.message : "Unexpected TEX API error.";
}
