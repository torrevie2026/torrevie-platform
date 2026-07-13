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
import { listChannelHubSnapshot, type ChannelHubSnapshot } from "../../../lib/fsm/channels";
import { listFsmRoiDashboard, type FsmRoiDashboard } from "../../../lib/fsm/roi";
import { CustomerSessionActions } from "../CustomerSessionActions";
import { createManualIntakeRequestAction, requestVoiceChannelSetupAction, saveFsmOnboardingAction, saveFsmRoiSettingsAction } from "./actions";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

type FsmSection = string;

export default async function FsmPage({
  params,
  searchParams
}: {
  params: Promise<{ locale: string }>;
  searchParams?: Promise<{ section?: string; saved?: string; intake?: string; voice?: string; roi?: string }>;
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
    const channelHub = section === "channels" ? await listChannelHubSnapshot(client, tenantContext) : null;
    const roiDashboard = section === "reports" ? await listFsmRoiDashboard(client, tenantContext, workspace) : null;

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
          {resolvedSearchParams?.intake === "created" ? <p className="tex-notice">Intake request created.</p> : null}
          {resolvedSearchParams?.voice === "requested" ? <p className="tex-notice">Voice setup request created.</p> : null}
          {resolvedSearchParams?.roi === "saved" ? <p className="tex-notice">ROI settings saved.</p> : null}

          {section === "onboarding" ? (
            <FsmOnboarding workspace={workspace} locale={locale} />
          ) : section === "channels" ? (
            <ChannelHub snapshot={channelHub} workspace={workspace} locale={locale} />
          ) : section === "reports" ? (
            <RoiDashboard dashboard={roiDashboard} workspace={workspace} locale={locale} />
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

function RoiDashboard({ dashboard, workspace, locale }: { dashboard: FsmRoiDashboard | null; workspace: FsmWorkspace; locale: Locale }) {
  const data =
    dashboard ??
    {
      periodLabel: "This month",
      completedRequestsThisWeek: 0,
      capturedRequestsThisMonth: 0,
      averageResponseMinutes: null,
      responseBaselineHours: null,
      responseDeltaMinutes: null,
      firstTimeFixRate: null,
      slaComplianceRate: null,
      revenueInvoiced: 0,
      afterHoursCaptured: 0,
      adminMinutesSavedPerRequest: 20,
      adminHoursSaved: 0,
      channelBreakdown: [],
      monthlyValueEmail: { subject: "", previewText: "", bodyText: "" },
      clientReportPack: { title: "", available: false, footer: "", sections: [] }
    };

  return (
    <>
      <section className="fsm-roi-hero" aria-label="ROI dashboard">
        <div>
          <span>{data.periodLabel}</span>
          <h2>ROI dashboard</h2>
          <p>Track captured requests, saved admin time, response speed, and reporting readiness.</p>
        </div>
        <strong>{formatHours(data.adminHoursSaved, locale)} saved</strong>
      </section>

      <section className="fsm-widget-grid" aria-label="ROI metrics">
        <RoiMetric label="Requests captured" value={formatNumber(data.capturedRequestsThisMonth, locale)} detail="From all intake channels" />
        <RoiMetric label="Completed this week" value={formatNumber(data.completedRequestsThisWeek, locale)} detail="Converted or closed requests" />
        <RoiMetric label="Average response" value={formatMinutes(data.averageResponseMinutes, locale)} detail={responseDetail(data.responseDeltaMinutes, locale)} />
        <RoiMetric label="After-hours capture" value={formatNumber(data.afterHoursCaptured, locale)} detail="WhatsApp and voice" />
        <RoiMetric label="Revenue invoiced" value={`AED ${formatNumber(data.revenueInvoiced, locale)}`} detail="Pending FSM invoices" />
        <RoiMetric label="First-time fix" value={formatPercent(data.firstTimeFixRate, locale)} detail="Pending FSM jobs" />
        <RoiMetric label="SLA compliance" value={formatPercent(data.slaComplianceRate, locale)} detail="Pending SLA records" />
        <RoiMetric label="Admin time saved" value={formatHours(data.adminHoursSaved, locale)} detail={`${data.adminMinutesSavedPerRequest} minutes per request`} />
      </section>

      <section className="fsm-workspace-grid" aria-label="ROI supporting data">
        <article className="fsm-panel">
          <div className="section-heading-row">
            <h2>Channel capture</h2>
            <span className="module-status module-status-active">{data.channelBreakdown.length} channels</span>
          </div>
          <div className="fsm-roi-bars">
            {data.channelBreakdown.length === 0 ? <p className="empty">No captured requests yet.</p> : null}
            {data.channelBreakdown.map((item) => (
              <div key={item.channelType}>
                <span>{item.channelType}</span>
                <meter min="0" max={Math.max(...data.channelBreakdown.map((channel) => channel.count), 1)} value={item.count} />
                <strong>{formatNumber(item.count, locale)}</strong>
              </div>
            ))}
          </div>
        </article>

        <aside className="fsm-panel">
          <h2>ROI settings</h2>
          <form action={saveFsmRoiSettingsAction} className="fsm-channel-form">
            <input type="hidden" name="locale" value={locale} />
            <label>
              Jobs per month baseline
              <input name="jobsPerMonthToday" type="number" min="0" defaultValue={readString(workspace.baselineMetrics["jobsPerMonthToday"], "")} />
            </label>
            <label>
              Response hours baseline
              <input
                name="averageResponseHoursToday"
                type="number"
                min="0"
                step="0.5"
                defaultValue={readString(workspace.baselineMetrics["averageResponseHoursToday"], "")}
              />
            </label>
            <label>
              Minutes saved per request
              <input name="adminMinutesSavedPerRequest" type="number" min="1" defaultValue={data.adminMinutesSavedPerRequest} />
            </label>
            <button type="submit" className="tex-primary-button">Save ROI settings</button>
          </form>
        </aside>
      </section>

      <section className="fsm-workspace-grid" aria-label="Monthly reports">
        <article className="fsm-panel">
          <h2>Monthly value email</h2>
          <div className="fsm-roi-preview">
            <strong>{data.monthlyValueEmail.subject}</strong>
            <p>{data.monthlyValueEmail.previewText}</p>
            <pre>{data.monthlyValueEmail.bodyText}</pre>
          </div>
        </article>

        <aside className="fsm-panel">
          <h2>Client report pack</h2>
          <p className="empty">{data.clientReportPack.available ? "Enterprise report pack is available." : "Enterprise report pack is locked."}</p>
          <ul className="fsm-flow-list">
            {data.clientReportPack.sections.map((section) => (
              <li key={section}>{section}</li>
            ))}
          </ul>
          {data.clientReportPack.footer ? <p className="fsm-document-footer">{data.clientReportPack.footer}</p> : null}
        </aside>
      </section>
    </>
  );
}

function RoiMetric({ label, value, detail }: { label: string; value: string; detail: string }) {
  return (
    <article className="fsm-widget">
      <span>{label}</span>
      <strong>{value}</strong>
      <small>{detail}</small>
    </article>
  );
}

function ChannelHub({ snapshot, workspace, locale }: { snapshot: ChannelHubSnapshot | null; workspace: FsmWorkspace; locale: Locale }) {
  const data = snapshot ?? {
    channels: [],
    intakeRequests: [],
    callLogs: [],
    voiceUsage: { monthlyMinuteCap: 500, minutesUsed: 0, warningAtMinutes: 400, warningReached: false }
  };
  const voiceChannel = data.channels.find((channel) => channel.channelType === "voice");
  const voiceConfig = voiceChannel?.config ?? {};

  return (
    <section className="fsm-workspace-grid fsm-channel-hub" aria-label="Channel Hub">
      <article className="fsm-panel">
        <div className="section-heading-row">
          <h2>Unified triage</h2>
          <span className="module-status module-status-active">{data.intakeRequests.length} requests</span>
        </div>
        <div className="fsm-intake-list">
          {data.intakeRequests.length === 0 ? <p className="empty">No intake requests yet.</p> : null}
          {data.intakeRequests.map((request) => (
            <article key={request.id} className="fsm-intake-card">
              <header>
                <span className="tex-status tex-status-open">{request.channelType}</span>
                <strong>{request.contactName || request.contactPhone || request.contactEmail || "Unknown contact"}</strong>
              </header>
              <p>{request.aiSummary || "No summary yet."}</p>
              <footer>
                <span>{request.status}</span>
                <time dateTime={request.createdAt}>{new Intl.DateTimeFormat(locale).format(new Date(request.createdAt))}</time>
              </footer>
            </article>
          ))}
        </div>
      </article>

      <aside className="fsm-panel">
        <h2>Voice hotline</h2>
        <div className="fsm-channel-summary">
          <div>
            <strong>{voiceChannel ? voiceChannel.status : "Not requested"}</strong>
            <span>{voiceChannel ? `${voiceChannel.provider} using ${voiceSetupLabel(voiceConfig["setupPath"])}` : "Growth add-on or Enterprise feature"}</span>
          </div>
          <div>
            <strong>{data.voiceUsage.minutesUsed} minutes used</strong>
            <span>Monthly cap {data.voiceUsage.monthlyMinuteCap}. Warning at {data.voiceUsage.warningAtMinutes}.</span>
          </div>
          {data.voiceUsage.warningReached ? <p className="empty">Voice usage is above the warning level.</p> : null}
        </div>
        <form action={requestVoiceChannelSetupAction} className="fsm-channel-form">
          <input type="hidden" name="locale" value={locale} />
          <input type="hidden" name="tenantName" value={workspace.tenantName} />
          <input type="hidden" name="segment" value={workspace.segment} />
          <label>
            Setup path
            <select name="voiceSetupPath" defaultValue={readString(voiceConfig["setupPath"], "forward_existing_number")}>
              <option value="forward_existing_number">Forward existing number</option>
              <option value="licensed_sip">Licensed SIP partner</option>
              <option value="missed_call_deflection">Missed-call deflection</option>
            </select>
          </label>
          <label>
            Monthly minute cap
            <input name="monthlyMinuteCap" type="number" min="50" max="100000" defaultValue={data.voiceUsage.monthlyMinuteCap} />
          </label>
          <p className="empty">
            UAE telecom regulation restricts unlicensed VoIP origination. Use customer-side call forwarding or a licensed local telephony partner.
          </p>
          <button type="submit" className="tex-primary-button">Request voice setup</button>
        </form>

        <h2>Create intake request</h2>
        <form action={createManualIntakeRequestAction} className="fsm-channel-form">
          <input type="hidden" name="locale" value={locale} />
          <label>
            Channel
            <select name="channelType" defaultValue="portal">
              <option value="whatsapp">WhatsApp</option>
              <option value="voice">Voice</option>
              <option value="email">Email</option>
              <option value="portal">Portal</option>
            </select>
          </label>
          <label>
            Contact name
            <input name="contactName" placeholder="Customer name" />
          </label>
          <label>
            Phone
            <input name="contactPhone" placeholder="+971" />
          </label>
          <label>
            Email
            <input name="contactEmail" type="email" placeholder="customer@example.com" />
          </label>
          <label>
            Summary
            <textarea name="summary" rows={4} required placeholder="Request summary" />
          </label>
          <button type="submit" className="tex-primary-button">Create request</button>
        </form>

        <div className="fsm-channel-summary">
          <h3>Channels</h3>
          {data.channels.length === 0 ? <p className="empty">No channels connected yet.</p> : null}
          {data.channels.map((channel) => (
            <div key={channel.id}>
              <strong>{channel.displayName}</strong>
              <span>{channel.channelType} via {channel.provider}</span>
            </div>
          ))}
        </div>

        <div className="fsm-channel-summary">
          <h3>Recent calls</h3>
          {data.callLogs.length === 0 ? <p className="empty">No call logs yet.</p> : null}
          {data.callLogs.map((call) => (
            <div key={call.id}>
              <strong>{call.outcome}</strong>
              <span>{call.fromNumber ?? "Unknown"} to {call.toNumber ?? "Unknown"}</span>
            </div>
          ))}
        </div>
      </aside>
    </section>
  );
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

function formatNumber(value: number, locale: Locale) {
  return new Intl.NumberFormat(locale).format(value);
}

function formatHours(value: number, locale: Locale) {
  return `${new Intl.NumberFormat(locale, { maximumFractionDigits: 1 }).format(value)}h`;
}

function formatMinutes(value: number | null, locale: Locale) {
  if (value === null) {
    return "Pending";
  }

  return `${new Intl.NumberFormat(locale).format(value)}m`;
}

function formatPercent(value: number | null, locale: Locale) {
  if (value === null) {
    return "Pending";
  }

  return new Intl.NumberFormat(locale, { maximumFractionDigits: 0, style: "percent" }).format(value);
}

function responseDetail(deltaMinutes: number | null, locale: Locale) {
  if (deltaMinutes === null) {
    return "Baseline pending";
  }

  if (deltaMinutes > 0) {
    return `${formatMinutes(deltaMinutes, locale)} faster than baseline`;
  }

  if (deltaMinutes < 0) {
    return `${formatMinutes(Math.abs(deltaMinutes), locale)} slower than baseline`;
  }

  return "Matches baseline";
}

function voiceSetupLabel(value: unknown) {
  if (value === "licensed_sip") {
    return "licensed SIP partner";
  }

  if (value === "missed_call_deflection") {
    return "missed-call deflection";
  }

  return "forwarded existing number";
}
