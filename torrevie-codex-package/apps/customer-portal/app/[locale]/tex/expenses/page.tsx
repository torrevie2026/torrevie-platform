import { redirect } from "next/navigation";
import { hasPermission } from "@torrevie/permissions";
import { listTexBootstrap, listTexExpenses, listTexTrips } from "../../../../lib/tex";
import { TexExpensesClient } from "../TexExpensesClient";
import { isTexSessionError, requireTexRequestContext } from "../tex-request-context";

export const runtime = "nodejs";

export default async function TexExpensesPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  try {
    const { actor, client } = await requireTexRequestContext(locale === "ar" ? "ar" : "en", "/tex/expenses");
    const bootstrap = await listTexBootstrap(client, actor);
    const expenses = await listTexExpenses(client, actor);
    const trips = await listTexTrips(client, actor);
    const canApproveExpenses = hasPermission({
      entitledProducts: actor.entitledProducts,
      integrationPermissions: actor.integrationPermissions,
      moduleAdminProducts: actor.moduleAdminProducts,
      permission: "tex.expense.approve",
      roles: actor.roles
    }).allowed;
    const canMarkExpensesPaid = hasPermission({
      entitledProducts: actor.entitledProducts,
      integrationPermissions: actor.integrationPermissions,
      moduleAdminProducts: actor.moduleAdminProducts,
      permission: "tex.finance.review",
      roles: actor.roles
    }).allowed || canApproveExpenses;
    const isOwnExpenseView =
      actor.roles.includes("customer_standard_user") &&
      actor.roles.every((role) => role === "customer_standard_user");

    return (
      <>
        <TexSectionHeader
          title={isOwnExpenseView ? "My expenses" : "Expenses"}
          subtitle={
            isOwnExpenseView
              ? "Submit and track your own receipt-backed expense claims."
              : "Submit, review, approve, reject, and inspect receipt-backed expense claims."
          }
        />
        <TexExpensesClient
          canApprove={canApproveExpenses}
          canMarkPaid={canMarkExpensesPaid}
          categories={bootstrap.categories}
          employees={bootstrap.employeeProfiles}
          initialExpenses={expenses}
          ownExpenseView={isOwnExpenseView}
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
