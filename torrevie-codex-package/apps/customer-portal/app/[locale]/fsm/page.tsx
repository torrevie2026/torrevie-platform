import { dirForLocale, isLocale, type Locale } from "@torrevie/localization";
import { notFound, redirect } from "next/navigation";
import { businessSegments, fsmPlanTiers, segmentLabels, suggestedPlanForSegment } from "../../../config/fsmSegments";
import { term } from "../../../config/terminology";
import {
  getCustomerAccessRequirements,
  isCustomerSessionError,
  requireVerifiedCustomerSession,
  resolveCustomerTenantContext
} from "../../../lib/server/customer-session";
import { PostgresTenantQueryClient } from "../../../lib/server/tenant-query-client";
import { resolveFsmWorkspace, type FsmWorkspace } from "../../../lib/fsm";
import { CustomerSessionActions } from "../CustomerSessionActions";
import { saveFsmOnboardingAction } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FsmSection = string;

export default async function FsmPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ section?: string; saved?: string }>;
}) {
  const { locale: rawLocale } = await params;
  const resolvedSearchParams = await searchParams;

  if (!isLocale(rawLocale)) {
    notFound();
  }

  const locale = rawLocale as Locale;
  const section = readSection(resolvedSearchParams?.section);
  const otherLocale = locale === "en" ? "ar" : "en";

  try {
    const session = await requireVerifiedCustomerSession();
    const client = new PostgresTenantQueryClient(session.userId);
    const tenantContext = await resolveCustomerTenantContext(client, session);
    const requirements = await getCustomerAccessRequirements(client, tenantContext);

    if (requirements.requireProfileCompletion && !requirements.profileComplete) {
      redirect(`/${locale}/account?profile=required`);
    }

    if (requirements.requirePasswordChange) {
      redirect(`/${locale}/account?password=required`);
    }

    if (requirements.requireMfa && !requirements.mfaEnrolled) {
      redirect(`/${locale}/account?mfa=required`);
    }

    const workspace = await resolveFsmWorkspace(client, tenantContext, locale);

    return (
      <main className="customer-shell fsm-shell" data-visual-check="fsm-module-shell" lang={locale} dir={dirForLocale(locale)}>
        <aside className="customer-sidebar fsm-sidebar" aria-label="Torrevie FSM sections">
          <div className="fsm-sidebar-header">
            <a className="customer-brand fsm-brand" href={`/${locale}/fsm`} aria-label="Torrevie FSM">
              <img src="/logo/torrevie_logo_color.png" alt="" width="36" height="36" />
              <span>
                <strong>Torrevie FSM</strong>
                <small>{workspace.tenantName}</small>
              </span>
            </a>
          </div>
          <nav className="fsm-nav">
            {workspace.navItems.map((item) => (
              <a key={item.key} href={`/${locale}${item.href}`} aria-current={isActiveNav(item.href, section) ? "page" : undefined}>
                {item.termKey ? term(workspace.segment, locale, item.termKey) : item.label}
              </a>
            ))}
            <a href={`/${locale}/fsm?section=onboarding`} aria-current={section === "onboarding" ? "page" : undefined}>
              Onboarding
            </a>
          </nav>
          <CustomerSessionActions locale={locale} />
        </aside>

        <section className="customer-main fsm-main">
          <header className="customer-topbar fsm-topbar">
            <div>
              <p className="eyebrow">Torrevie FSM</p>
              <h1>{section === "onboarding" ? "Onboarding" : dashboardTitle(workspace)}</h1>
              <p>{workspace.segmentLabel}. {workspace.planTier} plan.</p>
            </div>
            <div className="customer-context" aria-label="Session context">
              <span>Segment: {workspace.segment}</span>
              <span>Features: {workspace.enabledFeatures.length}</span>
              <a href={`/${otherLocale}/fsm`} hrefLang={otherLocale}>
                Language: {otherLocale.toUpperCase()}
              </a>
            </div>
          </header>

          {resolvedSearchParams?.saved === "1" ? <p className="tex-notice">FSM onboarding settings saved.</p> : null}

          {section === "onboarding" ? (
            <FsmOnboarding workspace={workspace} locale={locale} />
          ) : (
            <FsmDashboard workspace={workspace} locale={locale} />
          )}
        </section>
      </main>
    );
  } catch (error) {
    if (isCustomerSessionError(error)) {
      redirect("/login");
    }

    throw error;
  }
}

function FsmDashboard({ workspace, locale }: { workspace: FsmWorkspace; locale: Locale }) {
  return (
    <>
      {!workspace.onboardingComplete ? (
        <section className="fsm-progress-band" aria-label="Getting started">
          <div>
            <span>Getting started</span>
            <strong>Finish onboarding to lock the default flow for {workspace.segmentLabel}.</strong>
          </div>
          <a href={`/${locale}/fsm?section=onboarding`}>Open onboarding</a>
        </section>
      ) : null}

      <section className="fsm-widget-grid" aria-label="Adaptive dashboard widgets">
        {workspace.widgets.map((widget) => (
          <article key={widget.key} className="fsm-widget">
            <span>{widget.label}</span>
            <strong>{widget.value}</strong>
            <small>{widget.detail}</small>
          </article>
        ))}
      </section>

      <section className="fsm-workspace-grid" aria-label="FSM operating model">
        <article className="fsm-panel">
          <div className="section-heading-row">
            <h2>Default flow</h2>
            <a href={`/${locale}/fsm?section=onboarding`}>Edit</a>
          </div>
          <ol className="fsm-flow-list">
            {workspace.flowSteps.map((step) => (
              <li key={step}>{step}</li>
            ))}
          </ol>
        </article>

        <article className="fsm-panel">
          <h2>Terminology</h2>
          <dl className="fsm-term-list">
            <div>
              <dt>Customer</dt>
              <dd>{term(workspace.segment, locale, "customer")}</dd>
            </div>
            <div>
              <dt>Job</dt>
              <dd>{term(workspace.segment, locale, "job")}</dd>
            </div>
            <div>
              <dt>Asset</dt>
              <dd>{term(workspace.segment, locale, "asset")}</dd>
            </div>
            <div>
              <dt>Request</dt>
              <dd>{term(workspace.segment, locale, "request")}</dd>
            </div>
          </dl>
        </article>
      </section>
    </>
  );
}

function FsmOnboarding({ workspace, locale }: { workspace: FsmWorkspace; locale: Locale }) {
  return (
    <form action={saveFsmOnboardingAction} className="fsm-onboarding" aria-label="FSM onboarding wizard">
      <input type="hidden" name="locale" value={locale} />

      <section className="fsm-onboarding-step">
        <span>Step 1</span>
        <h2>Company basics</h2>
        <p>{workspace.tenantName} is ready for FSM setup. Logo, country, currency, and VAT remain in tenant settings.</p>
      </section>

      <section className="fsm-onboarding-step">
        <span>Step 2</span>
        <h2>Segment detection</h2>
        <div className="fsm-form-grid">
          <label>
            Who do you serve?
            <select name="serve" defaultValue={readString(workspace.onboardingAnswers["serve"], "contracts")}>
              <option value="homeowners">Homeowners and walk-in customers</option>
              <option value="contracts">Businesses under maintenance contracts</option>
              <option value="buildings">Buildings and residents we manage</option>
              <option value="products">Products we manufacture or distribute</option>
            </select>
          </label>
          <label>
            How do requests reach you today?
            <select name="intake" defaultValue={readString(workspace.onboardingAnswers["intake"], "shared_inbox")}>
              <option value="owner_whatsapp">WhatsApp or phone calls to the owner</option>
              <option value="shared_inbox">A team phone line or shared inbox</option>
              <option value="hotline">A hotline or call center</option>
              <option value="email_dealer">Email and dealer channels</option>
            </select>
          </label>
          <label>
            How many people work in the field?
            <select name="fieldSize" defaultValue={readString(workspace.onboardingAnswers["fieldSize"], "six_to_50")}>
              <option value="up_to_5">Just me or up to 5</option>
              <option value="six_to_50">6 to 50</option>
              <option value="more_than_50">More than 50</option>
            </select>
          </label>
          <label>
            Confirm segment
            <select name="confirmedSegment" defaultValue={workspace.segment}>
              {businessSegments.map((segment) => (
                <option key={segment} value={segment}>
                  {segmentLabels[segment]}
                </option>
              ))}
            </select>
          </label>
        </div>
      </section>

      <section className="fsm-onboarding-step">
        <span>Step 3</span>
        <h2>Plan selection</h2>
        <div className="fsm-plan-grid">
          {fsmPlanTiers.map((tier) => (
            <label key={tier} className="fsm-plan-option">
              <input type="radio" name="planTier" value={tier} defaultChecked={workspace.planTier === tier} />
              <strong>{tier}</strong>
              <small>{tier === suggestedPlanForSegment(workspace.segment) ? "Suggested for this segment" : "Available"}</small>
            </label>
          ))}
        </div>
        <label className="tex-checkbox-row">
          <input type="checkbox" name="growthTrial" defaultChecked={workspace.planTier === "entry"} />
          Add 14-day Growth trial for Entry signup
        </label>
      </section>

      <section className="fsm-onboarding-step">
        <span>Step 4</span>
        <h2>Baseline and workspace seeding</h2>
        <div className="fsm-form-grid">
          <label>
            Jobs per month today
            <input name="jobsPerMonthToday" type="number" min="0" defaultValue={readString(workspace.baselineMetrics["jobsPerMonthToday"], "")} />
          </label>
          <label>
            Average response time today
            <input name="averageResponseHoursToday" type="number" min="0" step="0.5" defaultValue={readString(workspace.baselineMetrics["averageResponseHoursToday"], "")} />
          </label>
        </div>
        <p>Industry defaults and the segment flow overlay are applied when this form is saved.</p>
      </section>

      <section className="fsm-onboarding-step">
        <span>Step 5</span>
        <h2>Channel activation</h2>
        <div className="fsm-plan-grid">
          <label className="fsm-plan-option">
            <input type="radio" name="activatedChannel" value="whatsapp" defaultChecked />
            <strong>WhatsApp</strong>
            <small>Connect the first intake number.</small>
          </label>
          <label className="fsm-plan-option">
            <input type="radio" name="activatedChannel" value="portal" />
            <strong>Portal link</strong>
            <small>Claim the public request link.</small>
          </label>
          <label className="fsm-plan-option">
            <input type="radio" name="activatedChannel" value="voice" />
            <strong>Voice setup request</strong>
            <small>Create a provisioning task later.</small>
          </label>
        </div>
        <button type="submit" className="tex-primary-button">Save FSM onboarding</button>
      </section>
    </form>
  );
}

function dashboardTitle(workspace: FsmWorkspace) {
  if (workspace.segment === "FM" || workspace.segment === "COMMUNITY") {
    return "Command Center";
  }

  return "Dashboard";
}

function readSection(value: string | undefined): FsmSection {
  return value || "dashboard";
}

function isActiveNav(href: string, section: FsmSection) {
  if (section === "dashboard") {
    return href === "/fsm";
  }

  return href.includes(`section=${section}`);
}

function readString(value: unknown, fallback: string) {
  if (typeof value === "string" || typeof value === "number") {
    return String(value);
  }

  return fallback;
}
