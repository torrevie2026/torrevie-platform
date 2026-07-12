import { NextResponse } from "next/server";
import { getSupabaseAdminClient } from "../../../../lib/admin-client";
import { buildTenantExport, tenantExportFilename } from "../../../../lib/tenant-data-management";
import { getPlatformSession } from "../../../../lib/session";

export const runtime = "nodejs";

type RouteContext = {
  params: Promise<{
    tenantId: string;
  }>;
};

export async function GET(_request: Request, context: RouteContext) {
  const session = await getPlatformSession();

  if (!session) {
    return NextResponse.json({ error: "Authentication is required." }, { status: 401 });
  }

  try {
    const { tenantId } = await context.params;
    const tenantExport = await buildTenantExport(getSupabaseAdminClient(), tenantId, session.userId);
    const filename = tenantExportFilename(tenantExport.tenant);

    return new NextResponse(JSON.stringify(tenantExport, null, 2), {
      headers: {
        "content-disposition": `attachment; filename="${filename}"`,
        "content-type": "application/json; charset=utf-8"
      }
    });
  } catch (error) {
    return NextResponse.json({ error: error instanceof Error ? error.message : "Unable to export tenant data." }, { status: 400 });
  }
}
