import type { TexReceiptExtraction } from "../tex-ai";
import type { TexDuplicateCandidateRow, TexWhatsappExpenseStatusReplyRow } from "./db-types";
import { formatMoney } from "./shared";
import type { TexExpenseStatus, TexWebhookSubmissionInput } from "./types";
import { readRecord, readString } from "./whatsapp-review";

export function classifyWhatsappMessage(
  submission: Required<TexWebhookSubmissionInput>
): "receipt" | "status" | "text" {
  if (submission.messageText?.trim().toUpperCase() === "STATUS") {
    return "status";
  }

  const media = readRecord(submission.payload.media);
  return submission.mediaUrl || submission.receiptFileId || media.expected === true
    ? "receipt"
    : "text";
}

export function buildWhatsappReceiptSubmittedReply(input: {
  extraction: TexReceiptExtraction | null;
  duplicate: TexDuplicateCandidateRow | null;
  extractionError: string | null;
  shouldAutoReject: boolean;
}) {
  if (input.shouldAutoReject) {
    return [
      "TEX receipt auto-rejected",
      "",
      "This receipt was detected as a duplicate.",
      `Matched receipt: ${duplicateSummary(input.duplicate)}`,
      "",
      "Status: rejected.",
      "Please contact your manager if this is not correct."
    ].join("\n");
  }

  if (input.duplicate) {
    return [
      "TEX possible duplicate",
      "",
      "This receipt looks similar to an existing expense.",
      `Matched receipt: ${duplicateSummary(input.duplicate)}`,
      "",
      "Status: pending manager review.",
      "Your manager will confirm whether it should be approved or rejected."
    ].join("\n");
  }

  const hasReadableFields = Boolean(
    input.extraction?.vendor || input.extraction?.expenseDate || input.extraction?.amount
  );

  if (!hasReadableFields || input.extractionError) {
    return [
      "TEX receipt received",
      "",
      "We received your receipt, but TEX could not read all key details from the file.",
      "",
      `Read: ${readableFieldsSummary(input.extraction)}`,
      `Needs review: ${missingFieldsSummary(input.extraction)}`,
      "",
      "Status: pending manager review.",
      "Your manager can correct the details in TEX before approval."
    ].join("\n");
  }

  return [
    "TEX receipt received",
    "",
    `Merchant: ${input.extraction?.vendor ?? "Needs review"}`,
    `Date: ${input.extraction?.expenseDate ?? "Needs review"}`,
    `Amount: ${amountSummary(input.extraction)}`,
    `VAT/TRN: ${vatSummary(input.extraction)}`,
    "",
    "Status: pending manager approval.",
    "You will receive another WhatsApp update after approval or rejection."
  ].join("\n");
}

export function buildExpenseStatusReply(
  row: Pick<
    TexWhatsappExpenseStatusReplyRow,
    "vendor" | "amount" | "currency" | "expense_date" | "rejected_reason"
  >,
  status: Exclude<TexExpenseStatus, "pending">
) {
  const receipt = receiptLines(row);

  if (status === "approved") {
    return [
      "TEX receipt approved",
      "",
      ...receipt,
      "",
      "Status: approved and pending payment."
    ].join("\n");
  }

  if (status === "paid") {
    return ["TEX receipt paid", "", ...receipt, "", "Status: paid."].join("\n");
  }

  return [
    "TEX receipt rejected",
    "",
    ...receipt,
    "",
    "Status: rejected.",
    `Reason: ${row.rejected_reason?.trim() || "Please contact your manager for details."}`
  ].join("\n");
}

export function isQuickConnectSubmissionPayload(payload: unknown) {
  const record = readRecord(payload);
  const provider = readString(record.provider)?.toLowerCase();
  const source = readString(record.source)?.toLowerCase();
  return provider === "quickconnect" || source === "quick_connect" || record.quick_connect === true;
}

function amountSummary(extraction: TexReceiptExtraction | null) {
  return extraction?.amount != null
    ? formatMoney(extraction.amount, extraction.currency?.trim().toUpperCase() || "AED")
    : "Needs review";
}

function vatSummary(extraction: TexReceiptExtraction | null) {
  const vat = extraction?.taxAmount != null ? `VAT ${extraction.taxAmount}` : null;
  const trn = extraction?.taxIdNumber ? `TRN ${extraction.taxIdNumber}` : null;
  return [vat, trn].filter(Boolean).join(" / ") || "Not read";
}

function readableFieldsSummary(extraction: TexReceiptExtraction | null) {
  const fields = [
    extraction?.vendor ? "merchant" : null,
    extraction?.expenseDate ? "date" : null,
    extraction?.amount != null ? "amount" : null,
    extraction?.taxAmount != null ? "VAT" : null,
    extraction?.taxIdNumber ? "TRN" : null
  ].filter(Boolean);
  return fields.join(", ") || "none";
}

function missingFieldsSummary(extraction: TexReceiptExtraction | null) {
  const fields = [
    extraction?.vendor ? null : "merchant",
    extraction?.expenseDate ? null : "date",
    extraction?.amount != null ? null : "amount",
    extraction?.taxAmount != null ? null : "VAT",
    extraction?.taxIdNumber ? null : "TRN"
  ].filter(Boolean);
  return fields.join(", ") || "none";
}

function duplicateSummary(duplicate: TexDuplicateCandidateRow | null) {
  return duplicate?.vendor ?? "an existing expense";
}

function receiptLines(
  row: Pick<TexWhatsappExpenseStatusReplyRow, "vendor" | "amount" | "currency" | "expense_date">
) {
  return [
    `Merchant: ${row.vendor ?? "Receipt"}`,
    `Date: ${row.expense_date}`,
    `Amount: ${formatMoney(row.amount, row.currency)}`
  ];
}
