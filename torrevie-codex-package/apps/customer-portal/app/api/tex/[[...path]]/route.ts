import { NextResponse } from "next/server";
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

export async function GET(request: Request, context: RouteContext) {
  return dispatchTexRequest(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return dispatchTexRequest(request, context);
}

export async function PUT(request: Request, context: RouteContext) {
  return dispatchTexRequest(request, context);
}

export async function PATCH(request: Request, context: RouteContext) {
  return dispatchTexRequest(request, context);
}

export async function DELETE(request: Request, context: RouteContext) {
  return dispatchTexRequest(request, context);
}

async function dispatchTexRequest(request: Request, context: RouteContext) {
  const startedAt = performance.now();
  const { path } = await context.params;
  const normalizedPath = `/${(path ?? []).join("/")}`;

  try {
    const session = await requireVerifiedCustomerSession();
    const client = new PostgresTenantQueryClient(session.userId);
    const tenantContext = await resolveCustomerTenantContext(client, session);
    const actor = await resolveTexActorContext(client, tenantContext);
    const url = new URL(request.url);
    const response = await handleTexApiRequest(client, actor, {
      method: request.method,
      path: normalizedPath,
      query: Object.fromEntries(url.searchParams.entries()),
      body: await readRequestBody(request)
    });
    logTexApiTiming({
      durationMs: performance.now() - startedAt,
      method: request.method,
      path: normalizedPath,
      status: response.status
    });

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    if (isCustomerSessionError(error)) {
      logTexApiTiming({
        durationMs: performance.now() - startedAt,
        method: request.method,
        path: normalizedPath,
        status: 401
      });
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const status = error instanceof Error && "statusCode" in error ? Number(error.statusCode) : 400;
    const resolvedStatus =
      Number.isInteger(status) && status >= 400 && status < 600 ? status : 400;
    logTexApiTiming({
      durationMs: performance.now() - startedAt,
      method: request.method,
      path: normalizedPath,
      status: resolvedStatus
    });

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TEX request failed." },
      { status: resolvedStatus }
    );
  }
}

function logTexApiTiming({
  durationMs,
  method,
  path,
  status
}: {
  durationMs: number;
  method: string;
  path: string;
  status: number;
}) {
  if (durationMs < 1200 && status < 500) {
    return;
  }

  console.info("tex_api_timing", {
    durationMs: Math.round(durationMs),
    method,
    path,
    status
  });
}

async function readRequestBody(request: Request) {
  if (request.method === "GET" || request.method === "HEAD") {
    return undefined;
  }

  const text = await request.text();

  if (!text.trim()) {
    return undefined;
  }

  try {
    return JSON.parse(text) as unknown;
  } catch {
    throw new Error("TEX API request body must be valid JSON.");
  }
}
