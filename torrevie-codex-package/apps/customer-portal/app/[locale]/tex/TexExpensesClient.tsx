"use client";

import { useMemo, useState } from "react";
import type { Dispatch, SetStateAction } from "react";
import type { TexBootstrap, TexExpenseListItem, TexExpenseStatus, TexTripListItem } from "../../../lib/tex";

type TexExpensesClientProps = {
  categories: TexBootstrap["categories"];
  employees: TexBootstrap["employeeProfiles"];
  trips: TexTripListItem[];
  initialExpenses: TexExpenseListItem[];
};

type ExpenseFormState = {
  employeeProfileId: string;
  vendor: string;
  expenseDate: string;
  amount: string;
  currency: string;
  category: string;
  tripId: string;
  notes: string;
  paymentMethod: string;
  taxIdNumber: string;
  taxAmount: string;
  receiptFileId: string;
  receiptUrl: string;
  receiptFileName: string;
  extractionConfidence: number | null;
  extractionPayload: Record<string, unknown> | null;
};

type ParsedReceipt = {
  vendor: string | null;
  expenseDate: string | null;
  amount: number | null;
  currency: string | null;
  category: string | null;
  taxAmount: number | null;
  taxIdNumber: string | null;
  confidence: number;
  notes: string | null;
};

type ReceiptUploadResponse = {
  receipt: {
    id: string;
    url: string;
    filename: string;
    contentType: string;
    sizeBytes: number;
  };
};

const blankForm = (): ExpenseFormState => ({
  employeeProfileId: "",
  vendor: "",
  expenseDate: new Date().toISOString().slice(0, 10),
  amount: "",
  currency: "AED",
  category: "",
  tripId: "",
  notes: "",
  paymentMethod: "",
  taxIdNumber: "",
  taxAmount: "",
  receiptFileId: "",
  receiptUrl: "",
  receiptFileName: "",
  extractionConfidence: null,
  extractionPayload: null
});

export function TexExpensesClient({ categories, employees, trips, initialExpenses }: TexExpensesClientProps) {
  const [expenses, setExpenses] = useState(initialExpenses);
  const [form, setForm] = useState<ExpenseFormState>(blankForm);
  const [statusFilter, setStatusFilter] = useState<"all" | TexExpenseStatus>("all");
  const [isCreating, setIsCreating] = useState(false);
  const [isExpenseDrawerOpen, setIsExpenseDrawerOpen] = useState(false);
  const [selectedExpense, setSelectedExpense] = useState<TexExpenseListItem | null>(null);
  const [busyExpenseId, setBusyExpenseId] = useState<string | null>(null);
  const [isReceiptParsing, setIsReceiptParsing] = useState(false);
  const [autoFilledFields, setAutoFilledFields] = useState<Set<keyof ExpenseFormState>>(new Set());
  const [receiptWarning, setReceiptWarning] = useState<string | null>(null);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const visibleExpenses = useMemo(
    () => expenses.filter((expense) => statusFilter === "all" || expense.status === statusFilter),
    [expenses, statusFilter]
  );
  const activeEmployees = employees.filter((employee) => employee.isActive);
  const activeCategories = categories.filter((category) => category.isActive);
  const openTrips = trips.filter((trip) => trip.status !== "closed" && trip.status !== "cancelled");

  async function refreshExpenses() {
    const response = await texFetch<{ expenses: TexExpenseListItem[] }>("/expenses");
    setExpenses(response.expenses);
    setSelectedExpense((current) => response.expenses.find((expense) => expense.id === current?.id) ?? current);
  }

  async function createExpense() {
    setIsCreating(true);
    setError(null);
    setNotice(null);

    try {
      await texFetch("/expenses", {
        method: "POST",
        body: JSON.stringify({
          employeeProfileId: form.employeeProfileId || null,
          vendor: form.vendor || null,
          expenseDate: form.expenseDate,
          amount: Number(form.amount),
          currency: form.currency,
          category: form.category || null,
          tripId: form.tripId || null,
          notes: form.notes || null,
          paymentMethod: form.paymentMethod || null,
          taxIdNumber: form.taxIdNumber || null,
          taxAmount: form.taxAmount ? Number(form.taxAmount) : null,
          receiptFileId: form.receiptFileId || null,
          extractionSource: "manual",
          extractionConfidence: form.extractionConfidence,
          extractionPayload: form.extractionPayload,
          source: "web"
        })
      });
      setNotice("Expense submitted.");
      setForm(blankForm());
      setAutoFilledFields(new Set());
      setReceiptWarning(null);
      setIsExpenseDrawerOpen(false);
      await refreshExpenses();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setIsCreating(false);
    }
  }

  async function uploadReceipt(file: File) {
    setIsReceiptParsing(true);
    setError(null);
    setNotice(null);
    setReceiptWarning(null);
    setAutoFilledFields(new Set());

    try {
      const dataUrl = await fileToDataUrl(file);
      setForm((current) => ({
        ...current,
        receiptFileName: file.name
      }));

      let parseMessage: string | null = null;
      if (file.type.startsWith("image/")) {
        try {
          const parsed = await texFetch<ParsedReceipt>("/receipts/parse", {
            method: "POST",
            body: JSON.stringify({
              contentType: file.type,
              dataBase64: dataUrl
            })
          });
          const filled = new Set<keyof ExpenseFormState>();
          setForm((current) => {
            const next = { ...current, extractionConfidence: parsed.confidence, extractionPayload: parsed as unknown as Record<string, unknown> };

            if (parsed.vendor) {
              next.vendor = parsed.vendor;
              filled.add("vendor");
            }
            if (parsed.expenseDate) {
              next.expenseDate = parsed.expenseDate;
              filled.add("expenseDate");
            }
            if (parsed.amount) {
              next.amount = String(parsed.amount);
              filled.add("amount");
            }
            if (parsed.currency) {
              next.currency = parsed.currency.toUpperCase();
              filled.add("currency");
            }
            if (parsed.category && activeCategories.some((category) => category.name === parsed.category)) {
              next.category = parsed.category;
              filled.add("category");
            }
            if (parsed.taxIdNumber) {
              next.taxIdNumber = parsed.taxIdNumber;
              filled.add("taxIdNumber");
            }
            if (parsed.taxAmount != null) {
              next.taxAmount = String(parsed.taxAmount);
              filled.add("taxAmount");
            }
            if (parsed.notes) {
              next.notes = parsed.notes;
              filled.add("notes");
            }

            return next;
          });
          setAutoFilledFields(filled);
          parseMessage = filled.size > 0 ? null : "Receipt uploaded, but no fields could be read automatically. Please fill in the fields manually.";
        } catch (caught) {
          parseMessage = errorMessage(caught);
        }
      } else {
        parseMessage = "OCR currently supports image receipts only, so please fill in the fields manually.";
      }

      try {
        const upload = await texFetch<ReceiptUploadResponse>("/receipts", {
          method: "POST",
          body: JSON.stringify({
            fileName: file.name,
            contentType: file.type || "application/octet-stream",
            dataBase64: dataUrl
          })
        });
        setForm((current) => ({
          ...current,
          receiptFileId: upload.receipt.id,
          receiptUrl: upload.receipt.url,
          receiptFileName: upload.receipt.filename || file.name
        }));
        setReceiptWarning(parseMessage);
      } catch (caught) {
        const uploadMessage = `Receipt fields can still be reviewed, but the file was not stored: ${errorMessage(caught)}`;
        setReceiptWarning(parseMessage ? `${parseMessage} ${uploadMessage}` : uploadMessage);
      }
    } catch (caught) {
      setReceiptWarning(errorMessage(caught));
    } finally {
      setIsReceiptParsing(false);
    }
  }

  async function updateStatus(expenseId: string, status: Exclude<TexExpenseStatus, "pending">) {
    setBusyExpenseId(expenseId);
    setError(null);
    setNotice(null);

    try {
      await texFetch(`/expenses/${expenseId}/status`, {
        method: "PATCH",
        body: JSON.stringify({ status })
      });
      setNotice(`Expense ${status}.`);
      await refreshExpenses();
    } catch (caught) {
      setError(errorMessage(caught));
    } finally {
      setBusyExpenseId(null);
    }
  }

  return (
    <div className="tex-expense-workspace">
      {isExpenseDrawerOpen ? (
        <div
          className="tex-drawer-backdrop"
          role="presentation"
          onMouseDown={() => {
            setIsExpenseDrawerOpen(false);
            setForm(blankForm());
          }}
        >
          <aside
            className="tex-drawer"
            aria-labelledby="tex-new-expense-title"
            aria-modal="true"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="section-heading-row">
              <h3 id="tex-new-expense-title">New expense</h3>
              <button
                type="button"
                className="tex-secondary-button"
                onClick={() => {
                  setIsExpenseDrawerOpen(false);
                  setForm(blankForm());
                }}
              >
                Close
              </button>
            </div>

            <ReceiptUploadPanel
              fileName={form.receiptFileName}
              isParsing={isReceiptParsing}
              confidence={form.extractionConfidence}
              warning={receiptWarning}
              onFile={uploadReceipt}
              onClear={() => {
                setForm((current) => ({
                  ...current,
                  receiptFileId: "",
                  receiptUrl: "",
                  receiptFileName: "",
                  extractionConfidence: null,
                  extractionPayload: null
                }));
                setAutoFilledFields(new Set());
                setReceiptWarning(null);
              }}
            />

            <div className="tex-form-grid">
              <label className={fieldClass(autoFilledFields, "employeeProfileId")}>
                Employee
                <select value={form.employeeProfileId} onChange={(event) => setFormValue(setForm, "employeeProfileId", event.target.value)}>
                  <option value="">Signed-in user</option>
                  {activeEmployees.map((employee) => (
                    <option key={employee.id} value={employee.id}>
                      {employee.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={fieldClass(autoFilledFields, "expenseDate")}>
                Date
                <input value={form.expenseDate} type="date" onChange={(event) => setFormValue(setForm, "expenseDate", event.target.value)} />
              </label>
              <label className={fieldClass(autoFilledFields, "amount")}>
                Amount
                <input value={form.amount} inputMode="decimal" onChange={(event) => setFormValue(setForm, "amount", event.target.value)} />
              </label>
              <label className={fieldClass(autoFilledFields, "currency")}>
                Currency
                <input
                  value={form.currency}
                  maxLength={3}
                  onChange={(event) => setFormValue(setForm, "currency", event.target.value.toUpperCase())}
                />
              </label>
              <label className={fieldClass(autoFilledFields, "category")}>
                Category
                <select value={form.category} onChange={(event) => setFormValue(setForm, "category", event.target.value)}>
                  <option value="">Uncategorized</option>
                  {activeCategories.map((category) => (
                    <option key={category.id} value={category.name}>
                      {category.name}
                    </option>
                  ))}
                </select>
              </label>
              <label>
                Trip
                <select value={form.tripId} onChange={(event) => setFormValue(setForm, "tripId", event.target.value)}>
                  <option value="">No trip</option>
                  {openTrips.map((trip) => (
                    <option key={trip.id} value={trip.id}>
                      {trip.name}
                    </option>
                  ))}
                </select>
              </label>
              <label className={fieldClass(autoFilledFields, "vendor")}>
                Vendor
                <input value={form.vendor} onChange={(event) => setFormValue(setForm, "vendor", event.target.value)} />
              </label>
              <label>
                Payment method
                <select value={form.paymentMethod} onChange={(event) => setFormValue(setForm, "paymentMethod", event.target.value)}>
                  <option value="">Not specified</option>
                  <option value="Corporate Card">Corporate Card</option>
                  <option value="Personal Card">Personal Card</option>
                  <option value="Cash">Cash</option>
                  <option value="Bank Transfer">Bank Transfer</option>
                </select>
              </label>
              <label className={fieldClass(autoFilledFields, "taxIdNumber")}>
                TRN / tax number
                <input value={form.taxIdNumber} onChange={(event) => setFormValue(setForm, "taxIdNumber", event.target.value)} />
              </label>
              <label className={fieldClass(autoFilledFields, "taxAmount")}>
                VAT / tax amount
                <input value={form.taxAmount} inputMode="decimal" onChange={(event) => setFormValue(setForm, "taxAmount", event.target.value)} />
              </label>
              <label className={fieldClass(autoFilledFields, "notes")}>
                Notes
                <input value={form.notes} onChange={(event) => setFormValue(setForm, "notes", event.target.value)} />
              </label>
            </div>

            <div className="tex-drawer-submit-row">
              <button type="button" className="tex-primary-button" disabled={isCreating} onClick={createExpense}>
                {isCreating ? "Submitting..." : "Submit expense"}
              </button>
            </div>
            {error ? <p className="tex-error">{error}</p> : null}
          </aside>
        </div>
      ) : null}

      {selectedExpense ? (
        <div className="tex-drawer-backdrop" role="presentation" onMouseDown={() => setSelectedExpense(null)}>
          <aside
            className="tex-drawer"
            aria-labelledby="tex-expense-detail-title"
            aria-modal="true"
            role="dialog"
            onMouseDown={(event) => event.stopPropagation()}
          >
            <div className="section-heading-row">
              <div>
                <h3 id="tex-expense-detail-title">{selectedExpense.vendor ?? selectedExpense.category ?? "Expense"}</h3>
                <p>
                  {selectedExpense.employeeName ?? "Unassigned"} - {formatDate(selectedExpense.expenseDate)}
                </p>
              </div>
              <button type="button" className="tex-secondary-button" onClick={() => setSelectedExpense(null)}>
                Close
              </button>
            </div>
            <div className="tex-detail-grid">
              <span>Status</span>
              <strong className={`tex-status tex-status-${selectedExpense.status}`}>{selectedExpense.status}</strong>
              <span>Amount</span>
              <strong>
                {formatAmount(selectedExpense.amount)} {selectedExpense.currency}
              </strong>
              <span>Category</span>
              <strong>{selectedExpense.category ?? "Uncategorized"}</strong>
              <span>Trip</span>
              <strong>{selectedExpense.tripName ?? "No trip"}</strong>
              <span>Duplicate review</span>
              <strong>{selectedExpense.duplicateStatus}</strong>
              <span>Notes</span>
              <strong>{selectedExpense.notes ?? "No notes"}</strong>
              <span>Receipt</span>
              <strong>
                <ExpenseReceiptLink expense={selectedExpense} compact={false} />
              </strong>
            </div>
            {selectedExpense.duplicateReason ? <p className="tex-error">{selectedExpense.duplicateReason}</p> : null}
            {selectedExpense.status === "pending" ? (
              <div className="tex-hero-actions">
                <button
                  type="button"
                  className="tex-primary-button"
                  disabled={busyExpenseId === selectedExpense.id}
                  onClick={() => updateStatus(selectedExpense.id, "approved")}
                >
                  Approve
                </button>
                <button
                  type="button"
                  className="tex-secondary-button"
                  disabled={busyExpenseId === selectedExpense.id}
                  onClick={() => updateStatus(selectedExpense.id, "rejected")}
                >
                  Reject
                </button>
              </div>
            ) : null}
            {error ? <p className="tex-error">{error}</p> : null}
          </aside>
        </div>
      ) : null}

      <section className="tex-form-panel tex-expense-panel" aria-labelledby="tex-expense-list-title">
        <div className="section-heading-row">
          <div>
            <h3 id="tex-expense-list-title">Expense queue</h3>
            <p>Review OCR receipts, status, and approvals in one list.</p>
          </div>
          <div className="tex-panel-actions">
            <button
              type="button"
              className="tex-primary-button"
              onClick={() => {
                setForm(blankForm());
                setError(null);
                setNotice(null);
                setIsExpenseDrawerOpen(true);
              }}
            >
              New expense
            </button>
            <button type="button" className="tex-secondary-button" onClick={refreshExpenses}>
              Refresh
            </button>
          </div>
        </div>
        <div className="tex-expense-toolbar">
          <div className="tex-segmented-control" aria-label="Expense status filter">
            {(["all", "pending", "approved", "rejected", "paid"] as const).map((status) => (
              <button
                key={status}
                type="button"
                aria-pressed={statusFilter === status}
                onClick={() => setStatusFilter(status)}
              >
                {status}
              </button>
            ))}
          </div>
          <span>{visibleExpenses.length} shown</span>
        </div>
        {notice ? <p className="tex-notice">{notice}</p> : null}
        {error && !isExpenseDrawerOpen ? <p className="tex-error">{error}</p> : null}

        {visibleExpenses.length === 0 ? (
          <p>No expenses match this view.</p>
        ) : (
          <div className="tex-expense-list">
            {visibleExpenses.map((expense) => (
              <article key={expense.id} className="tex-expense-card">
                <div>
                  <span className={`tex-status tex-status-${expense.status}`}>{expense.status}</span>
                  <h4>{expense.vendor ?? expense.category ?? "Expense"}</h4>
                  <p>
                    {expense.employeeName ?? "Unassigned"} · {formatDate(expense.expenseDate)}
                    {expense.tripName ? ` · ${expense.tripName}` : ""}
                  </p>
                </div>
                <strong>
                  {formatAmount(expense.amount)} {expense.currency}
                </strong>
                <div className="tex-card-actions">
                  <ExpenseReceiptLink expense={expense} compact />
                  <button type="button" onClick={() => setSelectedExpense(expense)}>
                    Open
                  </button>
                  {expense.status === "pending" ? (
                    <>
                      <button
                        type="button"
                        disabled={busyExpenseId === expense.id}
                        onClick={() => updateStatus(expense.id, "approved")}
                      >
                        Approve
                      </button>
                      <button
                        type="button"
                        disabled={busyExpenseId === expense.id}
                        onClick={() => updateStatus(expense.id, "rejected")}
                      >
                        Reject
                      </button>
                    </>
                  ) : (
                    <span>{expense.category ?? "No category"}</span>
                  )}
                </div>
              </article>
            ))}
          </div>
        )}
      </section>
    </div>
  );
}

function ExpenseReceiptLink({
  compact,
  expense
}: {
  compact: boolean;
  expense: TexExpenseListItem;
}) {
  if (!expense.receiptUrl) {
    return compact ? null : <span>No receipt attached</span>;
  }

  return (
    <a
      className={compact ? "tex-receipt-chip" : "tex-receipt-preview"}
      href={expense.receiptUrl}
      target="_blank"
      rel="noreferrer"
    >
      {!compact ? <img src={expense.receiptUrl} alt="Expense receipt" /> : null}
      <span>{compact ? "Receipt attached" : "Open receipt"}</span>
    </a>
  );
}

function setFormValue(
  setForm: Dispatch<SetStateAction<ExpenseFormState>>,
  key: keyof ExpenseFormState,
  value: string
) {
  setForm((current) => ({ ...current, [key]: value }));
}

function ReceiptUploadPanel({
  fileName,
  isParsing,
  confidence,
  warning,
  onFile,
  onClear
}: {
  fileName: string;
  isParsing: boolean;
  confidence: number | null;
  warning: string | null;
  onFile: (file: File) => void;
  onClear: () => void;
}) {
  const [isDragging, setIsDragging] = useState(false);

  return (
    <div className="tex-receipt-upload">
      <div>
        <strong>Receipt</strong>
        <p>Attach a receipt image and TEX will extract the fields for review.</p>
      </div>
      {fileName ? (
        <div className="tex-receipt-file">
          <span>{fileName}</span>
          {confidence !== null ? <b>AI confidence {Math.round(confidence * 100)}%</b> : null}
          <button type="button" className="tex-secondary-button" onClick={onClear}>
            Clear
          </button>
        </div>
      ) : (
        <label
          className={`tex-receipt-drop${isDragging ? " tex-receipt-drop-active" : ""}`}
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            const file = event.dataTransfer.files[0];
            if (file) {
              onFile(file);
            }
          }}
        >
          <input
            type="file"
            accept=".jpeg,.jpg,.png,.webp,.heic,.heif,.pdf,image/jpeg,image/png,image/webp,image/heic,image/heif,application/pdf"
            onChange={(event) => {
              const file = event.target.files?.[0];
              if (file) {
                onFile(file);
              }
            }}
          />
          <span>Drop receipt here or click to upload</span>
          <small>JPEG, PNG, WEBP, HEIC, or PDF up to 20MB</small>
        </label>
      )}
      {isParsing ? <p className="tex-notice">Reading receipt and extracting expense fields...</p> : null}
      {warning ? <p className="tex-error">{warning}</p> : null}
    </div>
  );
}

function fieldClass(fields: Set<keyof ExpenseFormState>, field: keyof ExpenseFormState) {
  return fields.has(field) ? "tex-ai-filled" : undefined;
}

function fileToDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result || ""));
    reader.onerror = () => reject(reader.error || new Error("Could not read receipt file."));
    reader.readAsDataURL(file);
  });
}

async function texFetch<T = unknown>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(`/api/tex${path}`, {
    ...init,
    headers: {
      "Content-Type": "application/json",
      ...init?.headers
    }
  });
  const body = await response.json();

  if (!response.ok) {
    throw new Error(typeof body?.error === "string" ? body.error : "TEX request failed.");
  }

  return body as T;
}

function errorMessage(error: unknown) {
  return error instanceof Error ? error.message : "TEX request failed.";
}

function formatDate(value: string) {
  return new Intl.DateTimeFormat("en-GB").format(new Date(`${value}T00:00:00Z`));
}

function formatAmount(value: number) {
  return new Intl.NumberFormat("en", { maximumFractionDigits: 2 }).format(value);
}
