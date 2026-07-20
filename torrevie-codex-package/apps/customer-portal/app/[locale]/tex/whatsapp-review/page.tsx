import { redirect } from "next/navigation";
import {
  listTexBootstrap,
  listTexUnregisteredWhatsappSubmissions
} from "../../../../lib/tex";
import { TexWhatsappReviewClient } from "../TexWhatsappReviewClient";
import { isTexSessionError, requireTexRequestContext } from "../tex-request-context";

export const runtime = "nodejs";

export default async function TexWhatsappReviewPage() {
  try {
    const { actor, client } = await requireTexRequestContext();
    const bootstrap = await listTexBootstrap(client, actor);
    const whatsappSubmissions = await listTexUnregisteredWhatsappSubmissions(client, actor, "open").catch(() => []);

    return (
      <>
        <TexSectionHeader
          title="WhatsApp review"
          subtitle="Resolve receipt submissions from unknown senders and link them to TEX people."
        />
        <TexWhatsappReviewClient
          employees={bootstrap.employeeProfiles}
          initialSubmissions={whatsappSubmissions}
        />
      </>
    );
  } catch (error) {
    if (isTexSessionError(error)) {
      redirect("/login");
    }

    throw error;
  }
}

function TexSectionHeader({ subtitle, title }: { subtitle: string; title: string }) {
  return (
    <header className="customer-topbar tex-topbar">
      <div>
        <p className="eyebrow">TEX module</p>
        <h1>{title}</h1>
        <p>{subtitle}</p>
      </div>
    </header>
  );
}
