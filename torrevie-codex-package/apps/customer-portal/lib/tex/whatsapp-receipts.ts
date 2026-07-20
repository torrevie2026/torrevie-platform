import type { TexReceiptExtraction } from "../tex-ai";
import type { TexUnregisteredWhatsappSubmissionRow } from "./db-types";
import type { TexWebhookSubmissionInput } from "./types";
import { readRecord, readString } from "./whatsapp-review";

export function defaultReceiptCurrency(extraction: TexReceiptExtraction | null) {
  if (!extraction || extraction.currency?.trim()) {
    return extraction;
  }

  return {
    ...extraction,
    currency: "AED",
    notes: [
      extraction.notes,
      "Currency defaulted to AED because the receipt did not state a currency."
    ]
      .filter(Boolean)
      .join(" ")
  };
}

export function hasReceiptAttachmentForOcr(submission: Required<TexWebhookSubmissionInput>) {
  return Boolean(submission.extractedReceipt || submission.receiptFileId || submission.mediaUrl);
}

export function missingReceiptAttachmentError(submission: Required<TexWebhookSubmissionInput>) {
  const payload = readRecord(submission.payload);
  const media = readRecord(payload.media);
  const status = readString(media.status);
  const error = readString(media.error);

  if (error) {
    return error;
  }

  if (status === "download_failed") {
    return "WhatsApp sent media, but Quick Connect could not download the receipt attachment.";
  }

  if (status === "upload_failed") {
    return "WhatsApp media was received, but TEX could not store the receipt attachment.";
  }

  return "TEX received the WhatsApp message, but no receipt image or PDF bytes were attached to the ingest request.";
}

export function normalizeDuplicateVendor(value: string | null | undefined) {
  const clean = value
    ?.toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  return clean || null;
}

export function resolveKnownSenderWhatsappExpenseFields(
  submission: Required<TexWebhookSubmissionInput>,
  extraction: TexReceiptExtraction | null
) {
  const amount = extraction?.amount && extraction.amount > 0 ? extraction.amount : 0.01;
  const currency = extraction?.currency?.trim().toUpperCase() || "AED";
  const expenseDate = extraction?.expenseDate ?? new Date().toISOString().slice(0, 10);
  const requiresManualReview = amount === 0.01 || !extraction?.expenseDate;
  const notes = [
    extraction?.notes,
    submission.messageText,
    requiresManualReview
      ? "Receipt requires manager review because TEX could not read all key fields."
      : null
  ]
    .filter(Boolean)
    .join(" ");

  return {
    vendor: extraction?.vendor ?? null,
    expenseDate,
    amount,
    currency,
    notes,
    requiresManualReview
  };
}

export function resolveWhatsappExpenseFields(
  submission: TexUnregisteredWhatsappSubmissionRow,
  extraction: TexReceiptExtraction | null
) {
  const amount = extraction?.amount && extraction.amount > 0 ? extraction.amount : 0.01;
  const currency = extraction?.currency?.trim().toUpperCase() || "AED";
  const expenseDate = extraction?.expenseDate ?? new Date().toISOString().slice(0, 10);
  const notes = [
    extraction?.notes,
    submission.message_text,
    `Originally received from unregistered WhatsApp sender ${submission.sender_phone ?? submission.sender_raw ?? "unknown"}.`,
    amount === 0.01 ? "Receipt requires manual amount review." : null
  ]
    .filter(Boolean)
    .join(" ");

  return {
    vendor: extraction?.vendor ?? null,
    expenseDate,
    amount,
    currency,
    notes
  };
}
