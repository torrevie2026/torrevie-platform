// Receipt-date sanity bounds.
// Receipts older than MAX_PAST_DAYS or set in the future are treated as unreliable
// (typically an OCR misread of the year).

export const MAX_PAST_DAYS = 180;
export const MAX_FUTURE_DAYS = 1; // tolerate small timezone slop

export type DateWarning = 'unreadable' | 'too_old' | 'future';

export interface DateValidationResult {
  /** Parsed Date, or null if input was invalid/out of range. */
  date: Date | null;
  warning: DateWarning | null;
}

/**
 * Parse a "YYYY-MM-DD" string and validate it falls within a sane window
 * (not in the future, not >MAX_PAST_DAYS old).
 */
export function parseAndValidateReceiptDate(
  input: string | null | undefined,
  today: Date = new Date(),
): DateValidationResult {
  if (!input) return { date: null, warning: 'unreadable' };
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(input.trim());
  if (!m) return { date: null, warning: 'unreadable' };
  const d = new Date(`${input.trim()}T00:00:00Z`);
  if (Number.isNaN(d.getTime())) return { date: null, warning: 'unreadable' };

  const todayUtc = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), today.getUTCDate()));
  const diffDays = Math.round((todayUtc.getTime() - d.getTime()) / 86_400_000);

  if (diffDays < -MAX_FUTURE_DAYS) return { date: null, warning: 'future' };
  if (diffDays > MAX_PAST_DAYS) return { date: null, warning: 'too_old' };
  return { date: d, warning: null };
}

export function describeDateWarning(w: DateWarning): string {
  switch (w) {
    case 'unreadable': return "Couldn't read the date on this receipt — please confirm.";
    case 'too_old': return "The date on this receipt looks unusually old — please confirm.";
    case 'future': return "The date on this receipt is in the future — please confirm.";
  }
}
