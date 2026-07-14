import { redirect } from "next/navigation";
import { listTexBootstrap, listTexTrips } from "../../../../lib/tex";
import { TexTripsClient } from "../TexTripsClient";
import { isTexSessionError, requireTexRequestContext } from "../tex-request-context";

export const runtime = "nodejs";

export default async function TexTripsPage() {
  try {
    const { actor, client } = await requireTexRequestContext();
    const bootstrap = await listTexBootstrap(client, actor);
    const trips = await listTexTrips(client, actor);

    return (
      <>
        <TexSectionHeader
          title="Trips"
          subtitle="Plan trip budgets, legs, driver payouts, and logistics expense allocation."
        />
        <TexTripsClient
          employees={bootstrap.employeeProfiles}
          initialTrips={trips}
          teams={bootstrap.teams}
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
