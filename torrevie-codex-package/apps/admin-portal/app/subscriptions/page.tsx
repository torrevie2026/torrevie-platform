import type { ReactNode } from "react";
import { notFound, redirect } from "next/navigation";
import { AdminSidebar } from "../components/AdminSidebar";
import { getSupabaseAdminClient } from "../../lib/admin-client";
import { getPlatformSession } from "../../lib/session";
import {
  businessSegments,
  fsmPlanTiers,
  listFeatureOverrides,
  listSubscriptionCatalog,
  listSubscriptions,
  subscriptionStatuses
} from "../../lib/subscription-management";
import { listTenants } from "../../lib/tenant-lifecycle";
import {
  getTexTenantSupportDetail,
  listTexEnterpriseRequests,
  listTexPlanControls,
  listTexTrialOverview,
  texBillingStatuses,
  texEnterpriseRequestStatuses,
  texPlanKeys,
  texPlanStatuses,
  texWhatsappProviderScopes,
  type TexTenantSupportDetail
} from "../../lib/tex-admin";
import {
  assignSubscriptionAction,
  inviteTenantAdminAction,
  launchTenantSupportAccessAction,
  updateFsmTenantControlsAction,
  upsertFeatureOverrideAction
} from "./actions";
import {
  createTexEnterpriseRequestAction,
  updateTexEnterpriseRequestStatusAction,
  upsertTexPlanControlAction
} from "../tex-admin/actions";

export const dynamic = "force-dynamic";

const productOrder = ["all", "crm", "fsm", "tex", "cme", "lqs"] as const;
const knownProducts = new Set(productOrder);

export default async function SubscriptionsPage({
  searchParams
}: {
  searchParams: Promise<{
    assigned?: string;
    invited?: string;
    tenantId?: string;
    fsmControls?: string;
    override?: string;
    section?: string;
    plan?: string;
    enterprise?: string;
  }>;
}) {
  const session = await getPlatformSession();

  if (!session) {
    redirect("/login");
  }

  const client = getSupabaseAdminClient();
  const params = await searchParams;
  const [
    tenants,
    plans,
    subscriptions,
    overrides,
    texControls,
    texTrials,
    enterpriseRequests
  ] =
    await Promise.all([
      listTenants(client),
      listSubscriptionCatalog(client),
      listSubscriptions(client),
      listFeatureOverrides(client),
      listTexPlanControls(client),
      listTexTrialOverview(client),
      listTexEnterpriseRequests(client)
    ]).catch(() => {
      notFound();
    });

  const tenantNames = new Map(tenants.map((tenant) => [tenant.id, tenant.name]));
  const tenantBillingEmails = new Map(tenants.map((tenant) => [tenant.id, tenant.billing_email]));
  const productKeys = productKeysFor(plans, subscriptions);
  const selectedSection = sectionValue(params.section, productKeys);
  const selectedTenant = params.tenantId ? tenants.find((tenant) => tenant.id === params.tenantId) : null;
  const selectedTenantId = params.tenantId ?? texControls[0]?.tenant_id ?? tenants[0]?.id;
  const selectedTexControl = texControls.find((control) => control.tenant_id === selectedTenantId);
  const supportDetail = selectedTenantId ? await getTexTenantSupportDetail(client, selectedTenantId) : null;
  const visibleProductKeys =
    selectedSection === "all" ? productKeys.filter((key) => key !== "all") : [selectedSection];
  const today = new Date().toISOString().slice(0, 10);

  return (
    <main className="admin-shell">
      <AdminSidebar activeHref="/subscriptions" session={session} />
      <section className="admin-main" id="subscriptions-top">
        <header className="topbar">
          <div>
            <p className="eyebrow">Control Plane</p>
            <h1>Subscriptions</h1>
          </div>
          <span className="status">Product entitlements</span>
        </header>

        <nav className="app-group-tabs" aria-label="Subscription app groups">
          {productKeys.map((productKey) => (
            <a
              key={productKey}
              href={productKey === "all" ? "/subscriptions" : `/subscriptions?section=${productKey}`}
              aria-current={selectedSection === productKey ? "page" : undefined}
            >
              {productKey === "all" ? "All apps" : productLabel(productKey)}
            </a>
          ))}
        </nav>

        <section className="panel action-panel" aria-label="Subscription actions">
          <div>
            <p className="eyebrow">New entry</p>
            <h2>Manage from drawers</h2>
            <p>
              Add product subscriptions, FSM controls, TEX plan controls, and Enterprise requests without leaving this
              subscription workspace.
            </p>
          </div>
          <div className="panel-actions">
            <a className="drawer-trigger" href="#drawer-assign">
              Assign plan
            </a>
            {(selectedSection === "all" || selectedSection === "fsm") ? (
              <>
                <a className="drawer-trigger secondary" href="#drawer-fsm-controls">
                  FSM controls
                </a>
                <a className="drawer-trigger secondary" href="#drawer-fsm-override">
                  FSM override
                </a>
              </>
            ) : null}
            {(selectedSection === "all" || selectedSection === "tex") ? (
              <>
                <a className="drawer-trigger secondary" href="#drawer-tex-plan">
                  TEX plan
                </a>
                <a className="drawer-trigger secondary" href="#drawer-enterprise">
                  Enterprise request
                </a>
              </>
            ) : null}
          </div>
        </section>

        {selectedTenant && params.assigned === "1" ? (
          <section className="panel onboarding-next-step" aria-label="Invite tenant administrator">
            <div>
              <p className="eyebrow">Next step</p>
              <h2>Invite the tenant admin</h2>
              <p>
                {selectedTenant.name} now has a subscription. Send the customer administrator invitation so they can
                accept it, set their password, and start using app.torrevie.com.
              </p>
              <span>Invitation email: {selectedTenant.billing_email ?? "Set tenant billing email first"}</span>
            </div>
            <InviteTenantAdminForm tenantId={selectedTenant.id} disabled={!selectedTenant.billing_email} />
            <SupportAccessForm tenantId={selectedTenant.id} compact={false} />
          </section>
        ) : null}

        {selectedTenant && params.invited === "1" ? (
          <p className="notice">
            Customer admin invitation sent to {selectedTenant.billing_email ?? "the tenant billing email"}.
          </p>
        ) : null}
        {selectedTenant && params.fsmControls === "1" ? (
          <p className="notice">FSM controls updated for {selectedTenant.name}.</p>
        ) : null}
        {selectedTenant && params.override === "1" ? (
          <p className="notice">FSM feature override saved for {selectedTenant.name}.</p>
        ) : null}
        {params.plan === "1" ? <p className="notice">TEX plan control saved.</p> : null}
        {params.enterprise === "1" ? <p className="notice">Enterprise request recorded.</p> : null}

        {visibleProductKeys.map((productKey) => (
          <ProductSubscriptionGroup
            key={productKey}
            productKey={productKey}
            subscriptions={subscriptions.filter((subscription) => productKeyOf(subscription.product_label) === productKey)}
            tenantNames={tenantNames}
            tenantBillingEmails={tenantBillingEmails}
          />
        ))}

        {(selectedSection === "all" || selectedSection === "fsm") ? (
          <section className="panel" aria-label="FSM feature overrides">
            <div className="panel-heading">
              <div>
                <p className="eyebrow">FSM</p>
                <h2>Feature overrides</h2>
              </div>
              <a className="drawer-trigger secondary" href="#drawer-fsm-override">
                New override
              </a>
            </div>
            <div className="subscription-list">
              {overrides.length === 0 ? <p className="empty">No FSM overrides have been granted.</p> : null}
              {overrides.slice(0, 8).map((override) => (
                <article key={override.id} className="subscription-row">
                  <div>
                    <strong>{tenantNames.get(override.tenant_id) ?? override.tenant_id}</strong>
                    <span>{override.feature_key}</span>
                  </div>
                  <div>
                    <strong>{override.enabled ? "enabled" : "disabled"}</strong>
                    <span>{override.limit_value === null ? "No limit override" : `Limit ${override.limit_value}`}</span>
                  </div>
                  <div>
                    <strong>{override.expires_at ? formatDate(override.expires_at) : "No expiry"}</strong>
                    <span>{override.reason}</span>
                  </div>
                </article>
              ))}
            </div>
          </section>
        ) : null}

        {(selectedSection === "all" || selectedSection === "tex") ? (
          <>
            <section className="panel" aria-label="TEX plan management">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">TEX</p>
                  <h2>Plan controls</h2>
                </div>
                <a className="drawer-trigger secondary" href="#drawer-tex-plan">
                  Manage plan
                </a>
              </div>
              <div className="subscription-list">
                {texControls.length === 0 ? <p className="empty">No TEX plan controls have been configured.</p> : null}
                {texControls.map((control) => (
                  <article key={control.id} className="subscription-row">
                    <div>
                      <strong>{tenantNames.get(control.tenant_id) ?? control.tenant_id}</strong>
                      <span>
                        {label(control.plan_key)} / {label(control.plan_status)}
                      </span>
                    </div>
                    <div>
                      <strong>{control.employee_limit} employees</strong>
                      <span>{control.seat_count} seats</span>
                    </div>
                    <div>
                      <strong>{label(control.billing_status)}</strong>
                      <span>{control.renewal_date ? `Renews ${formatDate(control.renewal_date)}` : "No renewal date"}</span>
                    </div>
                    <a className="row-link" href={`/subscriptions?section=tex&tenantId=${control.tenant_id}#tex-support-detail`}>
                      Support view
                    </a>
                    <SupportAccessForm tenantId={control.tenant_id} compact />
                  </article>
                ))}
              </div>
            </section>

            <section className="panel" aria-label="TEX trial tenants">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">TEX</p>
                  <h2>Trial tenants</h2>
                </div>
              </div>
              <div className="subscription-list">
                {texTrials.length === 0 ? <p className="empty">No TEX trial tenants are currently tracked.</p> : null}
                {texTrials.map((trial) => (
                  <article key={trial.id} className="subscription-row tex-admin-row">
                    <div>
                      <strong>{trial.tenant_name}</strong>
                      <span>Signup {formatDate(trial.tenant_created_at)}</span>
                    </div>
                    <div>
                      <strong>{label(trial.plan_status)}</strong>
                      <span>Expires {trial.trial_end_date ? formatDate(trial.trial_end_date) : "not set"}</span>
                    </div>
                    <div>
                      <strong>{trial.onboarding_progress}%</strong>
                      <span>Onboarding</span>
                    </div>
                    <div>
                      <strong>{trial.whatsapp_connected ? "Connected" : "Not connected"}</strong>
                      <span>{trial.employee_count} employees</span>
                    </div>
                    <div>
                      <strong>{trial.first_receipt_received ? "Receipt received" : "No receipt"}</strong>
                      <span>{trial.first_expense_approved ? "Approval done" : "Approval pending"}</span>
                    </div>
                    <a className="row-link" href={`/subscriptions?section=tex&tenantId=${trial.tenant_id}#tex-support-detail`}>
                      Open
                    </a>
                  </article>
                ))}
              </div>
            </section>

            <section className="panel" id="tex-support-detail" aria-label="TEX onboarding support">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">TEX</p>
                  <h2>Onboarding support</h2>
                  <span className="panel-subtitle">
                    {tenantNames.get(selectedTenantId ?? "") ?? selectedTenantId ?? "Select a tenant"}
                  </span>
                </div>
              </div>
              {supportDetail ? <SupportDetail detail={supportDetail} /> : <p className="empty">Select a tracked TEX tenant.</p>}
            </section>

            <section className="panel" aria-label="Enterprise request workflow">
              <div className="panel-heading">
                <div>
                  <p className="eyebrow">TEX</p>
                  <h2>Enterprise requests</h2>
                </div>
                <a className="drawer-trigger secondary" href="#drawer-enterprise">
                  New request
                </a>
              </div>
              <div className="subscription-list">
                {enterpriseRequests.length === 0 ? (
                  <p className="empty">No Enterprise requests have been recorded.</p>
                ) : null}
                {enterpriseRequests.map((request) => (
                  <article key={request.id} className="subscription-row tex-admin-row">
                    <div>
                      <strong>{request.tenant_name}</strong>
                      <span>{request.contact_email || "No contact email"}</span>
                    </div>
                    <div>
                      <strong>{label(request.status)}</strong>
                      <span>
                        Follow-up {request.next_follow_up_date ? formatDate(request.next_follow_up_date) : "not set"}
                      </span>
                    </div>
                    <div>
                      <strong>{request.target_go_live_date ? formatDate(request.target_go_live_date) : "No target"}</strong>
                      <span>{request.requested_capabilities.join(", ") || "No capabilities listed"}</span>
                    </div>
                    <form action={updateTexEnterpriseRequestStatusAction} className="inline-status-form">
                      <input type="hidden" name="requestId" value={request.id} />
                      <select name="status" defaultValue={request.status} aria-label="Enterprise request status">
                        {texEnterpriseRequestStatuses.map((status) => (
                          <option key={status} value={status}>
                            {label(status)}
                          </option>
                        ))}
                      </select>
                      <button type="submit">Update</button>
                    </form>
                  </article>
                ))}
              </div>
            </section>
          </>
        ) : null}

        <Drawer id="drawer-assign" title="Assign Product Plan">
          <form action={assignSubscriptionAction} className="subscription-form drawer-form">
            <input type="hidden" name="section" value={selectedSection === "all" ? "" : selectedSection} />
            <label>
              Tenant
              <select name="tenantId" required>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Product plan
              <select name="planId" required>
                {plans.map((plan) => (
                  <option key={plan.id} value={plan.id}>
                    {plan.product_label} / {plan.label}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue="active">
                {subscriptionStatuses.map((status) => (
                  <option key={status} value={status}>
                    {status}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Starts
              <input name="startsAt" type="date" defaultValue={today} required />
            </label>
            <label>
              Expires
              <input name="expiresAt" type="date" />
            </label>
            <button type="submit" disabled={tenants.length === 0 || plans.length === 0}>
              Assign plan
            </button>
          </form>
          {tenants.length === 0 ? <p className="empty">Create a tenant before assigning subscriptions.</p> : null}
          {plans.length === 0 ? <p className="empty">Seed product plans before assigning subscriptions.</p> : null}
        </Drawer>

        <Drawer id="drawer-fsm-controls" title="FSM Controls">
          <form action={updateFsmTenantControlsAction} className="subscription-form drawer-form">
            <label>
              Tenant
              <select name="tenantId" required>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Segment
              <select name="businessSegment" defaultValue="TRADE">
                {businessSegments.map((segment) => (
                  <option key={segment} value={segment}>
                    {segment}
                  </option>
                ))}
              </select>
            </label>
            <label>
              FSM plan tier
              <select name="planTier" defaultValue="growth">
                {fsmPlanTiers.map((tier) => (
                  <option key={tier} value={tier}>
                    {tier}
                  </option>
                ))}
              </select>
            </label>
            <button type="submit" disabled={tenants.length === 0}>
              Save FSM controls
            </button>
          </form>
        </Drawer>

        <Drawer id="drawer-fsm-override" title="FSM Feature Override">
          <form action={upsertFeatureOverrideAction} className="subscription-form drawer-form">
            <label>
              Tenant
              <select name="tenantId" required>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Feature key
              <input name="featureKey" placeholder="fsm.module.pm" required />
            </label>
            <label>
              Enabled
              <select name="enabled" defaultValue="true">
                <option value="true">true</option>
                <option value="false">false</option>
              </select>
            </label>
            <label>
              Limit
              <input name="limitValue" type="number" min="0" />
            </label>
            <label>
              Expires
              <input name="expiresAt" type="date" />
            </label>
            <label>
              Reason
              <input name="reason" placeholder="Growth trial override" required />
            </label>
            <button type="submit" disabled={tenants.length === 0}>
              Save override
            </button>
          </form>
        </Drawer>

        <Drawer id="drawer-tex-plan" title="TEX Plan Control">
          <form action={upsertTexPlanControlAction} className="subscription-form drawer-form">
            <label>
              Tenant
              <select name="tenantId" defaultValue={selectedTenantId} required>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Plan
              <select name="planKey" defaultValue={selectedTexControl?.plan_key ?? "trial"}>
                {texPlanKeys.map((plan) => (
                  <option key={plan} value={plan}>
                    {label(plan)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="planStatus" defaultValue={selectedTexControl?.plan_status ?? "trialing"}>
                {texPlanStatuses.map((status) => (
                  <option key={status} value={status}>
                    {label(status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Trial starts
              <input name="trialStartDate" type="date" defaultValue={selectedTexControl?.trial_start_date ?? today} />
            </label>
            <label>
              Trial ends
              <input name="trialEndDate" type="date" defaultValue={selectedTexControl?.trial_end_date ?? ""} />
            </label>
            <label>
              Employee limit
              <input name="employeeLimit" type="number" min="0" defaultValue={selectedTexControl?.employee_limit ?? 5} />
            </label>
            <label>
              Seat count
              <input name="seatCount" type="number" min="0" defaultValue={selectedTexControl?.seat_count ?? 0} />
            </label>
            <label>
              WhatsApp scope
              <select name="whatsappProviderScope" defaultValue={selectedTexControl?.whatsapp_provider_scope ?? "not_configured"}>
                {texWhatsappProviderScopes.map((scope) => (
                  <option key={scope} value={scope}>
                    {label(scope)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Billing status
              <select name="billingStatus" defaultValue={selectedTexControl?.billing_status ?? "not_configured"}>
                {texBillingStatuses.map((status) => (
                  <option key={status} value={status}>
                    {label(status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Renewal date
              <input name="renewalDate" type="date" defaultValue={selectedTexControl?.renewal_date ?? ""} />
            </label>
            <label>
              Internal notes
              <textarea name="internalPlanNotes" defaultValue={selectedTexControl?.internal_plan_notes ?? ""} />
            </label>
            <button type="submit" disabled={tenants.length === 0}>
              Save TEX plan
            </button>
          </form>
        </Drawer>

        <Drawer id="drawer-enterprise" title="Enterprise Request">
          <form action={createTexEnterpriseRequestAction} className="subscription-form drawer-form">
            <label>
              Tenant
              <select name="tenantId" defaultValue={selectedTenantId} required>
                {tenants.map((tenant) => (
                  <option key={tenant.id} value={tenant.id}>
                    {tenant.name}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Status
              <select name="status" defaultValue="requested">
                {texEnterpriseRequestStatuses.map((status) => (
                  <option key={status} value={status}>
                    {label(status)}
                  </option>
                ))}
              </select>
            </label>
            <label>
              Contact name
              <input name="contactName" />
            </label>
            <label>
              Contact email
              <input name="contactEmail" type="email" />
            </label>
            <label>
              Contact phone
              <input name="contactPhone" />
            </label>
            <label>
              Contact position
              <input name="contactPosition" />
            </label>
            <label>
              Target go-live
              <input name="targetGoLiveDate" type="date" />
            </label>
            <label>
              Next follow-up
              <input name="nextFollowUpDate" type="date" />
            </label>
            <label>
              Requested capabilities
              <textarea name="requestedCapabilities" placeholder="Multi-entity approvals, ERP export" />
            </label>
            <label>
              Internal notes
              <textarea name="internalNotes" />
            </label>
            <button type="submit" disabled={tenants.length === 0}>
              Record request
            </button>
          </form>
        </Drawer>
      </section>
    </main>
  );
}

function ProductSubscriptionGroup({
  productKey,
  subscriptions,
  tenantNames,
  tenantBillingEmails
}: {
  productKey: string;
  subscriptions: Awaited<ReturnType<typeof listSubscriptions>>;
  tenantNames: Map<string, string>;
  tenantBillingEmails: Map<string, string | null>;
}) {
  return (
    <section className="panel app-group-panel" aria-label={`${productLabel(productKey)} subscriptions`}>
      <div className="panel-heading">
        <div>
          <p className="eyebrow">App group</p>
          <h2>{productLabel(productKey)}</h2>
        </div>
        <a className="drawer-trigger secondary" href="#drawer-assign">
          Assign plan
        </a>
      </div>
      <div className="subscription-list">
        {subscriptions.length === 0 ? (
          <p className="empty">No {productLabel(productKey)} subscriptions have been assigned yet.</p>
        ) : null}
        {subscriptions.map((subscription) => (
          <article key={subscription.id} className="subscription-row">
            <div>
              <strong>{tenantNames.get(subscription.tenant_id) ?? subscription.tenant_id}</strong>
              <span>
                {subscription.product_label} / {subscription.plan_label}
              </span>
            </div>
            <div>
              <strong>{subscription.status}</strong>
              <span>
                {formatDate(subscription.starts_at)}
                {subscription.expires_at ? ` to ${formatDate(subscription.expires_at)}` : " onward"}
              </span>
            </div>
            <div>
              <strong>{subscription.entitlement_count}</strong>
              <span>entitlements</span>
            </div>
            <div className="subscription-actions">
              <InviteTenantAdminForm
                tenantId={subscription.tenant_id}
                disabled={!tenantBillingEmails.get(subscription.tenant_id)}
              />
              <SupportAccessForm tenantId={subscription.tenant_id} compact />
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}

function Drawer({ id, title, children }: { id: string; title: string; children: ReactNode }) {
  return (
    <aside id={id} className="right-drawer" aria-labelledby={`${id}-title`}>
      <a className="drawer-scrim" href="#subscriptions-top" aria-label="Close drawer" />
      <section className="drawer-content">
        <header>
          <h2 id={`${id}-title`}>{title}</h2>
          <a href="#subscriptions-top" aria-label="Close drawer">
            Close
          </a>
        </header>
        {children}
      </section>
    </aside>
  );
}

function SupportDetail({ detail }: { detail: TexTenantSupportDetail }) {
  return (
    <div className="tex-support-detail">
      <div className="metric-grid">
        <Metric label="Plan" value={`${label(detail.plan_key)} / ${label(detail.plan_status)}`} />
        <Metric label="Employees" value={`${detail.employee_count} / ${detail.employee_limit}`} />
        <Metric label="WhatsApp" value={detail.whatsapp_connected ? "Connected" : "Not connected"} />
        <Metric label="OCR/manual" value={`${detail.ocr_pending_count} / ${detail.manual_review_count}`} />
      </div>
      <div className="support-columns">
        <section>
          <h3>Blockers</h3>
          {detail.blockers.length === 0 ? <p className="empty">No onboarding blockers detected.</p> : null}
          <ul>
            {detail.blockers.map((blocker) => (
              <li key={blocker}>{blocker}</li>
            ))}
          </ul>
        </section>
        <section>
          <h3>Recent activity</h3>
          {detail.recent_activity.length === 0 ? <p className="empty">No recent TEX activity yet.</p> : null}
          <ul>
            {detail.recent_activity.map((item) => (
              <li key={item}>{item}</li>
            ))}
          </ul>
        </section>
      </div>
    </div>
  );
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="metric-card">
      <span>{label}</span>
      <strong>{value}</strong>
    </div>
  );
}

function productKeysFor(
  plans: Awaited<ReturnType<typeof listSubscriptionCatalog>>,
  subscriptions: Awaited<ReturnType<typeof listSubscriptions>>
) {
  const keys = new Set<string>(["all"]);
  for (const key of productOrder) {
    if (key !== "all") keys.add(key);
  }
  for (const plan of plans) keys.add(productKeyOf(plan.product_label));
  for (const subscription of subscriptions) keys.add(productKeyOf(subscription.product_label));
  return Array.from(keys).sort((first, second) => productRank(first) - productRank(second));
}

function sectionValue(value: string | undefined, productKeys: string[]) {
  const normalized = value?.toLowerCase();
  return normalized && productKeys.includes(normalized) ? normalized : "all";
}

function productRank(value: string) {
  const index = productOrder.findIndex((product) => product === value);
  return index === -1 ? productOrder.length + value.charCodeAt(0) : index;
}

function productKeyOf(value: string) {
  const normalized = value.trim().toLowerCase();
  if (normalized.includes("field") || normalized.includes("fsm")) return "fsm";
  if (normalized.includes("expense") || normalized.includes("tex")) return "tex";
  if (normalized.includes("crm")) return "crm";
  if (normalized.includes("compliance") || normalized.includes("cme")) return "cme";
  if (normalized.includes("quality") || normalized.includes("lqs")) return "lqs";
  return normalized.replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "") || "other";
}

function productLabel(value: string) {
  if (knownProducts.has(value as (typeof productOrder)[number])) {
    return value.toUpperCase();
  }
  return label(value);
}

function label(value: string) {
  return value.replaceAll("_", " ").replaceAll("-", " ").replace(/\b\w/g, (match) => match.toUpperCase());
}

function formatDate(value: string) {
  return new Date(value).toISOString().slice(0, 10);
}

function InviteTenantAdminForm({ tenantId, disabled }: { tenantId: string; disabled: boolean }) {
  return (
    <form action={inviteTenantAdminAction}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <button type="submit" disabled={disabled}>
        Invite admin
      </button>
    </form>
  );
}

function SupportAccessForm({ tenantId, compact }: { tenantId: string; compact: boolean }) {
  return (
    <form action={launchTenantSupportAccessAction} className={compact ? "support-access-form compact" : "support-access-form"}>
      <input type="hidden" name="tenantId" value={tenantId} />
      <input name="reason" placeholder="Support reason" required minLength={3} />
      <button type="submit">Launch app</button>
    </form>
  );
}
