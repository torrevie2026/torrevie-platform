import { NextResponse } from "next/server";
import { runTexFxRefreshCron } from "../../../../../lib/tex-cron";
import { PostgresTenantQueryClient } from "../../../../../lib/server/tenant-query-client";

export const runtime = "nodejs";

const TEX_CRON_ACTOR_USER_ID = "00000000-0000-4000-8000-000000000000";

export async function GET(request: Request) {
  const authHeader = request.headers.get("authorization");
  const cronSecret = process.env.CRON_SECRET;

  if (!cronSecret || authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: "Unauthorized." }, { status: 401 });
  }

  try {
    const client = new PostgresTenantQueryClient(TEX_CRON_ACTOR_USER_ID);
    const result = await runTexFxRefreshCron(client);
    return NextResponse.json(result, { status: result.failed ? 207 : 200 });
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "TEX FX cron failed." },
      { status: 500 }
    );
  }
}
