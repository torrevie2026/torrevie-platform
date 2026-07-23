import { NextResponse } from "next/server";
import { processTexStripeWebhookEvent, verifyStripeWebhookPayload } from "../../../../../../lib/tex";

export const runtime = "nodejs";

export async function POST(request: Request) {
  const payload = await request.text();

  try {
    const event = verifyStripeWebhookPayload(payload, request.headers.get("stripe-signature"));
    const result = await processTexStripeWebhookEvent(event);
    return NextResponse.json(result);
  } catch (error) {
    return NextResponse.json(
      { error: error instanceof Error ? error.message : "Stripe webhook failed." },
      { status: 400 }
    );
  }
}
