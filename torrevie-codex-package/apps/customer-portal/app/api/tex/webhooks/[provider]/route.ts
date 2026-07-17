import { NextResponse } from "next/server";
import { handleTexWebhookRequest } from "../../../../../lib/tex-webhooks";
import { PostgresTenantQueryClient } from "../../../../../lib/server/tenant-query-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    provider: string;
  }>;
};

export async function GET(request: Request, context: RouteContext) {
  return dispatchTexWebhook(request, context);
}

export async function POST(request: Request, context: RouteContext) {
  return dispatchTexWebhook(request, context);
}

export async function OPTIONS(request: Request, context: RouteContext) {
  return dispatchTexWebhook(request, context);
}

async function dispatchTexWebhook(request: Request, context: RouteContext) {
  const { provider } = await context.params;
  const client = new PostgresTenantQueryClient("00000000-0000-4000-8000-000000000000");

  try {
    const response = await handleTexWebhookRequest(client, {
      provider,
      method: request.method,
      url: request.url,
      headers: request.headers,
      bodyText: await readWebhookBody(request)
    });

    if (typeof response.body === "string") {
      return new NextResponse(response.body, {
        status: response.status,
        headers: { "content-type": "text/plain; charset=utf-8" }
      });
    }

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    const status = error instanceof Error && "statusCode" in error ? Number(error.statusCode) : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TEX webhook failed." },
      { status: Number.isInteger(status) && status >= 200 && status < 600 ? status : 400 }
    );
  }
}

async function readWebhookBody(request: Request) {
  if (request.method === "GET" || request.method === "HEAD" || request.method === "OPTIONS") {
    return "";
  }

  return request.text();
}
