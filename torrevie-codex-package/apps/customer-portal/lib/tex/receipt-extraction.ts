import type { TenantQueryClient } from "@torrevie/tenant-context";
import { extractReceiptWithAI, extractReceiptsWithAI, type TexReceiptExtraction } from "../tex-ai";
import type { TexUnregisteredWhatsappSubmissionRow } from "./db-types";
import {
  cleanContentType,
  isOcrSupportedReceiptType,
  receiptBufferFromBase64
} from "./receipt-file";
import { downloadReceiptObject } from "./receipt-storage";
import { cleanOptional, requireSingleRow } from "./shared";
import type { TexReceiptUploadInput, TexWebhookSubmissionInput } from "./types";
import { parseSubmissionExtractions } from "./whatsapp-review";

export async function parseTexReceiptUpload(
  input: Pick<TexReceiptUploadInput, "contentType" | "dataBase64">
): Promise<TexReceiptExtraction> {
  const contentType = cleanContentType(input.contentType);
  if (!isOcrSupportedReceiptType(contentType)) {
    throw new Error("OCR currently supports image and PDF receipts only.");
  }

  const buffer = receiptBufferFromBase64(input.dataBase64);
  return extractReceiptWithAI(`data:${contentType};base64,${buffer.toString("base64")}`);
}

export async function extractReceiptForSubmission(
  client: TenantQueryClient,
  submission: Required<TexWebhookSubmissionInput>
) {
  let extraction: TexReceiptExtraction | null = submission.extractedReceipt;
  let extractions: TexReceiptExtraction[] = extraction ? [extraction] : [];
  let extractionError: string | null = null;

  if (!extraction && submission.mediaUrl) {
    try {
      extractions = await extractReceiptsWithAI(submission.mediaUrl);
      extraction = extractions[0] ?? null;
    } catch (error) {
      extractionError = error instanceof Error ? error.message : "Receipt extraction failed.";
    }
  }

  if (!extraction && submission.receiptFileId) {
    try {
      extractions = await extractStoredReceiptsWithAI(client, submission.receiptFileId);
      extraction = extractions[0] ?? null;
      extractionError = null;
    } catch (error) {
      extractionError =
        error instanceof Error ? error.message : "Stored receipt extraction failed.";
    }
  }

  return {
    extraction,
    extractions: extractions.length > 0 ? extractions : extraction ? [extraction] : [],
    extractionError,
    multipleReceipts: extractions.length > 1
  };
}

export async function extractStoredReceiptsWithAI(
  client: TenantQueryClient,
  receiptFileId: string
) {
  const result = await client.query<{
    storage_path: string;
    content_type: string;
  }>(
    `
      select storage_path, content_type
      from public.files
      where tenant_id = public.current_tenant_id()
        and id = $1
      limit 1
    `,
    [receiptFileId]
  );
  const row = requireSingleRow(result.rows, "receipt file");
  const contentType = cleanContentType(row.content_type);
  if (!isOcrSupportedReceiptType(contentType)) {
    throw new Error("OCR currently supports image and PDF receipts only.");
  }

  const buffer = await downloadReceiptObject(row.storage_path);
  return extractReceiptsWithAI(`data:${contentType};base64,${buffer.toString("base64")}`);
}

export async function extractionForWhatsappReviewSubmission(
  client: TenantQueryClient,
  submission: TexUnregisteredWhatsappSubmissionRow
) {
  const existing = parseSubmissionExtractions(submission.ocr_result);
  if (existing.length > 0) {
    return {
      extraction: existing[0] ?? null,
      extractions: existing,
      extractionError: cleanOptional(submission.ocr_error),
      multipleReceipts: existing.length > 1
    };
  }

  if (submission.media_url) {
    try {
      const receipts = await extractReceiptsWithAI(submission.media_url);
      return {
        extraction: receipts[0] ?? null,
        extractions: receipts,
        extractionError: null,
        multipleReceipts: receipts.length > 1
      };
    } catch (error) {
      return {
        extraction: null,
        extractions: [],
        extractionError: error instanceof Error ? error.message : "Receipt extraction failed.",
        multipleReceipts: false
      };
    }
  }

  if (submission.receipt_file_id) {
    try {
      const receipts = await extractStoredReceiptsWithAI(client, submission.receipt_file_id);
      return {
        extraction: receipts[0] ?? null,
        extractions: receipts,
        extractionError: null,
        multipleReceipts: receipts.length > 1
      };
    } catch (error) {
      return {
        extraction: null,
        extractions: [],
        extractionError:
          error instanceof Error ? error.message : "Stored receipt extraction failed.",
        multipleReceipts: false
      };
    }
  }

  return {
    extraction: null,
    extractions: [],
    extractionError: "No receipt image or PDF is attached to this WhatsApp submission.",
    multipleReceipts: false
  };
}
