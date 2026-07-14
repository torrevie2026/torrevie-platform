const GENERAL_EXPENSE_CATEGORIES = new Set([
  'general',
  'general expense',
  'maintenance',
  'repair',
  'repairs',
  'office',
  'office supplies',
  'supplies',
  'utilities',
  'admin',
  'administration',
  'tools',
  'other',
]);

export function isGeneralExpenseCategory(category: string | null | undefined) {
  return GENERAL_EXPENSE_CATEGORIES.has(String(category || '').trim().toLowerCase());
}

export function expenseApprovalBlockReason(expense: { trip_id?: string | null; category?: string | null }) {
  if (expense.trip_id || isGeneralExpenseCategory(expense.category)) return null;
  return 'Select a trip before approving, or classify this as a general/maintenance expense category.';
}
