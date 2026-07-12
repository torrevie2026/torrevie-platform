import { createServerClient } from "@supabase/ssr";
import { getTenantClaimsFromJwt, requireSupabaseBrowserEnv } from "@torrevie/auth";
import { cookies } from "next/headers";
import { NextResponse, type NextRequest } from "next/server";
import { handleTexApiRequest } from "../../../../lib/tex-api";
import { resolveTexActorContext } from "../../../../lib/tex";
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
    const session = await requireSession();
    const claims = getTenantClaimsFromJwt(session.accessToken);

    if (!claims.tenant_id) {
      return json(403, { error: "A tenant claim is required for TEX API access." });
    }

    const client = new PostgresTenantQueryClient(session.userId);
    const actor = await resolveTexActorContext(client, {
      tenantId: claims.tenant_id,
      userId: session.userId,
      roleScope: claims.role_scope ?? "customer"
    });
    const path = await pathFromContext(context);
    const response = await handleTexApiRequest(client, actor, {
      method: request.method,
      path,
      body: await readBody(request)
    });

    return json(response.status, response.body);
  } catch (error) {
    return json(statusForError(error), { error: messageForError(error) });
  }
}

async function requireSession() {
  const cookieStore = await cookies();
  const { url, anonKey } = requireSupabaseBrowserEnv();
  const supabase = createServerClient(url, anonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll() {
        return;
      }
    }
  });
  const {
    data: { session }
  } = await supabase.auth.getSession();

  if (!session) {
    throw new UnauthorizedError("Authentication is required for TEX API access.");
  }

  const {
    data: { user },
    error
  } = await supabase.auth.getUser();

  if (error || !user || user.id !== session.user.id) {
    throw new UnauthorizedError("Unable to verify the TEX API session.");
  }

  return {
    accessToken: session.access_token,
    userId: user.id
  };
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
  if (error instanceof UnauthorizedError) {
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

class UnauthorizedError extends Error {}
