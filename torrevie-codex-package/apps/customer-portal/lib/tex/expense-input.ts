import {
  cleanContentType,
  isAllowedReceiptType,
  receiptBufferFromBase64,
  sanitizeFileName
} from "./receipt-file";
import { cleanOptional, parseIsoDate } from "./shared";
import type {
  TexExpenseInput,
  TexExpenseStatus,
  TexExpenseUpdateInput,
  TexReceiptUploadInput,
  TexWebhookSubmissionInput
} from "./types";
import { optionalNonNegative } from "./validation";

export function sanitizeExpense(input: TexExpenseInput): Required<TexExpenseInput> {
  const amount = Number(input.amount);

  if (!Number.isFinite(amount) || amount <= 0) {
    throw new Error("Expense amount must be greater than zero.");
  }

  const expenseDate = parseIsoDate(input.expenseDate, "expense date");
  const currency = input.currency.trim().toUpperCase();

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Expense currency must be a three-letter ISO code.");
  }

  return {
    employeeProfileId: cleanOptional(input.employeeProfileId),
    vendor: cleanOptional(input.vendor),
    expenseDate,
    amount,
    currency,
    category: cleanOptional(input.category),
    tripId: cleanOptional(input.tripId),
    tripLegId: cleanOptional(input.tripLegId),
    notes: cleanOptional(input.notes),
    paymentMethod: cleanOptional(input.paymentMethod),
    taxIdNumber: cleanOptional(input.taxIdNumber),
    taxAmount: optionalNonNegative(input.taxAmount, "tax amount"),
    receiptFileId: cleanOptional(input.receiptFileId),
    extractionSource: sanitizeExtractionSource(input.extractionSource),
    extractionConfidence: sanitizeExtractionConfidence(input.extractionConfidence),
    extractionPayload:
      input.extractionPayload &&
      typeof input.extractionPayload === "object" &&
      !Array.isArray(input.extractionPayload)
        ? input.extractionPayload
        : {},
    source: cleanOptional(input.source) ?? "web"
  };
}

export function sanitizeExpenseUpdate(input: TexExpenseUpdateInput): Required<TexExpenseInput> {
  if (!input.expenseDate) {
    throw new Error("Expense date is required.");
  }

  if (input.amount === undefined || input.amount === null) {
    throw new Error("Expense amount is required.");
  }

  if (!input.currency) {
    throw new Error("Expense currency is required.");
  }

  return sanitizeExpense({
    employeeProfileId: input.employeeProfileId,
    vendor: input.vendor,
    expenseDate: input.expenseDate,
    amount: input.amount,
    currency: input.currency,
    category: input.category,
    tripId: input.tripId,
    tripLegId: input.tripLegId,
    notes: input.notes,
    paymentMethod: input.paymentMethod,
    taxIdNumber: input.taxIdNumber,
    taxAmount: input.taxAmount,
    receiptFileId: input.receiptFileId,
    extractionSource: input.extractionSource ?? "manual",
    extractionConfidence: input.extractionConfidence ?? null,
    extractionPayload: input.extractionPayload ?? {},
    source: input.source ?? "web"
  });
}

export function sanitizeReceiptUpload(input: TexReceiptUploadInput) {
  const contentType = cleanContentType(input.contentType);
  if (!isAllowedReceiptType(contentType)) {
    throw new Error("Unsupported receipt file type.");
  }

  const buffer = receiptBufferFromBase64(input.dataBase64);
  return {
    fileName: sanitizeFileName(input.fileName),
    contentType,
    buffer
  };
}

export function sanitizeWebhookSubmission(
  input: TexWebhookSubmissionInput
): Required<TexWebhookSubmissionInput> {
  return {
    senderRaw: cleanOptional(input.senderRaw),
    senderPhone: cleanOptional(input.senderPhone),
    whatsappChatJid: cleanOptional(input.whatsappChatJid),
    messageId: cleanOptional(input.messageId),
    sessionId: cleanOptional(input.sessionId),
    messageText: cleanOptional(input.messageText),
    receiptFileId: cleanOptional(input.receiptFileId),
    mediaUrl: cleanOptional(input.mediaUrl),
    mediaMimeType: cleanOptional(input.mediaMimeType),
    extractedReceipt: input.extractedReceipt ?? null,
    payload: input.payload ?? {}
  };
}

function sanitizeExtractionSource(
  value: TexExpenseInput["extractionSource"]
): "manual" | "web_ai" | "whatsapp_ai" {
  if (value === "web_ai" || value === "whatsapp_ai") {
    return value;
  }

  return "manual";
}

function sanitizeExtractionConfidence(value: unknown) {
  if (value == null || value === "") {
    return null;
  }

  const parsed = Number(value);
  if (!Number.isFinite(parsed)) {
    throw new Error("Extraction confidence must be numeric.");
  }

  return Math.min(Math.max(parsed, 0), 1);
}

export function assertExpenseStatus(
  status: string
): asserts status is Exclude<TexExpenseStatus, "pending"> {
  if (status !== "approved" && status !== "rejected" && status !== "paid") {
    throw new Error(`Unsupported TEX expense status: ${status}`);
  }
}
