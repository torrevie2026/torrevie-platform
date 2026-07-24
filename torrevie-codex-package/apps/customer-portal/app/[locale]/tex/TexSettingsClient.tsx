"use client";

import { Fragment, useEffect, useMemo, useRef, useState } from "react";
import type {
  TexBudget,
  TexExpenseCategory,
  TexPlanContext,
  TexSettingsWorkspace,
  TexSpendPolicy
} from "../../../lib/tex";

type TexSettingsClientProps = {
  initialSettings: TexSettingsWorkspace | null;
  canManage: boolean;
  planContext: TexPlanContext;
};

type CategoryForm = {
  name: string;
  sortOrder: string;
};

type BudgetForm = {
  department: string;
  month: string;
  year: string;
  budgetAmount: string;
};

type SettingsSection =
  | "workspace"
  | "whatsapp"
  | "duplicates"
  | "categories"
  | "spending"
  | "budgets"
  | "billing";

const monthNames = [
  "Jan",
  "Feb",
  "Mar",
  "Apr",
  "May",
  "Jun",
  "Jul",
  "Aug",
  "Sep",
  "Oct",
  "Nov",
  "Dec"
];

export function TexSettingsClient({
  initialSettings,
  canManage,
  planContext
}: TexSettingsClientProps) {
  const now = new Date();
  const [settings, setSettings] = useState(initialSettings);
  const [categoryForm, setCategoryForm] = useState<CategoryForm>({ name: "", sortOrder: "100" });
  const [editingCategory, setEditingCategory] = useState<TexExpenseCategory | null>(null);
  const [budgetForm, setBudgetForm] = useState<BudgetForm>({
    department: "",
    month: String(initialSettings?.month ?? now.getUTCMonth() + 1),
    year: String(initialSettings?.year ?? now.getUTCFullYear()),
    budgetAmount: ""
  });
  const [activeSettingsSection, setActiveSettingsSection] =
    useState<SettingsSection>("workspace");
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checkoutSyncStarted = useRef(false);

  const policyRows = useMemo(() => settings?.policies ?? [], [settings]);
  const budgetRows = useMemo(() => settings?.budgets ?? [], [settings]);
  const categoryRows = useMemo(() => settings?.categories ?? [], [settings]);
  const duplicateHandlingMode =
    settings?.processingSettings.duplicateHandlingMode ?? "manager_review";
  const branding = settings?.branding;
  const canManageBilling = canManage;
  const isTrialPlan = planContext.planKey === "trial" || planContext.planStatus === "trialing";
  const subscriptionCancelsAtPeriodEnd =
    !isTrialPlan && planContext.billingCancelAtPeriodEnd === true;
  const canUpgradeToLite = planContext.planKey === "trial";
  const canUpgradeToGrowth = planContext.planKey === "trial" || planContext.planKey === "lite";

  useEffect(() => {
    if (window.location.hash === "#tex-billing") {
      setActiveSettingsSection("billing");
    }
  }, []);

  useEffect(() => {
    if (!canManageBilling || checkoutSyncStarted.current) {
      return;
    }

    const query = new URLSearchParams(window.location.search);
    const returnedFromCheckout =
      query.get("billing") === "success" || Boolean(query.get("session_id"));
    const needsRenewalBackfill =
      !isTrialPlan && planContext.billingStatus === "paid" && !planContext.renewalDate;
    const backfillKey = `tex-billing-renewal-sync:${planContext.planKey}:${planContext.billingStatus}`;

    if (!returnedFromCheckout && !needsRenewalBackfill) {
      return;
    }

    if (!returnedFromCheckout && window.sessionStorage.getItem(backfillKey)) {
      return;
    }

    checkoutSyncStarted.current = true;
    if (!returnedFromCheckout) {
      window.sessionStorage.setItem(backfillKey, "1");
    }
    void run("billing-sync", async () => {
      await texFetch("/billing/sync", {
        method: "POST",
        body: JSON.stringify({ sessionId: query.get("session_id") })
      });
      window.location.replace(`${window.location.pathname}?billing=synced#tex-billing`);
    });
  }, [
    canManageBilling,
    isTrialPlan,
    planContext.billingStatus,
    planContext.planKey,
    planContext.renewalDate
  ]);

  if (!settings) {
    return (
      <section className="tex-settings-workspace" aria-labelledby="tex-settings-unavailable-title">
        <div className="tex-form-panel">
          <h2 id="tex-settings-unavailable-title">Settings could not load</h2>
          <p>
            TEX could not load the settings workspace. Refresh the page, and contact support if this
            continues.
          </p>
        </div>
      </section>
    );
  }

  async function refresh(month = Number(budgetForm.month), year = Number(budgetForm.year)) {
    const next = await texFetch<TexSettingsWorkspace>(`/settings?month=${month}&year=${year}`);
    setSettings(next);
  }

  async function saveCategory() {
    const form = editingCategory
      ? {
          name: editingCategory.name,
          sortOrder: editingCategory.sortOrder,
          isActive: editingCategory.isActive
        }
      : { name: categoryForm.name, sortOrder: Number(categoryForm.sortOrder), isActive: true };
    const path = editingCategory
      ? `/settings/categories/${editingCategory.id}`
      : "/settings/categories";
    const method = editingCategory ? "PATCH" : "POST";
    await run("category", async () => {
      await texFetch(path, { method, body: JSON.stringify(form) });
      setCategoryForm({ name: "", sortOrder: "100" });
      setEditingCategory(null);
      await refresh();
      setNotice("Category saved.");
    });
  }

  async function deleteCategory(category: TexExpenseCategory) {
    await run(`category-${category.id}`, async () => {
      await texFetch(`/settings/categories/${category.id}`, { method: "DELETE" });
      await refresh();
      setNotice("Category deleted.");
    });
  }

  async function toggleCategory(category: TexExpenseCategory) {
    await run(`category-${category.id}`, async () => {
      await texFetch(`/settings/categories/${category.id}`, {
        method: "PATCH",
        body: JSON.stringify({
          name: category.name,
          sortOrder: category.sortOrder,
          isActive: !category.isActive
        })
      });
      await refresh();
      setNotice(category.isActive ? "Category deactivated." : "Category activated.");
    });
  }

  async function savePolicy(policy: TexSpendPolicy) {
    await run(`policy-${policy.category}`, async () => {
      await texFetch("/settings/policies", {
        method: "PUT",
        body: JSON.stringify(policy)
      });
      await refresh();
      setNotice("Spend policy saved.");
    });
  }

  async function saveDuplicateHandlingMode(mode: "manager_review" | "auto_reject") {
    await run("processing", async () => {
      const result = await texFetch<Pick<TexSettingsWorkspace, "processingSettings">>(
        "/settings/processing",
        {
          method: "PUT",
          body: JSON.stringify({ duplicateHandlingMode: mode })
        }
      );
      setSettings((current) =>
        current ? { ...current, processingSettings: result.processingSettings } : current
      );
      setNotice("Duplicate handling saved.");
    });
  }

  async function uploadLogo(file: File | null) {
    if (!file) {
      return;
    }

    await run("branding", async () => {
      const dataBase64 = await fileToBase64(file);
      const result = await texFetch<Pick<TexSettingsWorkspace, "branding">>(
        "/settings/branding",
        {
          method: "PUT",
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type,
            dataBase64
          })
        }
      );
      setSettings((current) => (current ? { ...current, branding: result.branding } : current));
      setNotice("Company logo updated.");
    });
  }

  async function removeLogo() {
    await run("branding", async () => {
      const result = await texFetch<Pick<TexSettingsWorkspace, "branding">>(
        "/settings/branding/logo",
        { method: "DELETE" }
      );
      setSettings((current) => (current ? { ...current, branding: result.branding } : current));
      setNotice("Company logo removed.");
    });
  }

  async function saveBudget() {
    await run("budget", async () => {
      await texFetch("/settings/budgets", {
        method: "PUT",
        body: JSON.stringify({
          department: budgetForm.department,
          month: Number(budgetForm.month),
          year: Number(budgetForm.year),
          budgetAmount: Number(budgetForm.budgetAmount)
        })
      });
      await refresh(Number(budgetForm.month), Number(budgetForm.year));
      setBudgetForm((current) => ({ ...current, department: "", budgetAmount: "" }));
      setNotice("Budget saved.");
    });
  }

  async function openCheckout(planKey: "lite" | "growth") {
    await run(`billing-${planKey}`, async () => {
      const result = await texFetch<{ url: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planKey })
      });
      window.location.assign(result.url);
    });
  }

  async function openBillingPortal() {
    await run("billing-portal", async () => {
      const result = await texFetch<{ url: string }>("/billing/portal", { method: "POST" });
      window.location.assign(result.url);
    });
  }

  async function syncBillingStatus() {
    await run("billing-sync", async () => {
      const result = await texFetch<{ synced: boolean; reason?: string }>("/billing/sync", {
        method: "POST",
        body: JSON.stringify({})
      });
      if (result.synced) {
        window.location.replace(`${window.location.pathname}?billing=synced#tex-billing`);
        return;
      }
      setNotice("No active Stripe subscription was found for this tenant yet.");
    });
  }

  async function cancelBillingSubscription() {
    const confirmed = window.confirm(
      "Cancel this TEX subscription at the end of the current billing period? The tenant will keep access until the paid period ends."
    );

    if (!confirmed) {
      return;
    }

    await run("billing-cancel", async () => {
      const result = await texFetch<{
        cancelledAtPeriodEnd: boolean;
        currentPeriodEnd: string | null;
      }>("/billing/cancel", {
        method: "POST",
        body: JSON.stringify({})
      });
      const validUntil = formatBillingDate(result.currentPeriodEnd ?? planContext.renewalDate);
      setNotice(`Subscription cancellation scheduled. TEX remains available until ${validUntil}.`);
      window.location.replace(`${window.location.pathname}?billing=cancelled#tex-billing`);
    });
  }

  async function deleteBudget(budget: TexBudget) {
    await run(`budget-${budget.id}`, async () => {
      await texFetch(`/settings/budgets/${budget.id}`, { method: "DELETE" });
      await refresh();
      setNotice("Budget deleted.");
    });
  }

  async function run(key: string, action: () => Promise<void>) {
    setBusy(key);
    setError(null);
    setNotice(null);
    try {
      await action();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusy(null);
    }
  }

  return (
    <section className="tex-settings-workspace" aria-labelledby="tex-settings-title">
      <div className="section-heading-row">
        <div>
          <h2 id="tex-settings-title">TEX controls</h2>
          <p>
            {canManage
              ? "Manage categories, policy limits, and department budgets within this tenant."
              : "Review tenant categories, policy limits, and department budgets."}
          </p>
        </div>
        <button type="button" className="tex-secondary-button" onClick={() => refresh()}>
          Refresh
        </button>
      </div>
      {notice ? <p className="tex-notice">{notice}</p> : null}
      {error ? <p className="tex-error">{error}</p> : null}
      {busy === "billing-sync" ? (
        <p className="tex-notice">Confirming your Stripe subscription with TEX...</p>
      ) : null}
      {busy === "billing-cancel" ? (
        <p className="tex-notice">Scheduling the Stripe subscription cancellation...</p>
      ) : null}

      <div className="tex-settings-console">
        <nav className="tex-settings-menu" aria-label="TEX settings sections">
          <SettingsMenuButton
            active={activeSettingsSection === "workspace"}
            title="Workspace"
            description="Branding and identity"
            onClick={() => setActiveSettingsSection("workspace")}
          />
          <SettingsMenuButton
            active={activeSettingsSection === "whatsapp"}
            title="WhatsApp setup"
            description="Receipt intake channel"
            onClick={() => setActiveSettingsSection("whatsapp")}
          />
          <SettingsMenuButton
            active={activeSettingsSection === "duplicates"}
            title="Duplicate review"
            description="Receipt duplicate handling"
            onClick={() => setActiveSettingsSection("duplicates")}
          />
          <SettingsMenuButton
            active={activeSettingsSection === "spending"}
            title="Spending limits"
            description="Daily and monthly controls"
            onClick={() => setActiveSettingsSection("spending")}
          />
          <SettingsMenuButton
            active={activeSettingsSection === "categories"}
            title="Categories"
            description={`${categoryRows.length} configured`}
            onClick={() => setActiveSettingsSection("categories")}
          />
          <SettingsMenuButton
            active={activeSettingsSection === "budgets"}
            title="Monthly budgets"
            description={`${budgetRows.length} for selected period`}
            onClick={() => setActiveSettingsSection("budgets")}
          />
          <SettingsMenuButton
            active={activeSettingsSection === "billing"}
            title="Billing"
            description={billingPlanLabel(planContext)}
            onClick={() => setActiveSettingsSection("billing")}
          />
        </nav>

        <div className="tex-settings-content">
        {activeSettingsSection === "workspace" ? (
        <section className="tex-form-panel tex-settings-section">
          <div className="section-heading-row">
            <div>
              <h3>Workspace branding</h3>
              <p>Show your company identity in the TEX navigation.</p>
            </div>
          </div>
          <div className="tex-branding-editor">
            <div className="tex-branding-preview" aria-label="Current TEX workspace branding">
              <span className="tex-branding-logo">
                <img
                  src={branding?.logoUrl ?? "/logo/torrevie_logo_color.png"}
                  alt=""
                  width="52"
                  height="52"
                />
              </span>
              <span>
                <strong>{branding?.tenantName ?? "Current tenant"}</strong>
                <small>Torrevie TEX workspace</small>
              </span>
            </div>
            {canManage ? (
              <div className="tex-branding-actions">
                <label className="tex-secondary-button">
                  Upload logo
                  <input
                    accept="image/png,image/jpeg,image/webp"
                    disabled={busy === "branding"}
                    type="file"
                    onChange={(event) => {
                      void uploadLogo(event.target.files?.[0] ?? null);
                      event.currentTarget.value = "";
                    }}
                  />
                </label>
                {branding?.logoUrl ? (
                  <button
                    type="button"
                    className="tex-secondary-button"
                    disabled={busy === "branding"}
                    onClick={removeLogo}
                  >
                    Remove logo
                  </button>
                ) : null}
              </div>
            ) : null}
          </div>
          <p className="tex-field-hint">Use a PNG, JPG, or WebP logo smaller than 2 MB.</p>
        </section>
        ) : null}

        {activeSettingsSection === "whatsapp" ? (
        <section className="tex-form-panel tex-settings-section tex-settings-feature-panel">
          <div className="section-heading-row">
            <div>
              <h3>WhatsApp setup</h3>
              <p>
                Manage Quick Connect, service status, and provider setup for WhatsApp receipt
                intake.
              </p>
            </div>
          </div>
          <div className="tex-settings-callout">
            <span>
              <strong>Receipt intake route</strong>
              <small>
                Keep WhatsApp setup in its dedicated workspace so pairing, service status, and
                provider options remain clear.
              </small>
            </span>
            <a className="tex-primary-button" href="./integrations">
              Open WhatsApp setup
            </a>
          </div>
        </section>
        ) : null}

        {activeSettingsSection === "billing" ? (
        <section id="tex-billing" className="tex-form-panel tex-settings-section tex-billing-panel">
          <div className="section-heading-row">
            <div>
              <h3>Billing and payment method</h3>
              <p>
                Set up card payment through Stripe Checkout, or manage the saved payment method
                after the tenant is subscribed.
              </p>
            </div>
            <span className="tex-plan-pill">{planContext.planKey}</span>
          </div>
          <div className="tex-billing-summary">
            <span>
              <strong>Current plan</strong>
              <small>{billingPlanLabel(planContext)}</small>
            </span>
            <span>
              <strong>
                {isTrialPlan
                  ? "Trial end"
                  : subscriptionCancelsAtPeriodEnd
                    ? "Valid until"
                    : "Renewal date"}
              </strong>
              <small>
                {isTrialPlan
                  ? formatBillingDate(planContext.trialEndDate)
                  : formatBillingDate(planContext.renewalDate)}
              </small>
            </span>
            <span>
              <strong>{isTrialPlan ? "Status" : "Billing status"}</strong>
              <small>
                {isTrialPlan
                  ? planContext.planStatus
                  : subscriptionCancelsAtPeriodEnd
                    ? "cancelled - active until period end"
                    : planContext.billingStatus}
              </small>
            </span>
          </div>
          {subscriptionCancelsAtPeriodEnd ? (
            <p className="tex-notice">
              This subscription has been cancelled. TEX remains available until{" "}
              {formatBillingDate(planContext.renewalDate)}, then access will stop unless the
              subscription is reactivated.
            </p>
          ) : null}
          {canManageBilling ? (
            <div className="tex-billing-actions">
              {canUpgradeToLite ? (
                <button
                  type="button"
                  className="tex-primary-button"
                  disabled={Boolean(busy)}
                  onClick={() => openCheckout("lite")}
                >
                  Upgrade to Lite
                </button>
              ) : null}
              {canUpgradeToGrowth ? (
                <button
                  type="button"
                  className={canUpgradeToLite ? "tex-secondary-button" : "tex-primary-button"}
                  disabled={Boolean(busy)}
                  onClick={() => openCheckout("growth")}
                >
                  Upgrade to Growth
                </button>
              ) : null}
              <button
                type="button"
                className="tex-secondary-button"
                disabled={Boolean(busy)}
                onClick={openBillingPortal}
              >
                Manage payment method
              </button>
              <button
                type="button"
                className="tex-secondary-button"
                disabled={Boolean(busy)}
                onClick={syncBillingStatus}
              >
                Sync billing status
              </button>
              {!isTrialPlan && !subscriptionCancelsAtPeriodEnd ? (
                <button
                  type="button"
                  className="tex-secondary-button"
                  disabled={Boolean(busy)}
                  onClick={cancelBillingSubscription}
                >
                  Cancel subscription
                </button>
              ) : null}
            </div>
          ) : (
            <p className="tex-field-hint">
              Ask a tenant administrator to manage billing and payment methods.
            </p>
          )}
          <p className="tex-field-hint">
            Billing currency is based on the tenant country: UAE tenants use AED, and non-UAE
            tenants use USD.
          </p>
          <PlanComparison currentPlan={planContext.planKey} />
        </section>
        ) : null}

        {activeSettingsSection === "duplicates" ? (
        <section className="tex-form-panel tex-settings-section">
          <div className="section-heading-row">
            <div>
              <h3>Duplicate review</h3>
              <p>Choose what TEX does when a receipt looks like a duplicate.</p>
            </div>
          </div>
          <div className="tex-settings-control-card">
            <label className="tex-wide-label">
              Duplicate handling
              <select
                value={duplicateHandlingMode}
                disabled={!canManage || busy === "processing"}
                onChange={(event) =>
                  saveDuplicateHandlingMode(event.target.value as "manager_review" | "auto_reject")
                }
              >
                <option value="manager_review">Push for manager review</option>
                <option value="auto_reject">Auto reject likely duplicates</option>
              </select>
            </label>
            <p className="tex-field-hint">
              TEX checks duplicate receipts across the tenant. Likely duplicates can either stay
              visible for manager decision or be rejected automatically.
            </p>
          </div>
        </section>
        ) : null}

        {activeSettingsSection === "categories" ? (
        <section className="tex-form-panel tex-settings-section">
          <div className="section-heading-row">
            <div>
              <h3>Categories</h3>
              <p>Maintain the expense categories available across TEX.</p>
            </div>
          </div>
          {canManage ? (
            <div className="tex-inline-form">
              <input
                value={editingCategory?.name ?? categoryForm.name}
                placeholder="Category name"
                onChange={(event) =>
                  editingCategory
                    ? setEditingCategory({ ...editingCategory, name: event.target.value })
                    : setCategoryForm((current) => ({ ...current, name: event.target.value }))
                }
              />
              <input
                value={editingCategory?.sortOrder ?? categoryForm.sortOrder}
                inputMode="numeric"
                placeholder="Order"
                onChange={(event) =>
                  editingCategory
                    ? setEditingCategory({
                        ...editingCategory,
                        sortOrder: Number(event.target.value) || 0
                      })
                    : setCategoryForm((current) => ({ ...current, sortOrder: event.target.value }))
                }
              />
              <button
                type="button"
                className="tex-primary-button"
                disabled={busy === "category"}
                onClick={saveCategory}
              >
                {editingCategory ? "Save" : "Add"}
              </button>
              {editingCategory ? (
                <button
                  type="button"
                  className="tex-secondary-button"
                  onClick={() => setEditingCategory(null)}
                >
                  Cancel
                </button>
              ) : null}
            </div>
          ) : null}
          <div className="tex-settings-list">
            {categoryRows.map((category) => (
              <article
                key={category.id}
                className={!category.isActive ? "tex-muted-row" : undefined}
              >
                <span>
                  <strong>{category.name}</strong>
                  <small>
                    {category.isSystem ? "System" : "Custom"} · order {category.sortOrder}
                  </small>
                </span>
                <div className="tex-card-actions">
                  {canManage ? (
                    <>
                      <button type="button" onClick={() => setEditingCategory(category)}>
                        Edit
                      </button>
                      <button
                        type="button"
                        disabled={busy === `category-${category.id}`}
                        onClick={() => toggleCategory(category)}
                      >
                        {category.isActive ? "Deactivate" : "Activate"}
                      </button>
                      {!category.isSystem ? (
                        <button
                          type="button"
                          disabled={busy === `category-${category.id}`}
                          onClick={() => deleteCategory(category)}
                        >
                          Delete
                        </button>
                      ) : null}
                    </>
                  ) : (
                    <span>{category.isActive ? "Active" : "Inactive"}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        </section>
        ) : null}

        {activeSettingsSection === "spending" ? (
        <section className="tex-form-panel tex-settings-section">
          <div className="section-heading-row">
            <div>
              <h3>Spending limits</h3>
              <p>Set daily, monthly, and notes-required thresholds by expense category.</p>
            </div>
          </div>
          <div className="tex-settings-table">
            {policyRows.map((policy) => (
              <PolicyRow
                key={policy.category}
                policy={policy}
                busy={busy === `policy-${policy.category}`}
                onSave={savePolicy}
                canManage={canManage}
              />
            ))}
          </div>
        </section>
        ) : null}

        {activeSettingsSection === "budgets" ? (
        <section className="tex-form-panel tex-settings-section">
          <div className="section-heading-row">
            <div>
              <h3>Monthly budgets</h3>
              <p>
                {monthNames[(settings.month || 1) - 1]} {settings.year}
              </p>
            </div>
            <div className="tex-inline-form tex-period-form">
              <select
                value={budgetForm.month}
                onChange={(event) =>
                  setBudgetForm((current) => ({ ...current, month: event.target.value }))
                }
              >
                {monthNames.map((name, index) => (
                  <option key={name} value={index + 1}>
                    {name}
                  </option>
                ))}
              </select>
              <input
                value={budgetForm.year}
                inputMode="numeric"
                onChange={(event) =>
                  setBudgetForm((current) => ({ ...current, year: event.target.value }))
                }
              />
              <button type="button" className="tex-secondary-button" onClick={() => refresh()}>
                View
              </button>
            </div>
          </div>
          {canManage ? (
            <div className="tex-inline-form">
              <input
                list="tex-departments"
                value={budgetForm.department}
                placeholder="Department"
                onChange={(event) =>
                  setBudgetForm((current) => ({ ...current, department: event.target.value }))
                }
              />
              <datalist id="tex-departments">
                {settings.departments.map((department) => (
                  <option key={department} value={department} />
                ))}
              </datalist>
              <input
                value={budgetForm.budgetAmount}
                inputMode="decimal"
                placeholder="Budget amount"
                onChange={(event) =>
                  setBudgetForm((current) => ({ ...current, budgetAmount: event.target.value }))
                }
              />
              <button
                type="button"
                className="tex-primary-button"
                disabled={busy === "budget"}
                onClick={saveBudget}
              >
                Save budget
              </button>
            </div>
          ) : null}
          <div className="tex-budget-admin-list">
            {budgetRows.length === 0 ? <p>No budgets set for this period.</p> : null}
            {budgetRows.map((budget) => {
              const percent =
                budget.budgetAmount > 0
                  ? Math.min(100, (budget.spentAmount / budget.budgetAmount) * 100)
                  : 0;
              return (
                <article key={budget.id} className="tex-budget-admin-row">
                  <span>
                    <strong>{budget.department}</strong>
                    <small>
                      {formatAmount(budget.spentAmount)} spent ·{" "}
                      {formatAmount(budget.remainingAmount)} remaining
                    </small>
                  </span>
                  <div className="tex-budget-bar">
                    <i style={{ inlineSize: `${percent}%` }} />
                  </div>
                  <strong>{formatAmount(budget.budgetAmount)}</strong>
                  {canManage ? (
                    <button
                      type="button"
                      disabled={busy === `budget-${budget.id}`}
                      onClick={() => deleteBudget(budget)}
                    >
                      Delete
                    </button>
                  ) : null}
                </article>
              );
            })}
          </div>
        </section>
        ) : null}
        </div>
      </div>
    </section>
  );
}

function SettingsMenuButton({
  active,
  title,
  description,
  onClick
}: {
  active: boolean;
  title: string;
  description: string;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      className={active ? "tex-settings-menu-item is-active" : "tex-settings-menu-item"}
      onClick={onClick}
    >
      <strong>{title}</strong>
      <span>{description}</span>
    </button>
  );
}

function PolicyRow({
  policy,
  busy,
  onSave,
  canManage
}: {
  policy: TexSpendPolicy;
  busy: boolean;
  onSave: (policy: TexSpendPolicy) => void;
  canManage: boolean;
}) {
  const [draft, setDraft] = useState(policy);

  return (
    <article className={draft.isBlocked ? "tex-policy-row tex-muted-row" : "tex-policy-row"}>
      <strong className="tex-policy-category">{draft.category}</strong>
      <label>
        <span>Daily limit</span>
        <input
          aria-label={`${draft.category} daily limit`}
          inputMode="decimal"
          placeholder="No limit"
          value={draft.dailyLimit ?? ""}
          disabled={!canManage}
          onChange={(event) =>
            setDraft({ ...draft, dailyLimit: optionalNumber(event.target.value) })
          }
        />
      </label>
      <label>
        <span>Monthly limit</span>
        <input
          aria-label={`${draft.category} monthly limit`}
          inputMode="decimal"
          placeholder="No limit"
          value={draft.monthlyLimit ?? ""}
          disabled={!canManage}
          onChange={(event) =>
            setDraft({ ...draft, monthlyLimit: optionalNumber(event.target.value) })
          }
        />
      </label>
      <label>
        <span>Require notes above</span>
        <input
          aria-label={`${draft.category} notes threshold`}
          inputMode="decimal"
          placeholder="Optional"
          value={draft.requiresNotesAbove ?? ""}
          disabled={!canManage}
          onChange={(event) =>
            setDraft({ ...draft, requiresNotesAbove: optionalNumber(event.target.value) })
          }
        />
      </label>
      <label className="tex-toggle-label">
        <input
          type="checkbox"
          checked={draft.isBlocked}
          disabled={!canManage}
          onChange={(event) => setDraft({ ...draft, isBlocked: event.target.checked })}
        />
        Block
      </label>
      {canManage ? (
        <button
          type="button"
          className="tex-secondary-button"
          disabled={busy}
          onClick={() => onSave(draft)}
        >
          Save
        </button>
      ) : null}
    </article>
  );
}

function PlanComparison({ currentPlan }: { currentPlan: TexPlanContext["planKey"] }) {
  const rows = [
    ["Seats", "5 included", "25 included"],
    ["Receipt OCR", "Included", "Included with higher review volume"],
    ["WhatsApp intake", "Quick Connect", "Managed providers plus Quick Connect"],
    ["Trips", "Expense-focused", "Trips and trip legs"],
    ["Finance review", "Approve and mark paid", "Finance review workspace"],
    ["Controls", "Core settings", "Budgets, reports, and growth controls"]
  ];

  return (
    <div className="tex-plan-comparison" aria-label="Lite and Growth plan comparison">
      <div>
        <strong>Lite vs Growth</strong>
        <span>
          {currentPlan === "lite"
            ? "Growth is the next upgrade when you need more seats and transport controls."
            : "Compare the paid plans before choosing the upgrade path."}
        </span>
      </div>
      <div className="tex-plan-comparison-grid">
        <span />
        <strong className={currentPlan === "lite" ? "is-current" : undefined}>Lite</strong>
        <strong className={currentPlan === "growth" ? "is-current" : undefined}>Growth</strong>
        {rows.map(([feature, lite, growth]) => (
          <Fragment key={feature}>
            <span>{feature}</span>
            <small>{lite}</small>
            <small>{growth}</small>
          </Fragment>
        ))}
      </div>
    </div>
  );
}

function optionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
}

function fileToBase64(file: File) {
  return new Promise<string>((resolve, reject) => {
    const reader = new FileReader();
    reader.addEventListener("load", () => resolve(String(reader.result ?? "")));
    reader.addEventListener("error", () => reject(new Error("Unable to read the logo file.")));
    reader.readAsDataURL(file);
  });
}

async function texFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/tex${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : "TEX request failed.");
  }

  return body as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "TEX request failed.";
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}

function billingPlanLabel(plan: TexPlanContext) {
  const planName = plan.planKey.charAt(0).toUpperCase() + plan.planKey.slice(1);
  return `${planName} (${plan.seatCount}/${plan.employeeLimit} seats)`;
}

function formatBillingDate(value: string | null) {
  if (!value) {
    return "Not set";
  }
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) {
    return "Not set";
  }
  return new Intl.DateTimeFormat("en-GB", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric"
  }).format(date);
}
