import { redirect } from "next/navigation";
import { listTexSettingsWorkspace } from "../../../../lib/tex";
import { TexSettingsClient } from "../TexSettingsClient";
import { isTexSessionError, requireTexRequestContext } from "../tex-request-context";

export const runtime = "nodejs";

export default async function TexSettingsPage({
  params
}: {
  params: Promise<{ locale: string }>;
}) {
  const { locale } = await params;

  try {
    const { actor, client } = await requireTexRequestContext(locale === "ar" ? "ar" : "en", "/tex/settings");
    const now = new Date();
    const settingsWorkspace = await listTexSettingsWorkspace(
      client,
      actor,
      now.getUTCMonth() + 1,
      now.getUTCFullYear()
    ).catch(() => null);
    const canManagePolicies = actor.roles.some((role) =>
      ["customer_admin", "customer_module_admin", "torrevie_platform_admin"].includes(role)
    );

    return (
      <>
        <TexSectionHeader
          title="Settings"
          subtitle="Maintain expense categories, spend policies, budgets, and finance controls."
        />
        <TexSettingsClient canManage={canManagePolicies} initialSettings={settingsWorkspace} />
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
