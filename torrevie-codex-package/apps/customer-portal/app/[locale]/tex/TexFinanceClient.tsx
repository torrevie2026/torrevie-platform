"use client";

import { useMemo, useState } from "react";
import type { TexFinanceReview } from "../../../lib/tex";

type TexFinanceClientProps = {
  initialReview: TexFinanceReview;
};

export function TexFinanceClient({ initialReview }: TexFinanceClientProps) {
  const [review, setReview] = useState(initialReview);
  const [month, setMonth] = useState(String(initialReview.month));
  const [year, setYear] = useState(String(initialReview.year));
  const [selectedExpenseIds, setSelectedExpenseIds] = useState<string[]>([]);
  const [selectedTripIds, setSelectedTripIds] = useState<string[]>([]);
  const [isBusy, setIsBusy] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const selectedTotal = useMemo(() => {
    const expenses = review.approvedExpenses
      .filter((expense) => selectedExpenseIds.includes(expense.id))
      .reduce((total, expense) => total + expense.baseAmount, 0);
    const trips = review.tripPayouts
      .filter((trip) => selectedTripIds.includes(trip.id))
      .reduce((total, trip) => total + trip.totalAmount, 0);
    return expenses + trips;
  }, [review, selectedExpenseIds, selectedTripIds]);

  async function refresh(nextMonth = month, nextYear = year) {
    setIsBusy(true);
    setError(null);
    setNotice(null);

    try {
      const nextReview = await texFetch<TexFinanceReview>(`/finance-review?month=${nextMonth}&year=${nextYear}`);
      setReview(nextReview);
      setSelectedExpenseIds([]);
      setSelectedTripIds([]);
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  async function paySelected() {
    setIsBusy(true);
    setError(null);
    setNotice(null);

    try {
      const result = await texFetch<{ paidExpenses: number; paidTrips: number }>("/finance-review/pay", {
        method: "POST",
        body: JSON.stringify({
          expenseIds: selectedExpenseIds,
          tripIds: selectedTripIds
        })
      });
      setNotice(`Marked paid: ${result.paidExpenses} expenses and ${result.paidTrips} trip payouts.`);
      await refresh();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsBusy(false);
    }
  }

  function exportCsv() {
    const rows = [
      ["Type", "Date", "Person", "Description", "Amount", "Currency"],
      ...review.approvedExpenses.map((expense) => [
        "Approved expense",
        expense.expenseDate,
        expense.employeeName ?? "Unassigned",
        expense.vendor ?? expense.category ?? "Expense",
        expense.baseAmount.toFixed(2),
        review.currency
      ]),
      ...review.tripPayouts.map((trip) => [
        "Trip payout",
        trip.startDate ?? "",
        trip.driverName ?? "Unassigned driver",
        trip.name,
        trip.totalAmount.toFixed(2),
        review.currency
      ]),
      ["Total", "", "", "", review.totals.netPayable.toFixed(2), review.currency]
    ];
    const csv = rows.map((row) => row.map(csvCell).join(",")).join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `tex-finance-${review.year}-${String(review.month).padStart(2, "0")}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  }

  return (
    <div className="tex-finance-workspace">
      <section className="tex-form-panel" aria-labelledby="tex-finance-controls-title">
        <div className="section-heading-row">
          <h3 id="tex-finance-controls-title">Finance period</h3>
        </div>
        <div className="tex-form-grid">
          <label>
            Month
            <select value={month} onChange={(event) => setMonth(event.target.value)}>
              {monthNames.map((name, index) => (
                <option key={name} value={String(index + 1)}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Year
            <input value={year} inputMode="numeric" onChange={(event) => setYear(event.target.value)} />
          </label>
        </div>
        <button type="button" className="tex-primary-button" disabled={isBusy} onClick={() => refresh(month, year)}>
          Load period
        </button>
        <div className="tex-finance-summary">
          <article>
            <span>Approved expenses</span>
            <strong>{formatMoney(review.totals.approvedExpenseAmount, review.currency)}</strong>
          </article>
          <article>
            <span>Trip payouts</span>
            <strong>{formatMoney(review.totals.tripPayoutAmount, review.currency)}</strong>
          </article>
          <article>
            <span>Selected</span>
            <strong>{formatMoney(selectedTotal, review.currency)}</strong>
          </article>
        </div>
        <div className="tex-finance-actions">
          <button type="button" className="tex-primary-button" disabled={isBusy || selectedTotal <= 0} onClick={paySelected}>
            Mark selected paid
          </button>
          <button type="button" className="tex-secondary-button" onClick={exportCsv}>
            Export CSV
          </button>
        </div>
        {notice ? <p className="tex-notice">{notice}</p> : null}
        {error ? <p className="tex-error">{error}</p> : null}
      </section>

      <section className="tex-form-panel" aria-labelledby="tex-finance-expenses-title">
        <h3 id="tex-finance-expenses-title">Approved expenses waiting for payment</h3>
        {review.approvedExpenses.length === 0 ? (
          <p>No approved expenses are waiting for payment in this period.</p>
        ) : (
          <div className="tex-finance-list">
            {review.approvedExpenses.map((expense) => (
              <label key={expense.id} className="tex-finance-row">
                <input
                  type="checkbox"
                  checked={selectedExpenseIds.includes(expense.id)}
                  onChange={(event) => toggleId(selectedExpenseIds, setSelectedExpenseIds, expense.id, event.target.checked)}
                />
                <span>
                  <strong>{expense.vendor ?? expense.category ?? "Expense"}</strong>
                  <small>
                    {expense.employeeName ?? "Unassigned"} - {formatDate(expense.expenseDate)}
                    {expense.tripName ? ` - ${expense.tripName}` : ""}
                  </small>
                </span>
                <FinanceReceiptLink expense={expense} />
                <b>{formatMoney(expense.baseAmount, review.currency)}</b>
              </label>
            ))}
          </div>
        )}
      </section>

      <section className="tex-form-panel" aria-labelledby="tex-finance-trips-title">
        <h3 id="tex-finance-trips-title">Unpaid trip driver payouts</h3>
        {review.tripPayouts.length === 0 ? (
          <p>No unpaid trip payouts are waiting in this period.</p>
        ) : (
          <div className="tex-finance-list">
            {review.tripPayouts.map((trip) => (
              <label key={trip.id} className="tex-finance-row">
                <input
                  type="checkbox"
                  checked={selectedTripIds.includes(trip.id)}
                  onChange={(event) => toggleId(selectedTripIds, setSelectedTripIds, trip.id, event.target.checked)}
                />
                <span>
                  <strong>{trip.name}</strong>
                  <small>
                    {trip.driverName ?? "Unassigned driver"} - {trip.origin ?? "-"} to {trip.destination ?? "-"}
                  </small>
                </span>
                <b>{formatMoney(trip.totalAmount, review.currency)}</b>
              </label>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

const monthNames = [
  "January",
  "February",
  "March",
  "April",
  "May",
  "June",
  "July",
  "August",
  "September",
  "October",
  "November",
  "December"
];

function FinanceReceiptLink({
  expense
}: {
  expense: TexFinanceReview["approvedExpenses"][number];
}) {
  if (!expense.receiptUrl) {
    return <small className="tex-muted-inline">No receipt</small>;
  }

  return (
    <a className="tex-receipt-chip" href={expense.receiptUrl} target="_blank" rel="noreferrer">
      Receipt
    </a>
  );
}

function toggleId(current: string[], setCurrent: (value: string[]) => void, id: string, checked: boolean) {
  setCurrent(checked ? Array.from(new Set([...current, id])) : current.filter((value) => value !== id));
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
  return new Intl.DateTimeFormat("en-GB").format(new Date(`${value}T00:00:00Z`));
}

function formatMoney(value: number, currency: string) {
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value)} ${currency}`;
}

function csvCell(value: string) {
  return `"${value.replace(/"/g, '""')}"`;
}
