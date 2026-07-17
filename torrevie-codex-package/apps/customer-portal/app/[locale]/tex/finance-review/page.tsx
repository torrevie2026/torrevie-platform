import { redirect } from "next/navigation";
import { listTexFinanceReview } from "../../../../lib/tex";
import { TexFinanceClient } from "../TexFinanceClient";
import { isTexSessionError, requireTexRequestContext } from "../tex-request-context";

export const runtime = "nodejs";

export default async function TexFinanceReviewPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  try {
    const { actor, client } = await requireTexRequestContext();
    if (!actor.texPlan.growthFeaturesEnabled) {
      redirect(`/${locale}/tex?upgrade=growth`);
    }

    const now = new Date();
    const financeReview = await listTexFinanceReview(
      client,
      actor,
      now.getUTCMonth() + 1,
      now.getUTCFullYear()
    );

    return (
      <>
        <TexSectionHeader
          title="Finance review"
          subtitle="Settle approved expenses, driver payouts, and period payment queues."
        />
        <TexFinanceClient initialReview={financeReview} />
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
