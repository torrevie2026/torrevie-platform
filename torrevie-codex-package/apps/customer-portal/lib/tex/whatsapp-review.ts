import type { TexReceiptExtraction } from "../tex-ai";
import type { TexUnregisteredWhatsappSubmissionRow } from "./db-types";
import type {
  TexReceiptBatchResult,
  TexUnregisteredWhatsappSubmission,
  TexWhatsappReceiptResult
} from "./types";

export function buildReceiptBatchResult(receipts: TexReceiptExtraction[]): TexReceiptBatchResult {
  return {
    multipleReceipts: true,
    receipts
  };
}

export function parseSubmissionExtractions(value: unknown): TexReceiptExtraction[] {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return [];
  }

  const record = value as { receipts?: unknown };
  if (Array.isArray(record.receipts)) {
    return record.receipts
      .map((item) => parseSubmissionExtraction(item))
      .filter((item): item is TexReceiptExtraction => Boolean(item));
  }

  const single = parseSubmissionExtraction(value);
  return single ? [single] : [];
}

export function parseSubmissionOcrResult(
  value: unknown
): TexReceiptExtraction | TexReceiptBatchResult | null {
  const receipts = parseSubmissionExtractions(value);
  if (receipts.length > 1) {
    return buildReceiptBatchResult(receipts);
  }

  return receipts[0] ?? null;
}

export function readRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

export function readString(value: unknown) {
  return typeof value === "string" && value.trim() ? value.trim() : null;
}

export function whatsappIntakeStatus(
  row: TexUnregisteredWhatsappSubmissionRow,
  mediaStatus: string | null
) {
  if (row.resolved_expense_id) {
    return "Expense created";
  }

  if (row.message_type === "text") {
    return "Message received";
  }

  if (!row.receipt_file_id && mediaStatus === "download_failed") {
    return "Media download failed";
  }

  if (!row.receipt_file_id && mediaStatus === "upload_failed") {
    return "Media upload failed";
  }

  if (row.message_type === "receipt" && !row.receipt_file_id && !row.media_url) {
    return "Receipt attachment missing";
  }

  if (row.receipt_file_id) {
    return row.ocr_status === "extracted" ? "Receipt processed" : "Receipt attached";
  }

  if (row.ocr_status === "pending" || row.ocr_status === "processing") {
    return "OCR processing";
  }

  if (row.ocr_status === "failed") {
    return "OCR failed";
  }

  if (row.ocr_status === "manual_review") {
    return "Needs manual review";
  }

  return "Received";
}

export function mapUnregisteredWhatsappSubmission(
  row: TexUnregisteredWhatsappSubmissionRow
): TexUnregisteredWhatsappSubmission {
  const payload = readRecord(row.payload);
  const media = readRecord(payload.media);
  const mediaStatus = readString(media.status);
  const mediaError = readString(media.error);

  return {
    id: row.id,
    status: row.status,
    senderRaw: row.sender_raw,
    senderPhone: row.sender_phone,
    whatsappChatJid: row.whatsapp_chat_jid,
    messageId: row.message_id,
    sessionId: row.session_id,
    messageText: row.message_text,
    receiptFileId: row.receipt_file_id,
    mediaUrl: row.media_url,
    mediaMimeType: row.media_mime_type,
    mediaStatus,
    mediaError,
    messageType: row.message_type,
    ocrStatus: normalizeWhatsappReviewOcrStatus(row, mediaStatus),
    ocrResult: parseSubmissionOcrResult(row.ocr_result),
    ocrError: row.ocr_error,
    whatsappReplyText: row.whatsapp_reply_text,
    intakeStatus: whatsappIntakeStatus(row, mediaStatus),
    duplicateHint: whatsappDuplicateHint(row),
    payload,
    resolvedExpenseId: row.resolved_expense_id,
    resolvedEmployeeProfileId: row.resolved_employee_profile_id,
    resolvedAt: row.resolved_at,
    createdAt: row.created_at
  };
}

function parseSubmissionExtraction(value: unknown): TexReceiptExtraction | null {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return null;
  }

  const record = value as Partial<TexReceiptExtraction>;
  if (!record.expenseDate && !record.amount && !record.vendor) {
    return null;
  }

  return {
    vendor: typeof record.vendor === "string" ? record.vendor : null,
    expenseDate: typeof record.expenseDate === "string" ? record.expenseDate : null,
    amount: typeof record.amount === "number" ? record.amount : null,
    currency: typeof record.currency === "string" ? record.currency : null,
    category: typeof record.category === "string" ? record.category : null,
    taxAmount: typeof record.taxAmount === "number" ? record.taxAmount : null,
    taxIdNumber: typeof record.taxIdNumber === "string" ? record.taxIdNumber : null,
    confidence: typeof record.confidence === "number" ? record.confidence : 0,
    notes: typeof record.notes === "string" ? record.notes : null
  };
}

function normalizeWhatsappReviewOcrStatus(
  row: TexUnregisteredWhatsappSubmissionRow,
  mediaStatus: string | null
): TexWhatsappReceiptResult["ocrStatus"] {
  if (
    row.message_type === "receipt" &&
    !row.receipt_file_id &&
    !row.media_url &&
    (row.ocr_status === "pending" || row.ocr_status === "processing" || mediaStatus !== "stored")
  ) {
    return "manual_review";
  }

  return row.ocr_status;
}

function whatsappDuplicateHint(row: TexUnregisteredWhatsappSubmissionRow) {
  const result = parseSubmissionExtractions(row.ocr_result)[0] ?? null;
  if (!result?.vendor && !result?.amount && !result?.expenseDate) {
    return null;
  }

  return [result.vendor, result.expenseDate, result.amount, result.currency ?? "AED"]
    .filter((value) => value !== null && value !== undefined && value !== "")
    .join(" / ");
}
