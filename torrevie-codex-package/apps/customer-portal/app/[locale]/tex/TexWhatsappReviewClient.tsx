"use client";

import { useCallback, useMemo, useState } from "react";
import type { TexBootstrap, TexUnregisteredWhatsappSubmission } from "../../../lib/tex";
import { useTexAutoRefresh } from "./useTexAutoRefresh";

type TexWhatsappReviewClientProps = {
  employees: TexBootstrap["employeeProfiles"];
  initialSubmissions: TexUnregisteredWhatsappSubmission[];
};

type ResolveMode = "existing_employee" | "new_employee";
type OcrReceipt = {
  vendor: string | null;
  expenseDate: string | null;
  amount: number | null;
  currency: string | null;
  taxAmount: number | null;
  taxIdNumber: string | null;
};

export function TexWhatsappReviewClient({
  employees,
  initialSubmissions
}: TexWhatsappReviewClientProps) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [selectedEmployees, setSelectedEmployees] = useState<Record<string, string>>({});
  const [newEmployeeNames, setNewEmployeeNames] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [lastUpdatedAt, setLastUpdatedAt] = useState<Date | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.isActive),
    [employees]
  );

  const refreshQueue = useCallback(async () => {
    setIsRefreshing(true);
    try {
      const response = await texFetch<{ submissions: TexUnregisteredWhatsappSubmission[] }>(
        "/unregistered-whatsapp?status=open"
      );
      setSubmissions(response.submissions);
      setLastUpdatedAt(new Date());
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsRefreshing(false);
    }
  }, []);

  useTexAutoRefresh({
    enabled: busyId === null,
    intervalMs: 15000,
    onRefresh: refreshQueue
  });

  async function resolveSubmission(
    submission: TexUnregisteredWhatsappSubmission,
    mode: ResolveMode
  ) {
    const previousSubmissions = submissions;
    const previousSelectedEmployees = selectedEmployees;
    const previousNewEmployeeNames = newEmployeeNames;

    setBusyId(submission.id);
    setNotice(null);
    setError(null);
    setSubmissions((current) => current.filter((item) => item.id !== submission.id));

    try {
      const payload =
        mode === "existing_employee"
          ? {
              mode,
              employeeProfileId:
                selectedEmployees[submission.id] ?? submission.resolvedEmployeeProfileId
            }
          : {
              mode,
              employeeName: newEmployeeNames[submission.id],
              phoneNumber: submission.senderPhone ?? submission.senderRaw ?? ""
            };

      await texFetch(`/unregistered-whatsapp/${submission.id}/resolve`, {
        method: "PATCH",
        body: JSON.stringify(payload)
      });
      setNotice("WhatsApp submission assigned.");
      setSelectedEmployees((current) => {
        const next = { ...current };
        delete next[submission.id];
        return next;
      });
      setNewEmployeeNames((current) => {
        const next = { ...current };
        delete next[submission.id];
        return next;
      });
      setLastUpdatedAt(new Date());
      void refreshQueue();
    } catch (caught) {
      setSubmissions(previousSubmissions);
      setSelectedEmployees(previousSelectedEmployees);
      setNewEmployeeNames(previousNewEmployeeNames);
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  async function ignoreSubmission(submission: TexUnregisteredWhatsappSubmission) {
    const previousSubmissions = submissions;

    setBusyId(submission.id);
    setNotice(null);
    setError(null);
    setSubmissions((current) => current.filter((item) => item.id !== submission.id));

    try {
      await texFetch(`/unregistered-whatsapp/${submission.id}/ignore`, {
        method: "PATCH",
        body: JSON.stringify({ reason: "Ignored from TEX WhatsApp review queue" })
      });
      setNotice("WhatsApp submission ignored.");
      setLastUpdatedAt(new Date());
      void refreshQueue();
    } catch (caught) {
      setSubmissions(previousSubmissions);
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      className={`tex-work-panel tex-whatsapp-review${isRefreshing ? " tex-live-refreshing" : ""}`}
      aria-label="Unregistered WhatsApp review"
      aria-busy={isRefreshing}
    >
      <div className="section-heading-row">
        <div>
          <h2>WhatsApp review</h2>
          <p>Assign unknown senders to employees or clear submissions that do not belong in TEX.</p>
        </div>
      </div>
      <p className="tex-refresh-meta" aria-live="polite">
        {isRefreshing ? "Syncing WhatsApp submissions..." : "Synced automatically every 15 seconds"}
        {lastUpdatedAt ? ` - last updated ${formatTime(lastUpdatedAt)}` : ""}
      </p>

      {notice ? <p className="tex-notice">{notice}</p> : null}
      {error ? <p className="tex-error">{error}</p> : null}

      {submissions.length === 0 ? (
        <div className="tex-empty-state">
          No unregistered WhatsApp submissions waiting for review.
        </div>
      ) : (
        <div className="tex-whatsapp-table" role="table" aria-label="WhatsApp receipt review queue">
          <div className="tex-whatsapp-table-head" role="row">
            <span role="columnheader">Sender</span>
            <span role="columnheader">Receipt</span>
            <span role="columnheader">OCR result</span>
            <span role="columnheader">Action</span>
          </div>
          {submissions.map((submission) => {
            const matchedEmployee = activeEmployees.find(
              (employee) => employee.id === submission.resolvedEmployeeProfileId
            );
            const selectedEmployeeId =
              selectedEmployees[submission.id] ?? submission.resolvedEmployeeProfileId ?? "";
            const ocrReceipt = firstOcrReceipt(submission.ocrResult);
            const receiptCount = ocrReceiptCount(submission.ocrResult);

            return (
              <article className="tex-whatsapp-row" key={submission.id} role="row">
                <div className="tex-whatsapp-sender" role="cell">
                  <div className="tex-whatsapp-status-line">
                    <span className={`tex-status ${statusClassForIntake(submission.intakeStatus)}`}>
                      {submission.intakeStatus}
                    </span>
                    {matchedEmployee ? <span className="tex-match-chip">Matched</span> : null}
                  </div>
                  <div className="tex-whatsapp-sender-name">
                    <strong>{matchedEmployee?.name ?? "Unknown sender"}</strong>
                    <span>{matchedEmployee?.phoneNumber ?? senderLabel(submission)}</span>
                  </div>
                  <small>{formatDateTime(submission.createdAt)}</small>
                </div>

                <div className="tex-whatsapp-receipt-cell" role="cell">
                  <span className="tex-mobile-cell-label">Receipt</span>
                  <ReceiptPreview
                    contentType={submission.mediaMimeType}
                    expected={submission.messageType === "receipt"}
                    label="Incoming receipt"
                    mediaError={submission.mediaError ?? submission.ocrError}
                    mediaStatus={submission.mediaStatus}
                    ocrStatus={submission.ocrStatus}
                    url={receiptUrlForSubmission(submission)}
                  />
                  <MediaStatusSummary submission={submission} />
                </div>

                <div className="tex-whatsapp-ocr-cell" role="cell">
                  <div className="tex-whatsapp-ocr-summary">
                    <span className="tex-mobile-cell-label">OCR result</span>
                    <strong>{ocrReceipt?.vendor ?? "Needs review"}</strong>
                    <span>
                      {ocrReceipt?.amount != null
                        ? `${ocrReceipt.currency ?? "AED"} ${ocrReceipt.amount}`
                        : "Amount needs review"}
                    </span>
                  </div>
                  <dl className="tex-compact-dl">
                    <div>
                      <dt>OCR</dt>
                      <dd>{formatStatus(submission.ocrStatus)}</dd>
                    </div>
                    <div>
                      <dt>Message</dt>
                      <dd>{submission.messageId ?? "Not provided"}</dd>
                    </div>
                    <div>
                      <dt>Vendor</dt>
                      <dd>{ocrReceipt?.vendor ?? "Needs review"}</dd>
                    </div>
                    <div>
                      <dt>Amount</dt>
                      <dd>
                        {ocrReceipt?.amount != null
                          ? `${ocrReceipt.currency ?? "AED"} ${ocrReceipt.amount}`
                          : "Needs review"}
                      </dd>
                    </div>
                    <div>
                      <dt>Date</dt>
                      <dd>{ocrReceipt?.expenseDate ?? "Needs review"}</dd>
                    </div>
                    <div>
                      <dt>VAT / TRN</dt>
                      <dd>{vatTrnLabel(submission)}</dd>
                    </div>
                  </dl>
                  <p className="tex-whatsapp-message">
                    {submission.messageText ||
                      submission.whatsappReplyText ||
                      "No message text captured."}
                  </p>
                  {submission.duplicateHint ? (
                    <p className="tex-field-hint">Duplicate check: {submission.duplicateHint}</p>
                  ) : null}
                  {receiptCount > 1 ? (
                    <p className="tex-field-hint">PDF contains {receiptCount} receipts. Confirm to create {receiptCount} expenses.</p>
                  ) : null}
                </div>

                <div className="tex-whatsapp-actions" role="cell">
                  <span className="tex-mobile-cell-label">Action</span>
                  <div className="tex-whatsapp-action-group">
                    <label className="tex-wide-label">
                      Assign to employee
                      <select
                        value={selectedEmployeeId}
                        onChange={(event) =>
                          setSelectedEmployees((current) => ({
                            ...current,
                            [submission.id]: event.target.value
                          }))
                        }
                      >
                        <option value="">Select employee</option>
                        {activeEmployees.map((employee) => (
                          <option key={employee.id} value={employee.id}>
                            {employee.name} ({employee.phoneNumber})
                          </option>
                        ))}
                      </select>
                    </label>
                    <button
                      type="button"
                      className="tex-secondary-button"
                      disabled={busyId === submission.id || !selectedEmployeeId}
                      onClick={() => resolveSubmission(submission, "existing_employee")}
                    >
                      {matchedEmployee
                        ? receiptCount > 1
                          ? `Create ${receiptCount} expenses`
                          : "Create expense"
                        : "Assign"}
                    </button>
                  </div>

                  <details className="tex-whatsapp-new-employee">
                    <summary>Add as employee</summary>
                    <div className="tex-whatsapp-action-group">
                      <label className="tex-wide-label">
                        Employee name
                        <input
                          value={newEmployeeNames[submission.id] ?? ""}
                          onChange={(event) =>
                            setNewEmployeeNames((current) => ({
                              ...current,
                              [submission.id]: event.target.value
                            }))
                          }
                          placeholder="Employee name"
                        />
                      </label>
                      <button
                        type="button"
                        className="tex-primary-button"
                        disabled={busyId === submission.id || !newEmployeeNames[submission.id]?.trim()}
                        onClick={() => resolveSubmission(submission, "new_employee")}
                      >
                        Add and assign
                      </button>
                    </div>
                  </details>

                  <button
                    type="button"
                    className="tex-inline-button"
                    disabled={busyId === submission.id}
                    onClick={() => ignoreSubmission(submission)}
                  >
                    Ignore
                  </button>
                </div>
              </article>
            );
          })}
        </div>
      )}
    </section>
  );
}

function firstOcrReceipt(
  ocrResult: TexUnregisteredWhatsappSubmission["ocrResult"]
): OcrReceipt | null {
  if (!ocrResult) {
    return null;
  }

  if (isOcrBatch(ocrResult)) {
    return (ocrResult.receipts[0] ?? null) as OcrReceipt | null;
  }

  return ocrResult;
}

function ocrReceiptCount(ocrResult: TexUnregisteredWhatsappSubmission["ocrResult"]) {
  if (!ocrResult) {
    return 0;
  }

  if (isOcrBatch(ocrResult)) {
    return ocrResult.receipts.length;
  }

  return 1;
}

function isOcrBatch(
  ocrResult: NonNullable<TexUnregisteredWhatsappSubmission["ocrResult"]>
): ocrResult is Extract<NonNullable<TexUnregisteredWhatsappSubmission["ocrResult"]>, { receipts: unknown[] }> {
  return "receipts" in ocrResult && Array.isArray(ocrResult.receipts);
}

function ReceiptPreview({
  contentType,
  expected,
  label,
  mediaError,
  mediaStatus,
  ocrStatus,
  url
}: {
  contentType?: string | null;
  expected: boolean;
  label: string;
  mediaError?: string | null;
  mediaStatus?: string | null;
  ocrStatus?: string | null;
  url: string | null;
}) {
  if (!url) {
    const isWaitingWithoutAttachment =
      (ocrStatus === "pending" || ocrStatus === "processing") && mediaStatus !== "stored";
    return (
      <div className="tex-receipt-missing">
        <strong>
          {isWaitingWithoutAttachment
            ? "Receipt attachment missing"
            : ocrStatus === "pending" || ocrStatus === "processing"
              ? "Receipt processing"
            : expected
              ? "Receipt attachment unavailable"
              : "No receipt attachment"}
        </strong>
        <span>{receiptMissingText(mediaStatus, mediaError, ocrStatus)}</span>
      </div>
    );
  }

  const isImage = !contentType || contentType.startsWith("image/");

  return (
    <a className="tex-receipt-preview" href={url} target="_blank" rel="noreferrer">
      {isImage ? <img src={url} alt={label} /> : null}
      <span>{isImage ? "Open receipt" : "Open receipt file"}</span>
    </a>
  );
}

function MediaStatusSummary({
  submission
}: {
  submission: TexUnregisteredWhatsappSubmission;
}) {
  const hasReceipt = Boolean(receiptUrlForSubmission(submission));
  const mediaLabel = hasReceipt
    ? "Receipt copy attached"
    : submission.messageType === "receipt"
      ? "Receipt copy missing"
      : "No receipt expected";

  return (
    <div className="tex-media-state" aria-label="WhatsApp intake status">
      <span>{mediaLabel}</span>
      <span>{formatStatus(submission.mediaStatus ?? submission.messageType)}</span>
      {submission.mediaError ? <small>{submission.mediaError}</small> : null}
      {submission.ocrError && submission.ocrError !== submission.mediaError ? (
        <small>{submission.ocrError}</small>
      ) : null}
    </div>
  );
}

function receiptUrlForSubmission(submission: TexUnregisteredWhatsappSubmission) {
  if (submission.receiptFileId) {
    return `/api/tex/receipts/${submission.receiptFileId}`;
  }

  return submission.mediaUrl;
}

function receiptMissingText(
  mediaStatus?: string | null,
  mediaError?: string | null,
  ocrStatus?: string | null
) {
  if (mediaError) {
    return mediaError;
  }

  if (ocrStatus === "pending" || ocrStatus === "processing") {
    return "TEX captured the WhatsApp message, but the receipt image or PDF is not attached yet. Resend the receipt as a photo or PDF attachment.";
  }

  if (mediaStatus === "download_failed") {
    return "WhatsApp sent media, but Quick Connect could not download it.";
  }

  if (mediaStatus === "upload_failed") {
    return "WhatsApp media was received, but TEX could not store the receipt copy.";
  }

  return "The message was captured, but no receipt file is attached to it.";
}

function statusClassForIntake(status: string) {
  if (status.toLowerCase().includes("failed")) {
    return "tex-status-rejected";
  }

  if (status.toLowerCase().includes("processed") || status.toLowerCase().includes("created")) {
    return "tex-status-approved";
  }

  if (status.toLowerCase().includes("attached")) {
    return "tex-status-open";
  }

  return "tex-status-pending";
}

function senderLabel(submission: TexUnregisteredWhatsappSubmission) {
  return submission.senderPhone ?? submission.senderRaw ?? submission.whatsappChatJid ?? "Unknown number";
}

function vatTrnLabel(submission: TexUnregisteredWhatsappSubmission) {
  const receipt = firstOcrReceipt(submission.ocrResult);

  if (receipt?.taxAmount == null && !receipt?.taxIdNumber) {
    return "Not read";
  }

  return [
    receipt.taxAmount != null ? `VAT ${receipt.taxAmount}` : null,
    receipt.taxIdNumber ? `TRN ${receipt.taxIdNumber}` : null
  ]
    .filter(Boolean)
    .join(" / ");
}

function formatStatus(value: string) {
  return value.replace(/_/g, " ");
}

async function texFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/tex${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...(init?.headers ?? {})
    }
  });

  const payload = (await response.json().catch(() => ({}))) as { error?: string };
  if (!response.ok) {
    throw new Error(payload.error || `TEX request failed with ${response.status}`);
  }

  return payload as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "TEX WhatsApp review failed.";
}

function formatDateTime(value: string) {
  return new Intl.DateTimeFormat("en-GB", {
    dateStyle: "short",
    timeStyle: "short"
  }).format(new Date(value));
}

function formatTime(value: Date) {
  return new Intl.DateTimeFormat("en-GB", {
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit"
  }).format(value);
}
