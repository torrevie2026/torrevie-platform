import { NextResponse, type NextRequest } from "next/server";
import { buildRequestContext, logRequestEnd, logRequestStart } from "@torrevie/observability";

export async function proxy(request: NextRequest) {
  const startedAt = Date.now();
  const context = buildRequestContext({
    app: "customer-portal",
    headers: request.headers,
    method: request.method,
    path: request.nextUrl.pathname
  });

  await logRequestStart(context);

  const response = NextResponse.next();
  response.headers.set("x-correlation-id", context.correlationId);

  await logRequestEnd(context, {
    durationMs: Date.now() - startedAt,
    statusCode: response.status
  });

  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|.*\\..*).*)"]
};
