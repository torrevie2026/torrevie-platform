import { NextResponse, type NextRequest } from "next/server";
import {
  assertTexStagingDemoAccessAllowed,
  ensureTexStagingDemoAccess
} from "../../../../lib/server/tex-staging-demo-access";

export async function GET(request: NextRequest) {
  try {
    assertTexStagingDemoAccessAllowed(request.nextUrl.hostname);
    const result = await ensureTexStagingDemoAccess();
    return NextResponse.json(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unable to create demo access.";
    console.error("TEX staging demo access setup failed.", { message });

    return NextResponse.json(
      { error: message },
      { status: 500 }
    );
  }
}
