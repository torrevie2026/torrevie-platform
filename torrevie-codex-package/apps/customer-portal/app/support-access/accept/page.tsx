import { redirect } from "next/navigation";
import { acceptSupportAccessToken } from "../../../lib/server/support-access";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export default async function AcceptSupportAccessPage({
  searchParams
}: {
  searchParams: Promise<{ token?: string }>;
}) {
  const token = (await searchParams).token?.trim();

  if (!token) {
    return <SupportAccessError message="Support access token is missing." />;
  }

  try {
    await acceptSupportAccessToken(token);
  } catch {
    return <SupportAccessError message="This support access link is invalid or expired. Create a fresh launch from the Admin Portal." />;
  }

  redirect("/en");
}

function SupportAccessError({ message }: { message: string }) {
  return (
    <main className="support-access-state">
      <section>
        <p className="eyebrow">Torrevie Support</p>
        <h1>Support access unavailable</h1>
        <p>{message}</p>
      </section>
    </main>
  );
}
