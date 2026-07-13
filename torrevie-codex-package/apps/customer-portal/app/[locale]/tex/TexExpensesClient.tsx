"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { TexBootstrap, TexExpenseListItem, TexExpenseStatus, TexTripListItem } from "../../../lib/tex";

type TexExpensesClientProps = {
  categories: TexBootstrap["categories"];
  employees: TexBootstrap["employeeProfiles"];
  trips: TexTripListItem[];
  initialExpenses: TexExpenseListItem[];
};

type ExpenseFormState = {
  employeeProfileId: string;
  vendor: string;
  expenseDate: string;
  amount: string;
  currency: string;
  category: string;
  tripId: string;
  notes: string;
};

const blankForm = (): ExpenseFormState => ({
  employeeProfileId: "",
  vendor: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  amount: "",
  currency: "AED",
  category: "",
  tripId: "",
  notes: ""
});

export function TexExpensesClient({ categories, employees, trips, initialExpenses }: TexExpensesClientProps) {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [form, setForm] = useState<ExpenseFormState>(blankForm);
  const [statusFilter, setStatusFilter] = useState<"all" | TexExpenseStatus>("all");
  const [isCreating, setIsCreating] = useState(false);
  const [isExpenseDrawerOpen, setIsExpenseDrawerOpen] = useState(false);
  const [busyExpenseId, setBusyExpenseId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleExpenses = useMemo(
    () => expenses.filter((expense) => statusFilter === "all" || expense.status === statusFilter),
    [expenses, statusFilter]
  );
  const activeEmployees = employees.filter((employee) => employee.isActive);
  const activeCategories = categories.filter((category) => category.isActive);
  const openTrips = trips.filter((trip) => trip.status !== "closed" && trip.status !== "cancelled");

  async function refreshExpenses() {
    const response = await texFetch<{ expenses: TexExpenseListItem[] }>("/expenses");
    setExpenses(response.expenses);
  }

  async function createExpense() {
    setIsCreating(true);
    setError(null);
    setNotice(null);

    try {
      await texFetch("/expenses", {
        method: "POST",
        body: JSON.stringify({
          employeeProfileId: form.employeeProfileId || null,
          vendor: form.vendor || null,
          expenseDate: form.expenseDate,
          amount: Number(form.amount),
          currency: form.currency,
          category: form.category || null,
          tripId: form.tripId || null,
          notes: form.notes || null,
          source: "web"
        })
      });
      setNotice("Expense submitted.");
      setForm(blankForm());
      setIsExpenseDrawerOpen(false);
      await refreshExpenses();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsCreating(false);
    }
  }

  async function updateStatus(expenseId: string, status: Exclude<TexExpenseStatus, "pending">) {
    setBusyExpenseId(expenseId);
    setError(null);
    setNotice(null);

    try {
      await texFetch(`/expenses/${expenseId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setNotice(`Expense ${status}.`);
      await refreshExpenses();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyExpenseId(null);
    }
  }

  return (
    <div className="tex-expense-workspace">
      {isExpenseDrawerOpen ? (
        <div
          className="tex-drawer-backdrop"
          role="presentation"
          onMouseDown={() => {
            setIsExpenseDrawerOpen(false);
            setForm(blankForm());
          }}
        >
          <aside
            className="tex-drawer"
            aria-labelledby="tex-new-expense-title"
            aria-modal="true"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="section-heading-row">
              <h3 id="tex-new-expense-title">New expense</h3>
              <button
                type="button"
                className="tex-secondary-button"
                onClick={() => {
                  setIsExpenseDrawerOpen(false);
                  setForm(blankForm());
                }}
              >
                Close
              </button>
            </div>

            <div className="tex-form-grid">
              <label>
                Employee
                <select value={form.employeeProfileId} onChange={(event) => setFormValue(setForm, "employeeProfileId", event.target.value)}>
                  <option value="">Signed-in user</option>
                  {activeEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Date
                <input value={form.expenseDate} type="date" onChange={(event) => setFormValue(setForm, "expenseDate", event.target.value)} />
              </label>
              <label>
                Amount
                <input value={form.amount} inputMode="decimal" onChange={(event) => setFormValue(setForm, "amount", event.target.value)} />
              </label>
              <label>
                Currency
                <input
                  value={form.currency}
                  maxLength={3}
                  onChange={(event) => setFormValue(setForm, "currency", event.target.value.toUpperCase())}
                />
              </label>
              <label>
                Category
                <select value={form.category} onChange={(event) => setFormValue(setForm, "category", event.target.value)}>
                  <option value="">Uncategorized</option>
                  {activeCategories.map((category) => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Trip
                <select value={form.tripId} onChange={(event) => setFormValue(setForm, "tripId", event.target.value)}>
                  <option value="">No trip</option>
                  {openTrips.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {trip.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Vendor
                <input value={form.vendor} onChange={(event) => setFormValue(setForm, "vendor", event.target.value)} />
              </label>
              <label>
                Notes
                <input value={form.notes} onChange={(event) => setFormValue(setForm, "notes", event.target.value)} />
              </label>
            </div>

            <button type="button" className="tex-primary-button" disabled={isCreating} onClick={createExpense}>
              {isCreating ? "Submitting..." : "Submit expense"}
            </button>
            {error ? <p className="tex-error">{error}</p> : null}
          </aside>
        </div>
      ) : null}

      <section className="tex-form-panel" aria-labelledby="tex-expense-list-title">
        <div className="section-heading-row">
          <h3 id="tex-expense-list-title">Expense queue</h3>
          <div className="tex-panel-actions">
            <button
              type="button"
              className="tex-primary-button"
              onClick={() => {
                setForm(blankForm());
                setError(null);
                setNotice(null);
                setIsExpenseDrawerOpen(true);
              }}
            >
              New expense
            </button>
            <button type="button" className="tex-secondary-button" onClick={refreshExpenses}>
              Refresh
            </button>
          </div>
        </div>
        <div className="tex-segmented-control" aria-label="Expense status filter">
          {(["all", "pending", "approved", "rejected", "paid"] as const).map((status) => (
            <button
              key={status}
              type="button"
              aria-pressed={statusFilter === status}
              onClick={() => setStatusFilter(status)}
            >
              {status}
            </button>
          ))}
        </div>
        {notice ? <p className="tex-notice">{notice}</p> : null}
        {error && !isExpenseDrawerOpen ? <p className="tex-error">{error}</p> : null}

        {visibleExpenses.length === 0 ? (
          <p>No expenses match this view.</p>
        ) : (
          <div className="tex-expense-list">
            {visibleExpenses.map((expense) => (
              <article key={expense.id} className="tex-expense-card">
                <div>
                  <span className={`tex-status tex-status-${expense.status}`}>{expense.status}</span>
                  <h4>{expense.vendor ?? expense.category ?? "Expense"}</h4>
                  <p>
                    {expense.employeeName ?? "Unassigned"} · {formatDate(expense.expenseDate)}
                    {expense.tripName ? ` · ${expense.tripName}` : ""}
                  </p>
                </div>
                <strong>
                  {formatAmount(expense.amount)} {expense.currency}
                </strong>
                <div className="tex-card-actions">
                  {expense.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        disabled={busyExpenseId === expense.id}
                        onClick={() => updateStatus(expense.id, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyExpenseId === expense.id}
                        onClick={() => updateStatus(expense.id, "rejected")}
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <span>{expense.category ?? "No category"}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function setFormValue(
  setForm: Dispatch<SetStateAction<ExpenseFormState>>,
  key: keyof ExpenseFormState,
  value: string
) {
  setForm((current) => ({ ...current, [key]: value }));
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

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en", { dateStyle: "medium" }).format(new Date(`${value}T00:00:00Z`));
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}
