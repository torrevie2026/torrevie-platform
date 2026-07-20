import { assertUuid, cleanOptional, cleanRequired, parseIsoDate } from "./shared";
import type {
  TexDriverAdvanceInput,
  TexEmployeeProfile,
  TexEmployeeProfileInput,
  TexNotificationInput,
  TexTeamInput
} from "./types";
import { optionalNonNegative, sanitizeFinancePeriod, sanitizeOptionalUuid } from "./validation";

export function sanitizeSubmissionFrequency(
  value: TexEmployeeProfileInput["submissionFrequency"]
): TexEmployeeProfile["submissionFrequency"] {
  if (value === "daily" || value === "weekly" || value === "monthly" || value === "realtime") {
    return value;
  }

  return "realtime";
}

export function sanitizeTeamInput(input: TexTeamInput): {
  name: string;
  description: string | null;
  managerEmployeeProfileId: string | null;
  memberEmployeeProfileIds: string[];
} {
  const name = cleanRequired(input.name, "Team name");
  const description = cleanOptional(input.description);
  const managerEmployeeProfileId = sanitizeOptionalUuid(
    input.managerEmployeeProfileId,
    "team manager employee profile id"
  );
  const memberEmployeeProfileIds = Array.from(
    new Set(
      (input.memberEmployeeProfileIds ?? [])
        .map((id) => sanitizeOptionalUuid(id, "team member employee profile id"))
        .filter((id): id is string => Boolean(id))
    )
  );

  return {
    name,
    description,
    managerEmployeeProfileId,
    memberEmployeeProfileIds
  };
}

export function sanitizeDriverAdvance(
  input: TexDriverAdvanceInput
): Required<TexDriverAdvanceInput> {
  const employeeProfileId = cleanRequired(input.employeeProfileId, "Driver employee profile");
  assertUuid(employeeProfileId, "driver employee profile id");

  const amount = Number(input.amount);
  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Driver advance amount must be greater than zero.");
  }

  const currency = cleanOptional(input.currency)?.toUpperCase() ?? "AED";
  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Driver advance currency must be a three-letter ISO code.");
  }

  const now = new Date();
  const advanceDate = input.advanceDate
    ? parseIsoDate(input.advanceDate, "driver advance date")
    : now.toISOString().slice(0, 10);
  const month = input.month ?? Number(advanceDate.slice(5, 7));
  const year = input.year ?? Number(advanceDate.slice(0, 4));
  const period = sanitizeFinancePeriod(month, year);

  return {
    employeeProfileId,
    amount,
    currency,
    baseAmount: optionalNonNegative(input.baseAmount, "driver advance base amount") ?? amount,
    advanceDate,
    month: period.month,
    year: period.year,
    notes: cleanOptional(input.notes)
  };
}

export function sanitizeNotification(input: TexNotificationInput): Required<TexNotificationInput> {
  const userId = cleanOptional(input.userId);
  const relatedExpenseId = cleanOptional(input.relatedExpenseId);
  const relatedTripId = cleanOptional(input.relatedTripId);

  if (userId) {
    assertUuid(userId, "notification user id");
  }

  if (relatedExpenseId) {
    assertUuid(relatedExpenseId, "related expense id");
  }

  if (relatedTripId) {
    assertUuid(relatedTripId, "related trip id");
  }

  return {
    userId,
    title: cleanRequired(input.title, "Notification title"),
    body: cleanOptional(input.body),
    type: cleanOptional(input.type),
    relatedExpenseId,
    relatedTripId
  };
}
