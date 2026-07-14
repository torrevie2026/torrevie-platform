import { notFound } from "next/navigation";

export const runtime = "nodejs";

export default function DisabledTexPage() {
  notFound();
}
