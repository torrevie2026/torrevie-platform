import { NextResponse, type NextRequest } from "next/server";
import { acceptSupportAccessToken } from "../../../lib/server/support-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(request: NextRequest) {
  const token = request.nextUrl.searchParams.get("token")?.trim();

  if (!token) {
    return supportAccessError("Support access token is missing.");
  }

  try {
    await acceptSupportAccessToken(token);
  } catch {
    return supportAccessError("This support access link is invalid or expired. Create a fresh launch from the Admin Portal.");
  }

  return NextResponse.redirect(new URL("/en", request.url));
}

function supportAccessError(message: string) {
  return new NextResponse(
    `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Torrevie Support</title>
    <style>
      body { margin: 0; min-height: 100vh; display: grid; place-items: center; background: #f3f5f8; color: #101c3f; font-family: Arial, sans-serif; }
      section { width: min(420px, calc(100vw - 32px)); border: 1px solid #dfe5ee; border-radius: 8px; background: #fff; padding: 28px; box-sizing: border-box; }
      p:first-child { margin: 0 0 16px; color: #4d70aa; font-size: 12px; font-weight: 700; text-transform: uppercase; }
      h1 { margin: 0 0 16px; font-size: 28px; line-height: 1.15; }
      p:last-child { margin: 0; line-height: 1.45; }
    </style>
  </head>
  <body>
    <main>
      <section>
        <p>Torrevie Support</p>
        <h1>Support access unavailable</h1>
        <p>${escapeHtml(message)}</p>
      </section>
    </main>
  </body>
</html>`,
    {
      status: 400,
      headers: {
        "content-type": "text/html; charset=utf-8"
      }
    }
  );
}

function escapeHtml(value: string) {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
