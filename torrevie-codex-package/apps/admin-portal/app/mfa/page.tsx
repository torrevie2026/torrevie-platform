import { redirect } from "next/navigation";
import { getPlatformSession } from "../../lib/session";
import { MfaChallenge } from "./MfaChallenge";

export const dynamic = "force-dynamic";

export default async function MfaPage() {
  const session = await getPlatformSession();

  if (!session) {
    redirect("/login");
  }

  if (!session.mfaRequired) {
    redirect("/");
  }

  return (
    <main className="login-shell">
      <MfaChallenge />
    </main>
  );
}
