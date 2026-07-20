export function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

export function cleanOptional(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

export function cleanRequired(value: string | null | undefined, label: string) {
  const clean = cleanOptional(value);

  if (!clean) {
    throw new Error(`${label} is required.`);
  }

  return clean;
}

export function formatMoney(amount: number, currency: string) {
  return `${new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(amount)} ${currency}`;
}

export function normalizePhoneDigits(value: string | null) {
  const digits = value?.replace(/\D/g, "") ?? "";
  return digits || null;
}

export function parseIsoDate(value: string, label: string) {
  const trimmed = value.trim();

  if (!/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    throw new Error(`Invalid ${label}.`);
  }

  const date = new Date(`${trimmed}T00:00:00Z`);

  if (Number.isNaN(date.getTime())) {
    throw new Error(`Invalid ${label}.`);
  }

  return trimmed;
}

export function requireSingleRow<Row>(rows: readonly Row[], label: string) {
  const [row] = rows;

  if (!row) {
    throw new Error(`Unable to find ${label}.`);
  }

  return row;
}

export function sum(values: number[]) {
  return values.reduce((total, value) => total + value, 0);
}

export function uniqueUuids(values: string[], label: string) {
  const unique = Array.from(new Set(values));

  for (const value of unique) {
    assertUuid(value, label);
  }

  return unique;
}
