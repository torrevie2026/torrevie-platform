import { redirect } from "next/navigation";
import { listTexBootstrap, listTexExpenses, listTexTrips } from "../../../../lib/tex";
import { TexExpensesClient } from "../TexExpensesClient";
import { isTexSessionError, requireTexRequestContext } from "../tex-request-context";

export const runtime = "nodejs";

export default async function TexExpensesPage() {
  try {
    const { actor, client } = await requireTexRequestContext();
    const [bootstrap, expenses, trips] = await Promise.all([
      listTexBootstrap(client, actor),
      listTexExpenses(client, actor),
      listTexTrips(client, actor)
    ]);

    return (
      <>
        <TexSectionHeader
          title="Expenses"
          subtitle="Submit, review, approve, reject, and inspect receipt-backed expense claims."
        />
        <TexExpensesClient
          categories={bootstrap.categories}
          employees={bootstrap.employeeProfiles}
          initialExpenses={expenses}
          trips={trips}
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
