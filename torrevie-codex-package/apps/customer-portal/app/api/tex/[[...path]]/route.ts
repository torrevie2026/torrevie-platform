import { NextResponse } from "next/server";

export const runtime = "nodejs";

const disabledResponse = {
  error: "TEX is currently disabled in the Torrevie customer portal."
};

export function GET() {
  return NextResponse.json(disabledResponse, { status: 404 });
}

export function POST() {
  return NextResponse.json(disabledResponse, { status: 404 });
}

export function PATCH() {
  return NextResponse.json(disabledResponse, { status: 404 });
}

export function DELETE() {
  return NextResponse.json(disabledResponse, { status: 404 });
}
