import { NextResponse } from "next/server";
import { getTexReceiptDownload, resolveTexActorContext } from "../../../../../lib/tex";
import {
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../../../lib/server/tenant-query-client";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    receiptId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  try {
    const session = await requireVerifiedCustomerSession();
    const client = new PostgresTenantQueryClient(session.userId);
    const tenantContext = await resolveCustomerTenantContext(client, session);
    const actor = await resolveTexActorContext(client, tenantContext);
    const { receiptId } = await context.params;
    const receipt = await getTexReceiptDownload(client, actor, receiptId);
    const filename = receipt.filename.replace(/["\r\n]/g, "_");

    return new NextResponse(receipt.buffer, {
      status: 200,
      headers: {
        "Cache-Control": "private, max-age=60",
        "Content-Disposition": `inline; filename="${filename}"`,
        "Content-Length": String(receipt.buffer.length),
        "Content-Type": receipt.contentType,
        "X-Content-Type-Options": "nosniff"
      }
    });
  } catch (error) {
    if (isCustomerSessionError(error)) {
      return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
    }

    const status = error instanceof Error && "statusCode" in error ? Number(error.statusCode) : 400;
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Receipt download failed." },
      { status: Number.isInteger(status) && status >= 400 && status < 600 ? status : 400 }
    );
  }
}
