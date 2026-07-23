"use client";

import { useCallback, useMemo, useState } from "react";
import type { TexReportExpense, TexReportWorkspace } from "../../../lib/tex";
import { useTexAutoRefresh } from "./useTexAutoRefresh";

type TexReportsClientProps = {
  initialReport: TexReportWorkspace | null;
};

type ReportFilters = {
  category: string;
  status: string;
  employee: string;
};

const emptyFilters: ReportFilters = {
  category: "all",
  status: "all",
  employee: "all"
};

export function TexReportsClient({ initialReport }: TexReportsClientProps) {
  const [report, setReport] = useState(initialReport);
  const [dateFrom, setDateFrom] = useState(initialReport?.dateFrom ?? "");
  const [dateTo, setDateTo] = useState(initialReport?.dateTo ?? "");
  const [filters, setFilters] = useState<ReportFilters>(emptyFilters);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);

  const filteredExpenses = useMemo(
    () => filterExpenses(report?.expenses ?? [], filters),
    [filters, report]
  );
  const filteredPreviousExpenses = useMemo(
    () => filterExpenses(report?.previousExpenses ?? [], filters),
    [filters, report]
  );
  const metrics = useMemo(
    () => buildReportMetrics(filteredExpenses, filteredPreviousExpenses),
    [filteredExpenses, filteredPreviousExpenses]
  );
  const categories = useMemo(
    () => uniqueValues(report?.expenses.map((expense) => expense.category) ?? []),
    [report]
  );
  const statuses = useMemo(
    () => uniqueValues(report?.expenses.map((expense) => expense.status) ?? []),
    [report]
  );
  const employees = useMemo(
    () => uniqueValues(report?.expenses.map((expense) => expense.employeeName) ?? []),
    [report]
  );

  if (!report) {
    return null;
  }
  const activeReport = report;

  const refreshReport = useCallback(async () => {
    setBusy(true);
    setError(null);

    try {
      const params = new URLSearchParams();
      if (dateFrom) {
        params.set("date_from", dateFrom);
      }
      if (dateTo) {
        params.set("date_to", dateTo);
      }
      const nextReport = await texFetch<TexReportWorkspace>(`/reports?${params.toString()}`);
      setReport(nextReport);
      setDateFrom(nextReport.dateFrom);
      setDateTo(nextReport.dateTo);
      setLastUpdatedAt(new Date());
    } catch (requestError) {
      setError(errorMessage(requestError));
    } finally {
      setBusy(false);
    }
  }, [dateFrom, dateTo]);

  useTexAutoRefresh({
    enabled: !busy,
    intervalMs: 60000,
    minRefreshGapMs: 30000,
    onRefresh: refreshReport
  });

  function exportCsv() {
    const header = [
      "Date",
      "Employee",
      "Vendor",
      "Category",
      "Trip",
      "Status",
      "Amount",
      "Currency",
      "Base amount",
      "Payment method",
      "Source",
      "Policy flag",
      "Tax amount",
      "Tax ID"
    ];
    const rows = filteredExpenses.map((expense) => [
      expense.expenseDate,
      expense.employeeName ?? "",
      expense.vendor ?? "",
      expense.category ?? "",
      expense.tripName ?? "",
      expense.status,
      expense.amount,
      expense.currency,
      expense.baseAmount,
      expense.paymentMethod ?? "",
      expense.source ?? "",
      expense.policyFlag ? "yes" : "no",
      expense.taxAmount ?? "",
      expense.taxIdNumber ?? ""
    ]);
    const csv = [header, ...rows]
      .map((row) => row.map((cell) => csvCell(String(cell))).join(","))
      .join("\n");
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const link = document.createElement("a");
    link.href = URL.createObjectURL(blob);
    link.download = `tex-report-${activeReport.dateFrom}-${activeReport.dateTo}.csv`;
    link.click();
    URL.revokeObjectURL(link.href);
  }

  return (
    <section
      className={`tex-reports-workspace${busy ? " tex-live-refreshing" : ""}`}
      aria-busy={busy}
      aria-labelledby="tex-reports-title"
    >
      <header className="section-heading-row">
        <div>
          <p className="eyebrow">Reports</p>
          <h2 id="tex-reports-title">Spend reporting</h2>
          <p>
            Review tenant-scoped spend, compare against the previous period, and export the filtered
            expense ledger for finance analysis.
          </p>
        </div>
        <button type="button" disabled={filteredExpenses.length === 0} onClick={exportCsv}>
          Export CSV
        </button>
      </header>

      <section className="tex-form-panel tex-report-controls" aria-label="Report controls">
        <div className="tex-form-grid">
          <label>
            From
            <input
              type="date"
              value={dateFrom}
              onChange={(event) => setDateFrom(event.target.value)}
            />
          </label>
          <label>
            To
            <input type="date" value={dateTo} onChange={(event) => setDateTo(event.target.value)} />
          </label>
          <label>
            Category
            <select
              value={filters.category}
              onChange={(event) => setFilters({ ...filters, category: event.target.value })}
            >
              <option value="all">All categories</option>
              {categories.map((category) => (
                <option key={category} value={category}>
                  {category}
                </option>
              ))}
            </select>
          </label>
          <label>
            Status
            <select
              value={filters.status}
              onChange={(event) => setFilters({ ...filters, status: event.target.value })}
            >
              <option value="all">All statuses</option>
              {statuses.map((status) => (
                <option key={status} value={status}>
                  {status}
                </option>
              ))}
            </select>
          </label>
          <label>
            Employee
            <select
              value={filters.employee}
              onChange={(event) => setFilters({ ...filters, employee: event.target.value })}
            >
              <option value="all">All employees</option>
              {employees.map((employee) => (
                <option key={employee} value={employee}>
                  {employee}
                </option>
              ))}
            </select>
          </label>
          <button type="button" disabled={busy} onClick={refreshReport}>
            {busy ? "Applying..." : "Apply"}
          </button>
        </div>
        <p className="tex-refresh-meta" aria-live="polite">
          Auto-refresh every 60 seconds
          {lastUpdatedAt ? ` - last updated ${formatTime(lastUpdatedAt)}` : ""}
        </p>
        {error ? <p className="tex-error">{error}</p> : null}
      </section>

      <div className="tex-report-kpis" aria-label="Report KPIs">
        <ReportKpi
          label="Total spend"
          value={formatMoney(metrics.totalSpend, report.currency)}
          delta={metrics.totalDelta}
          inverse
        />
        <ReportKpi
          label="Expenses"
          value={String(metrics.expenseCount)}
          delta={metrics.countDelta}
          inverse
        />
        <ReportKpi
          label="Average"
          value={formatMoney(metrics.averageSpend, report.currency)}
          delta={metrics.averageDelta}
          inverse
        />
        <ReportKpi
          label="Outstanding"
          value={formatMoney(metrics.outstandingSpend, report.currency)}
        />
        <ReportKpi
          label="Flagged"
          value={`${metrics.flaggedRate.toFixed(1)}%`}
          delta={metrics.flaggedDelta}
          inverse
        />
      </div>

      <div className="tex-report-grid">
        <ReportBreakdown
          title="Spend by category"
          rows={metrics.categoryBreakdown}
          currency={report.currency}
        />
        <ReportBreakdown
          title="Spend by employee"
          rows={metrics.employeeBreakdown}
          currency={report.currency}
        />
        <ReportBreakdown
          title="Status funnel"
          rows={metrics.statusBreakdown}
          currency={report.currency}
        />
      </div>

      <section className="tex-form-panel" aria-labelledby="tex-report-ledger-title">
        <h3 id="tex-report-ledger-title">Filtered expense ledger</h3>
        {filteredExpenses.length ? (
          <div className="tex-report-ledger">
            {filteredExpenses.slice(0, 12).map((expense) => (
              <article key={expense.id} className="tex-report-row">
                <span>
                  <strong>{expense.vendor || expense.category || "Expense"}</strong>
                  <small>
                    {expense.expenseDate} · {expense.employeeName || "Unknown employee"}
                  </small>
                </span>
                <span>
                  <small>{expense.tripName || "No trip"}</small>
                  <b>{expense.status}</b>
                </span>
                <strong>{formatMoney(expense.baseAmount, report.currency)}</strong>
              </article>
            ))}
          </div>
        ) : (
          <p className="tex-empty-state">No expenses match this report filter.</p>
        )}
      </section>
    </section>
  );
}

function ReportKpi({
  label,
  value,
  delta,
  inverse = false
}: {
  label: string;
  value: string;
  delta?: number | null;
  inverse?: boolean;
}) {
  const hasDelta = typeof delta === "number" && Number.isFinite(delta);
  const positive = hasDelta ? delta > 0 : false;
  const favorable = hasDelta ? (inverse ? delta < 0 : delta > 0) : null;

  return (
    <article className="tex-report-kpi">
      <span>{label}</span>
      <strong>{value}</strong>
      {hasDelta ? (
        <small className={favorable ? "tex-good-delta" : "tex-bad-delta"}>
          {positive ? "+" : ""}
          {delta.toFixed(1)}% vs previous
        </small>
      ) : (
        <small>Current period</small>
      )}
    </article>
  );
}

function ReportBreakdown({
  title,
  rows,
  currency
}: {
  title: string;
  rows: BreakdownRow[];
  currency: string;
}) {
  const maxTotal = Math.max(...rows.map((row) => row.total), 1);

  return (
    <section className="tex-form-panel" aria-label={title}>
      <h3>{title}</h3>
      {rows.length ? (
        <div className="tex-report-breakdown">
          {rows.slice(0, 8).map((row) => (
            <article key={row.label}>
              <span>
                <strong>{row.label}</strong>
                <small>
                  {row.count} item{row.count === 1 ? "" : "s"}
                </small>
              </span>
              <div className="tex-report-bar-track" aria-hidden="true">
                <i style={{ width: `${Math.max(4, (row.total / maxTotal) * 100)}%` }} />
              </div>
              <b>{formatMoney(row.total, currency)}</b>
            </article>
          ))}
        </div>
      ) : (
        <p className="tex-empty-state">No report data for this breakdown.</p>
      )}
    </section>
  );
}

type BreakdownRow = {
  label: string;
  count: number;
  total: number;
};

function buildReportMetrics(expenses: TexReportExpense[], previousExpenses: TexReportExpense[]) {
  const spendable = expenses.filter((expense) => expense.status !== "rejected");
  const previousSpendable = previousExpenses.filter((expense) => expense.status !== "rejected");
  const totalSpend = sum(spendable.map((expense) => expense.baseAmount));
  const previousTotalSpend = sum(previousSpendable.map((expense) => expense.baseAmount));
  const expenseCount = expenses.length;
  const previousExpenseCount = previousExpenses.length;
  const averageSpend = expenseCount ? totalSpend / expenseCount : 0;
  const previousAverageSpend = previousExpenseCount ? previousTotalSpend / previousExpenseCount : 0;
  const flaggedRate = expenseCount
    ? (expenses.filter((expense) => expense.policyFlag).length / expenseCount) * 100
    : 0;
  const previousFlaggedRate = previousExpenseCount
    ? (previousExpenses.filter((expense) => expense.policyFlag).length / previousExpenseCount) * 100
    : 0;

  return {
    totalSpend,
    expenseCount,
    averageSpend,
    outstandingSpend: sum(
      expenses
        .filter((expense) => expense.status === "approved" && !expense.paidAt)
        .map((expense) => expense.baseAmount)
    ),
    flaggedRate,
    totalDelta: percentDelta(totalSpend, previousTotalSpend),
    countDelta: percentDelta(expenseCount, previousExpenseCount),
    averageDelta: percentDelta(averageSpend, previousAverageSpend),
    flaggedDelta: percentDelta(flaggedRate, previousFlaggedRate),
    categoryBreakdown: breakdownBy(expenses, (expense) => expense.category ?? "Uncategorized"),
    employeeBreakdown: breakdownBy(expenses, (expense) => expense.employeeName ?? "Unknown"),
    statusBreakdown: breakdownBy(expenses, (expense) => expense.status)
  };
}

function filterExpenses(expenses: TexReportExpense[], filters: ReportFilters) {
  return expenses.filter((expense) => {
    if (filters.category !== "all" && (expense.category ?? "Uncategorized") !== filters.category) {
      return false;
    }
    if (filters.status !== "all" && expense.status !== filters.status) {
      return false;
    }
    if (filters.employee !== "all" && (expense.employeeName ?? "Unknown") !== filters.employee) {
      return false;
    }
    return true;
  });
}

function breakdownBy(
  expenses: TexReportExpense[],
  labelFor: (expense: TexReportExpense) => string
) {
  const rows = new Map<string, BreakdownRow>();

  for (const expense of expenses) {
    const label = labelFor(expense);
    const row = rows.get(label) ?? { label, count: 0, total: 0 };
    row.count += 1;
    row.total += expense.status === "rejected" ? 0 : expense.baseAmount;
    rows.set(label, row);
  }

  return [...rows.values()].sort((a, b) => b.total - a.total || a.label.localeCompare(b.label));
}

function uniqueValues(values: Array<string | null | undefined>) {
  return [...new Set(values.map((value) => value || "Uncategorized"))].sort((a, b) =>
    a.localeCompare(b)
  );
}

function percentDelta(current: number, previous: number) {
  return previous === 0 ? null : ((current - previous) / previous) * 100;
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

function csvCell(value: string) {
  return `"${value.replaceAll('"', '""')}"`;
}

async function texFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/tex${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const body = (await response.json()) as { error?: string };

  if (!response.ok) {
    throw new Error(typeof body.error === "string" ? body.error : "TEX request failed.");
  }

  return body as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "TEX request failed.";
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("en", {
    hour: "2-digit",
    minute: "2-digit"
  }).format(value);
}

function formatMoney(value: number, currency: string) {
  return new Intl.NumberFormat("en", {
    style: "currency",
    currency,
    maximumFractionDigits: 0
  }).format(value);
}
