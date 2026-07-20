import type { TexReportWorkspace } from "./types";

export function sanitizeEmailRecipients(values: readonly string[]) {
  return values
    .flatMap((value) => String(value).split(/[,\n;]/))
    .map((value) => value.trim().toLowerCase())
    .filter((value, index, all) => isEmailAddress(value) && all.indexOf(value) === index);
}

export function summarizeEmailReport(report: TexReportWorkspace) {
  const expenses = report.expenses.filter((expense) => expense.status !== "rejected");

  return {
    totalSpend: sum(expenses.map((expense) => expense.baseAmount)),
    expenseCount: report.expenses.length,
    pendingCount: report.expenses.filter((expense) => expense.status === "pending").length,
    approvedCount: report.expenses.filter((expense) => expense.status === "approved").length,
    paidCount: report.expenses.filter((expense) => expense.status === "paid").length,
    flaggedCount: report.expenses.filter((expense) => expense.policyFlag).length
  };
}

export function escapeHtml(value: string) {
  return value.replace(/[&<>"']/g, (character) => {
    switch (character) {
      case "&":
        return "&amp;";
      case "<":
        return "&lt;";
      case ">":
        return "&gt;";
      case '"':
        return "&quot;";
      default:
        return "&#39;";
    }
  });
}

function isEmailAddress(value: string) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(value);
}

function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}
