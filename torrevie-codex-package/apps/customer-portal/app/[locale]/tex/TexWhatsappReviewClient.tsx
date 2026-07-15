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
              employeeProfileId: selectedEmployees[submission.id]
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
        <div className="tex-whatsapp-list">
          {submissions.map((submission) => (
            <article className="tex-whatsapp-card" key={submission.id}>
              <header>
                <span className="tex-status tex-status-pending">Unknown sender</span>
                <strong>
                  {submission.senderPhone ?? submission.senderRaw ?? "Unknown number"}
                </strong>
                <small>{formatDateTime(submission.createdAt)}</small>
              </header>

              <div className="tex-whatsapp-body">
                <ReceiptPreview
                  contentType={submission.mediaMimeType}
                  label="Incoming receipt"
                  url={receiptUrlForSubmission(submission)}
                />
                <p>
                  {submission.messageText ||
                    submission.whatsappReplyText ||
                    "No message text captured."}
                </p>
                <dl>
                  <div>
                    <dt>OCR</dt>
                    <dd>{submission.ocrStatus}</dd>
                  </div>
                  <div>
                    <dt>Message</dt>
                    <dd>{submission.messageId ?? "Not provided"}</dd>
                  </div>
                </dl>
                {submission.ocrResult ? (
                  <p className="tex-field-hint">
                    {submission.ocrResult.vendor ?? "Unknown vendor"} ·{" "}
                    {submission.ocrResult.currency ?? "AED"}{" "}
                    {submission.ocrResult.amount ?? "needs review"}
                  </p>
                ) : null}
              </div>

              <div className="tex-whatsapp-actions">
                <label className="tex-wide-label">
                  Assign to employee
                  <select
                    value={selectedEmployees[submission.id] ?? ""}
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
                  disabled={busyId === submission.id || !selectedEmployees[submission.id]}
                  onClick={() => resolveSubmission(submission, "existing_employee")}
                >
                  Assign
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
          ))}
        </div>
      )}
    </section>
  );
}

function ReceiptPreview({
  contentType,
  label,
  url
}: {
  contentType?: string | null;
  label: string;
  url: string | null;
}) {
  if (!url) {
    return <p className="tex-field-hint">No receipt attachment captured.</p>;
  }

  const isImage = !contentType || contentType.startsWith("image/");

  return (
    <a className="tex-receipt-preview" href={url} target="_blank" rel="noreferrer">
      {isImage ? <img src={url} alt={label} /> : null}
      <span>{isImage ? "Open receipt" : "Open receipt file"}</span>
    </a>
  );
}

function receiptUrlForSubmission(submission: TexUnregisteredWhatsappSubmission) {
  if (submission.receiptFileId) {
    return `/api/tex/receipts/${submission.receiptFileId}`;
  }

  return submission.mediaUrl;
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
