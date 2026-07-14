import { redirect } from "next/navigation";
import { listTexIntegrationWorkspace } from "../../../../lib/tex";
import { TexIntegrationsClient } from "../TexIntegrationsClient";
import { isTexSessionError, requireTexRequestContext } from "../tex-request-context";

export const runtime = "nodejs";

export default async function TexIntegrationsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  try {
    const { actor, client } = await requireTexRequestContext();
    const integrationWorkspace = await listTexIntegrationWorkspace(client, actor).catch(() => null);

    return (
      <>
        <TexSectionHeader
          title="Integrations"
          subtitle="Configure provider profiles, receipt storage behavior, and WhatsApp ingestion."
        />
        <TexIntegrationsClient
          adminIntegrationsHref={`/${locale}/admin/users#tex-whatsapp-settings`}
          initialWorkspace={integrationWorkspace}
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
