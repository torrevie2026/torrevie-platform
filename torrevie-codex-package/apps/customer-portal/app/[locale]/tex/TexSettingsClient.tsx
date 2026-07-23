"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  const [busy, setBusy] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const checkoutSyncStarted = useRef(false);

  const policyRows = useMemo(() => settings?.policies ?? [], [settings]);
  const budgetRows = useMemo(() => settings?.budgets ?? [], [settings]);
  const categoryRows = useMemo(() => settings?.categories ?? [], [settings]);
  const duplicateHandlingMode =
    settings?.processingSettings.duplicateHandlingMode ?? "manager_review";
  const canManageBilling = canManage;

  useEffect(() => {
    if (!canManageBilling || checkoutSyncStarted.current) {
      return;
    }

    const query = new URLSearchParams(window.location.search);
    if (query.get("billing") !== "success" && !query.get("session_id")) {
      return;
    }

    checkoutSyncStarted.current = true;
    void run("billing-sync", async () => {
      await texFetch("/billing/sync", {
        method: "POST",
        body: JSON.stringify({ sessionId: query.get("session_id") })
      });
      window.location.replace(`${window.location.pathname}?billing=synced#tex-billing`);
    });
  }, [canManageBilling]);

  if (!settings) {
    return null;
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

  async function openCheckout(planKey: "lite" | "growth", currency: "aed" | "usd") {
    await run(`billing-${planKey}-${currency}`, async () => {
      const result = await texFetch<{ url: string }>("/billing/checkout", {
        method: "POST",
        body: JSON.stringify({ planKey, currency })
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

      <div className="tex-settings-grid">
        <section id="tex-billing" className="tex-form-panel tex-settings-wide tex-billing-panel">
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
              <strong>Trial end</strong>
              <small>{formatTrialEnd(planContext.trialEndDate)}</small>
            </span>
            <span>
              <strong>Status</strong>
              <small>{planContext.planStatus}</small>
            </span>
          </div>
          {canManageBilling ? (
            <div className="tex-billing-actions">
              <button
                type="button"
                className="tex-primary-button"
                disabled={Boolean(busy)}
                onClick={() => openCheckout("lite", "aed")}
              >
                Upgrade to Lite AED
              </button>
              <button
                type="button"
                className="tex-secondary-button"
                disabled={Boolean(busy)}
                onClick={() => openCheckout("growth", "aed")}
              >
                Upgrade to Growth AED
              </button>
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
            </div>
          ) : (
            <p className="tex-field-hint">
              Ask a tenant administrator to manage billing and payment methods.
            </p>
          )}
          <p className="tex-field-hint">
            UAE tenants normally use AED billing. International tenants can use the USD checkout
            option when required.
          </p>
          {canManageBilling ? (
            <div className="tex-billing-currency-actions" aria-label="USD billing options">
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => openCheckout("lite", "usd")}
              >
                Lite USD
              </button>
              <button
                type="button"
                disabled={Boolean(busy)}
                onClick={() => openCheckout("growth", "usd")}
              >
                Growth USD
              </button>
            </div>
          ) : null}
        </section>

        <section className="tex-form-panel">
          <h3>Receipt processing</h3>
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
            TEX always checks for duplicate receipts. Choose whether likely duplicates stay pending
            for manager approval or are rejected automatically.
          </p>
        </section>

        <section className="tex-form-panel">
          <h3>Expense categories</h3>
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

        <section className="tex-form-panel">
          <h3>Spend policies</h3>
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

        <section className="tex-form-panel tex-settings-wide">
          <div className="section-heading-row">
            <div>
              <h3>Department budgets</h3>
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
      </div>
    </section>
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
      <strong>{draft.category}</strong>
      <input
        aria-label={`${draft.category} daily limit`}
        inputMode="decimal"
        placeholder="Daily"
        value={draft.dailyLimit ?? ""}
        disabled={!canManage}
        onChange={(event) => setDraft({ ...draft, dailyLimit: optionalNumber(event.target.value) })}
      />
      <input
        aria-label={`${draft.category} monthly limit`}
        inputMode="decimal"
        placeholder="Monthly"
        value={draft.monthlyLimit ?? ""}
        disabled={!canManage}
        onChange={(event) =>
          setDraft({ ...draft, monthlyLimit: optionalNumber(event.target.value) })
        }
      />
      <input
        aria-label={`${draft.category} notes threshold`}
        inputMode="decimal"
        placeholder="Notes above"
        value={draft.requiresNotesAbove ?? ""}
        disabled={!canManage}
        onChange={(event) =>
          setDraft({ ...draft, requiresNotesAbove: optionalNumber(event.target.value) })
        }
      />
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
        <button type="button" disabled={busy} onClick={() => onSave(draft)}>
          Save
        </button>
      ) : null}
    </article>
  );
}

function optionalNumber(value: string) {
  return value.trim() ? Number(value) : null;
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

function formatTrialEnd(value: string | null) {
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
