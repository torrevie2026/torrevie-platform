"use client";

import { useMemo, useState } from "react";
import type { TexBootstrap, TexUnregisteredWhatsappSubmission } from "../../../lib/tex";

type TexWhatsappReviewClientProps = {
  employees: TexBootstrap["employeeProfiles"];
  initialSubmissions: TexUnregisteredWhatsappSubmission[];
};

type ResolveMode = "existing_employee" | "new_employee";

export function TexWhatsappReviewClient({
  employees,
  initialSubmissions
}: TexWhatsappReviewClientProps) {
  const [submissions, setSubmissions] = useState(initialSubmissions);
  const [selectedEmployees, setSelectedEmployees] = useState<Record<string, string>>({});
  const [newEmployeeNames, setNewEmployeeNames] = useState<Record<string, string>>({});
  const [busyId, setBusyId] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const activeEmployees = useMemo(
    () => employees.filter((employee) => employee.isActive),
    [employees]
  );

  async function refreshQueue() {
    const response = await texFetch<{ submissions: TexUnregisteredWhatsappSubmission[] }>(
      "/unregistered-whatsapp?status=open"
    );
    setSubmissions(response.submissions);
  }

  async function resolveSubmission(
    submission: TexUnregisteredWhatsappSubmission,
    mode: ResolveMode
  ) {
    setBusyId(submission.id);
    setNotice(null);
    setError(null);

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
      await refreshQueue();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  async function ignoreSubmission(submission: TexUnregisteredWhatsappSubmission) {
    setBusyId(submission.id);
    setNotice(null);
    setError(null);

    try {
      await texFetch(`/unregistered-whatsapp/${submission.id}/ignore`, {
        method: "PATCH",
        body: JSON.stringify({ reason: "Ignored from TEX WhatsApp review queue" })
      });
      setNotice("WhatsApp submission ignored.");
      await refreshQueue();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyId(null);
    }
  }

  return (
    <section
      className="tex-work-panel tex-whatsapp-review"
      aria-label="Unregistered WhatsApp review"
    >
      <div className="section-heading-row">
        <div>
          <h2>WhatsApp review</h2>
          <p>Assign unknown senders to employees or clear submissions that do not belong in TEX.</p>
        </div>
        <button
          type="button"
          className="tex-secondary-button"
          onClick={refreshQueue}
          disabled={busyId !== null}
        >
          Refresh
        </button>
      </div>

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

            return (
              <article className="tex-whatsapp-row" key={submission.id} role="row">
                <div className="tex-whatsapp-sender" role="cell">
                  <div className="tex-whatsapp-status-line">
                    <span className={`tex-status ${statusClassForIntake(submission.intakeStatus)}`}>
                      {submission.intakeStatus}
                    </span>
                    {matchedEmployee ? <span className="tex-match-chip">Matched</span> : null}
                  </div>
                  <strong>{matchedEmployee?.name ?? "Unknown sender"}</strong>
                  <span>{matchedEmployee?.phoneNumber ?? senderLabel(submission)}</span>
                  <small>{formatDateTime(submission.createdAt)}</small>
                </div>

                <div className="tex-whatsapp-receipt-cell" role="cell">
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
                      <dd>{submission.ocrResult?.vendor ?? "Needs review"}</dd>
                    </div>
                    <div>
                      <dt>Amount</dt>
                      <dd>
                        {submission.ocrResult?.amount != null
                          ? `${submission.ocrResult.currency ?? "AED"} ${submission.ocrResult.amount}`
                          : "Needs review"}
                      </dd>
                    </div>
                    <div>
                      <dt>Date</dt>
                      <dd>{submission.ocrResult?.expenseDate ?? "Needs review"}</dd>
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
                </div>

                <div className="tex-whatsapp-actions" role="cell">
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
                    {matchedEmployee ? "Create expense" : "Assign"}
                  </button>

                  <label className="tex-wide-label">
                    Add as employee
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
    return (
      <div className="tex-receipt-missing">
        <strong>
          {ocrStatus === "pending" || ocrStatus === "processing"
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
    return "TEX has captured the message and is waiting for the receipt file to finish processing.";
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
  if (submission.ocrResult?.taxAmount == null && !submission.ocrResult?.taxIdNumber) {
    return "Not read";
  }

  return [
    submission.ocrResult.taxAmount != null ? `VAT ${submission.ocrResult.taxAmount}` : null,
    submission.ocrResult.taxIdNumber ? `TRN ${submission.ocrResult.taxIdNumber}` : null
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
