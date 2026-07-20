import { redirect } from "next/navigation";
import { listTexReportWorkspace } from "../../../../lib/tex";
import { TexReportsClient } from "../TexReportsClient";
import { isTexSessionError, requireTexRequestContext } from "../tex-request-context";

export const runtime = "nodejs";

export default async function TexReportsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  try {
    const { actor, client } = await requireTexRequestContext(locale === "ar" ? "ar" : "en", "/tex/reports");
    const reportWorkspace = await listTexReportWorkspace(client, actor).catch(() => null);

    return (
      <>
        <TexSectionHeader
          title="Reports"
          subtitle="Analyze spend, export ledgers, and send TEX finance reports."
        />
        <TexReportsClient initialReport={reportWorkspace} />
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
