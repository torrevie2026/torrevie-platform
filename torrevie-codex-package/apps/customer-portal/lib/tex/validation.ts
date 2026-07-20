import { assertUuid, cleanOptional } from "./shared";

export function optionalNonNegative(value: number | null | undefined, label: string) {
  if (value === null || value === undefined || value === 0) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed) || parsed < 0) {
    throw new Error(`Trip ${label} cannot be negative.`);
  }

  return parsed;
}

export function optionalNumber(value: number | null | undefined, label: string) {
  if (value === null || value === undefined || value === 0) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isFinite(parsed)) {
    throw new Error(`Trip ${label} must be numeric.`);
  }

  return parsed;
}

export function optionalInteger(value: number | null | undefined, label: string) {
  if (value === null || value === undefined || value === 0) {
    return null;
  }

  const parsed = Number(value);

  if (!Number.isInteger(parsed) || parsed < 0) {
    throw new Error(`Trip ${label} must be a non-negative integer.`);
  }

  return parsed;
}

export function sanitizeFinancePeriod(month: number, year: number) {
  const parsedMonth = Number(month);
  const parsedYear = Number(year);

  if (!Number.isInteger(parsedMonth) || parsedMonth < 1 || parsedMonth > 12) {
    throw new Error("Invalid finance review month.");
  }

  if (!Number.isInteger(parsedYear) || parsedYear < 2020 || parsedYear > 2100) {
    throw new Error("Invalid finance review year.");
  }

  return { month: parsedMonth, year: parsedYear };
}

export function sanitizeReportPeriod(dateFrom?: string | null, dateTo?: string | null) {
  const now = new Date();
  const defaultFrom = `${now.getUTCFullYear()}-${String(now.getUTCMonth() + 1).padStart(2, "0")}-01`;
  const defaultTo = toIsoDate(new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth() + 1, 0)));
  const from = sanitizeIsoDate(dateFrom, "report start date") ?? defaultFrom;
  const to = sanitizeIsoDate(dateTo, "report end date") ?? defaultTo;

  if (from > to) {
    throw new Error("Report start date must be before the end date.");
  }

  const fromDate = parseReportIsoDate(from);
  const toDate = parseReportIsoDate(to);
  const dayCount = Math.max(1, Math.round((toDate.getTime() - fromDate.getTime()) / 86400000) + 1);
  const previousTo = new Date(fromDate.getTime() - 86400000);
  const previousFrom = new Date(previousTo.getTime() - (dayCount - 1) * 86400000);

  return {
    dateFrom: from,
    dateTo: to,
    previousDateFrom: toIsoDate(previousFrom),
    previousDateTo: toIsoDate(previousTo)
  };
}

export function sanitizeIsoDate(value: string | null | undefined, label: string) {
  if (!value) {
    return null;
  }

  if (!/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }

  return toIsoDate(parseReportIsoDate(value));
}

export function parseReportIsoDate(value: string) {
  const parsed = new Date(`${value}T00:00:00.000Z`);

  if (Number.isNaN(parsed.getTime()) || toIsoDate(parsed) !== value) {
    throw new Error("Invalid report date.");
  }

  return parsed;
}

export function toIsoDate(value: Date) {
  return value.toISOString().slice(0, 10);
}

export function sanitizeOptionalUuid(value: string | null | undefined, label: string) {
  const clean = cleanOptional(value);

  if (!clean) {
    return null;
  }

  assertUuid(clean, label);
  return clean;
}

export function sanitizeMonth(value: number) {
  const month = sanitizeInteger(value, "Month", 1);

  if (month < 1 || month > 12) {
    throw new Error("Month must be between 1 and 12.");
  }

  return month;
}

export function sanitizeYear(value: number) {
  const year = sanitizeInteger(value, "Year", new Date().getUTCFullYear());

  if (year < 2000 || year > 2200) {
    throw new Error("Year must be between 2000 and 2200.");
  }

  return year;
}

export function sanitizeInteger(value: number | null | undefined, label: string, fallback: number) {
  const numberValue = value === null || value === undefined ? fallback : Number(value);

  if (!Number.isInteger(numberValue)) {
    throw new Error(`${label} must be a whole number.`);
  }

  return numberValue;
}

export function sanitizeOptionalAmount(value: number | null | undefined, label: string) {
  if (value === null || value === undefined || value === 0) {
    return null;
  }

  return sanitizeRequiredAmount(value, label);
}

export function sanitizeRequiredAmount(value: number, label: string) {
  const amount = Number(value);

  if (!Number.isFinite(amount) || amount < 0) {
    throw new Error(`${label} must be a positive amount.`);
  }

  return Math.round(amount * 100) / 100;
}
