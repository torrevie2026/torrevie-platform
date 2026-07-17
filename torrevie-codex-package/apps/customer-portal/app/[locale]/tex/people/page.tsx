import { hasPermission } from "@torrevie/permissions";
import { redirect } from "next/navigation";
import { listTexBootstrap } from "../../../../lib/tex";
import { TexPeopleClient } from "../TexPeopleClient";
import { isTexSessionError, requireTexRequestContext } from "../tex-request-context";

export const runtime = "nodejs";

export default async function TexPeoplePage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  try {
    const { actor, client } = await requireTexRequestContext();
    const bootstrap = await listTexBootstrap(client, actor);
    const canManagePeople = hasPermission({
      entitledProducts: actor.entitledProducts,
      integrationPermissions: actor.integrationPermissions,
      moduleAdminProducts: actor.moduleAdminProducts,
      permission: "tex.people.manage",
      roles: actor.roles
    }).allowed;

    return (
      <>
        <TexSectionHeader
          title="People"
          subtitle="Manage TEX employee profiles, manager assignment, and operating teams."
        />
        <TexPeopleClient
          adminUsersHref={`/${locale}/admin/users`}
          canManage={canManagePeople}
          initialEmployees={bootstrap.employeeProfiles}
          initialManagerUsers={bootstrap.managerUsers}
          initialTeams={bootstrap.teams}
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
