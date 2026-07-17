import { isLocale, type Locale } from "@torrevie/localization";
import { notFound, redirect } from "next/navigation";
import type { ReactNode } from "react";
import { TexShellNav } from "./TexShellNav";
import { isTexSessionError, requireTexRequestContext } from "./tex-request-context";

export const runtime = "nodejs";

export default async function TexLayout({
  children,
  params
}: {
  children: ReactNode;
  params: Promise<{ locale: string }>;
}) {
  const { locale: rawLocale } = await params;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale = rawLocale as Locale;

  try {
    const { actor, session } = await requireTexRequestContext();

    return (
      <main className="customer-shell tex-shell" data-visual-check="tex-platform">
        <TexShellNav
          email={session.email}
          locale={locale}
          planKey={actor.texPlan.planKey}
          roles={actor.roles}
          tenantId={actor.tenantId}
        />
        <section className="customer-main tex-main">{children}</section>
      </main>
    );
  } catch (error) {
    if (isTexSessionError(error)) {
      redirect("/login");
    }

    throw error;
  }
}
