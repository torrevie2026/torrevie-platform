import { isLocale, type Locale } from "@torrevie/localization";
import Link from "next/link";
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
    const { actor, session } = await requireTexRequestContext(locale, "/tex");

    return (
      <main className="customer-shell tex-shell" data-visual-check="tex-platform">
        <TexShellNav
          email={session.email}
          locale={locale}
          planKey={actor.texPlan.planKey}
          roles={actor.roles}
          tenantName={actor.tenantName ?? actor.tenantId}
        />
        <section className="customer-main tex-main">
          <TexTrialBanner
            locale={locale}
            planKey={actor.texPlan.planKey}
            planStatus={actor.texPlan.planStatus}
            trialEndDate={actor.texPlan.trialEndDate}
          />
          {children}
        </section>
      </main>
    );
  } catch (error) {
    if (isTexSessionError(error)) {
      redirect("/login");
    }

    throw error;
  }
}

function TexTrialBanner({
  locale,
  planKey,
  planStatus,
  trialEndDate
}: {
  locale: Locale;
  planKey: string;
  planStatus: string;
  trialEndDate: string | null;
}) {
  if (planKey !== "trial" && planStatus !== "trialing") {
    return null;
  }

  const trialEnd = parseTrialEndDate(trialEndDate);
  const daysRemaining = trialEnd
    ? Math.ceil((trialEnd.getTime() - Date.now()) / (1000 * 60 * 60 * 24))
    : null;
  const dateLabel = trialEnd
    ? formatTrialDate(trialEnd)
    : "the trial end date";
  const trialCopy =
    daysRemaining === null
      ? `You are currently on the TEX trial until ${dateLabel}.`
      : daysRemaining > 0
        ? `Your TEX trial runs until ${dateLabel} (${daysRemaining} day${daysRemaining === 1 ? "" : "s"} remaining).`
        : `Your TEX trial ended on ${dateLabel}.`;

  return (
    <aside className="tex-trial-status-banner" aria-label="TEX trial status">
      <div>
        <strong>Trial version</strong>
        <span>{trialCopy}</span>
      </div>
      <Link href={`/${locale}/tex/settings#tex-billing`} className="tex-trial-upgrade-link">
        Upgrade to paid
      </Link>
    </aside>
  );
}

function parseTrialEndDate(value: string | null) {
  if (!value) {
    return null;
  }
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

function formatTrialDate(date: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}
