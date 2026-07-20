import { cleanRequired } from "./shared";
import type { TexBudgetInput, TexExpenseCategoryInput, TexSpendPolicyInput } from "./types";
import {
  sanitizeInteger,
  sanitizeMonth,
  sanitizeOptionalAmount,
  sanitizeRequiredAmount,
  sanitizeYear
} from "./validation";

export function sanitizeExpenseCategoryInput(input: TexExpenseCategoryInput) {
  return {
    name: cleanRequired(input.name, "Category name"),
    isActive: input.isActive ?? true,
    sortOrder: sanitizeInteger(input.sortOrder, "Sort order", 0)
  };
}

export function sanitizeSpendPolicyInput(
  input: TexSpendPolicyInput
): Required<TexSpendPolicyInput> {
  return {
    category: cleanRequired(input.category, "Policy category"),
    dailyLimit: sanitizeOptionalAmount(input.dailyLimit, "Daily limit"),
    monthlyLimit: sanitizeOptionalAmount(input.monthlyLimit, "Monthly limit"),
    requiresNotesAbove: sanitizeOptionalAmount(input.requiresNotesAbove, "Notes threshold"),
    isBlocked: input.isBlocked ?? false
  };
}

export function sanitizeBudgetInput(input: TexBudgetInput) {
  return {
    department: cleanRequired(input.department, "Department"),
    month: sanitizeMonth(input.month),
    year: sanitizeYear(input.year),
    budgetAmount: sanitizeRequiredAmount(input.budgetAmount, "Budget amount")
  };
}
