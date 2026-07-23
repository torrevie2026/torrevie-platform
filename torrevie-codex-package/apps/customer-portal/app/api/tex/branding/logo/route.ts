import { NextResponse } from "next/server";
import { getTexTenantLogoDownload, resolveTexActorContext } from "../../../../../lib/tex";
import {
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../../../lib/server/tenant-query-client";

export const runtime = "nodejs";

export async function GET() {
  try {
    const session = await requireVerifiedCustomerSession();
    const client = new PostgresTenantQueryClient(session.userId);
    const tenantContext = await resolveCustomerTenantContext(client, session);
    const actor = await resolveTexActorContext(client, tenantContext);
    const logo = await getTexTenantLogoDownload(client, actor);

    if (!logo) {
      return NextResponse.json({ error: "No tenant logo has been uploaded." }, { status: 404 });
    }

    return new Response(logo.buffer, {
      headers: {
        "Cache-Control": "private, max-age=300, stale-while-revalidate=86400",
        "Content-Type": logo.contentType
      }
    });
  } catch (error) {
    if (isCustomerSessionError(error)) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Unable to load tenant logo." },
      { status: 400 }
    );
  }
}
