import { NextResponse } from "next/server";
import { handleTexApiRequest } from "../../../../../lib/tex-api";
import { resolveTexActorContext } from "../../../../../lib/tex";
import {
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../../../lib/server/tenant-query-client";

export const runtime = "nodejs";

export async function POST(request: Request) {
  try {
    const session = await requireVerifiedCustomerSession();
    const client = new PostgresTenantQueryClient(session.userId);
    const tenantContext = await resolveCustomerTenantContext(client, session);
    const actor = await resolveTexActorContext(client, tenantContext);
    const response = await handleTexApiRequest(client, actor, {
      method: request.method,
      path: "/receipts/parse",
      query: {},
      body: await readRequestBody(request)
    });

    return NextResponse.json(response.body, { status: response.status });
  } catch (error) {
    if (isCustomerSessionError(error)) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const status = error instanceof Error && "statusCode" in error ? Number(error.statusCode) : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TEX receipt OCR failed." },
      { status: Number.isInteger(status) && status >= 400 && status < 600 ? status : 400 }
    );
  }
}

async function readRequestBody(request: Request) {
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
