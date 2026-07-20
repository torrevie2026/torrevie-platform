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
    return `Receipt received but auto-rejected as a likely duplicate of ${input.duplicate?.vendor ?? "an existing expense"}.`;
  }

  const fields = whatsappOcrSummary(input.extraction);
  const duplicateText = input.duplicate
    ? " It is flagged as a possible duplicate for manager review."
    : "";
  const reviewText = input.extractionError
    ? " TEX could not read all receipt fields, so the manager must review the values."
    : "";

  return `Receipt received. OCR: ${fields}. Status: pending manager approval.${duplicateText}${reviewText}`;
}

export function buildExpenseStatusReply(
  row: Pick<TexWhatsappExpenseStatusReplyRow, "vendor" | "amount" | "currency" | "expense_date">,
  status: Exclude<TexExpenseStatus, "pending">
) {
  const receipt = whatsappExpenseSummary(row);

  if (status === "approved") {
    return `Receipt approved: ${receipt}. Status: approved and pending payment.`;
  }

  if (status === "paid") {
    return `Receipt paid: ${receipt}. Status: paid.`;
  }

  return `Receipt rejected: ${receipt}. Please contact your manager for details.`;
}

export function isQuickConnectSubmissionPayload(payload: unknown) {
  const record = readRecord(payload);
  const provider = readString(record.provider)?.toLowerCase();
  const source = readString(record.source)?.toLowerCase();
  return provider === "quickconnect" || source === "quick_connect" || record.quick_connect === true;
}

function whatsappOcrSummary(extraction: TexReceiptExtraction | null) {
  return [
    `vendor ${extraction?.vendor ?? "not read"}`,
    `date ${extraction?.expenseDate ?? "not read"}`,
    `amount ${
      extraction?.amount != null
        ? formatMoney(extraction.amount, extraction.currency?.trim().toUpperCase() || "AED")
        : "not read"
    }`,
    `VAT ${extraction?.taxAmount != null ? extraction.taxAmount : "not read"}`,
    `TRN ${extraction?.taxIdNumber ?? "not read"}`
  ].join(", ");
}

function whatsappExpenseSummary(
  row: Pick<TexWhatsappExpenseStatusReplyRow, "vendor" | "amount" | "currency" | "expense_date">
) {
  return [row.vendor ?? "receipt", row.expense_date, formatMoney(row.amount, row.currency)]
    .filter(Boolean)
    .join(" / ");
}
