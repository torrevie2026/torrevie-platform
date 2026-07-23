"use client";

import {
  BarChart3,
  CheckCircle2,
  LayoutDashboard,
  MessageCircle,
  ReceiptText,
  Users,
  X
} from "lucide-react";
import { useMemo, useState } from "react";

type TexFirstRunTutorialProps = {
  shouldShow: boolean;
  tenantName: string;
};

type TutorialStep = {
  eyebrow: string;
  title: string;
  body: string;
  icon: typeof LayoutDashboard;
  snapshot: "dashboard" | "whatsapp" | "review" | "approval" | "people" | "reports";
};

const tutorialSteps: TutorialStep[] = [
  {
    eyebrow: "Workspace",
    title: "Start from a focused TEX dashboard",
    body:
      "Use the dashboard to see pending receipts, approval workload, spend movement, and the next action for your team.",
    icon: LayoutDashboard,
    snapshot: "dashboard"
  },
  {
    eyebrow: "WhatsApp intake",
    title: "Connect the receipt channel",
    body:
      "Quick Connect links the tenant WhatsApp number. Drivers and employees can then send receipts directly to TEX.",
    icon: MessageCircle,
    snapshot: "whatsapp"
  },
  {
    eyebrow: "OCR review",
    title: "Let TEX read receipts first",
    body:
      "Incoming receipts are matched to employees, OCR fields are prepared, and anything uncertain stays visible for review.",
    icon: ReceiptText,
    snapshot: "review"
  },
  {
    eyebrow: "Approval",
    title: "Approve, reject, or mark paid",
    body:
      "Managers can work through the expense queue, handle duplicates, and keep senders updated after decisions.",
    icon: CheckCircle2,
    snapshot: "approval"
  },
  {
    eyebrow: "People",
    title: "Build the team list",
    body:
      "Add employees, invite web users, assign roles, and organize teams as the workspace grows beyond the first drivers.",
    icon: Users,
    snapshot: "people"
  },
  {
    eyebrow: "Reporting",
    title: "Track spend and growth options",
    body:
      "Reports show spend trends and categories. Growth modules add trips, trip legs, finance review, and higher limits.",
    icon: BarChart3,
    snapshot: "reports"
  }
];

export function TexFirstRunTutorial({ shouldShow, tenantName }: TexFirstRunTutorialProps) {
  const [isOpen, setIsOpen] = useState(shouldShow);
  const [stepIndex, setStepIndex] = useState(0);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = tutorialSteps[stepIndex] ?? tutorialSteps[0];
  const progress = useMemo(
    () => Math.round(((stepIndex + 1) / tutorialSteps.length) * 100),
    [stepIndex]
  );

  if (!isOpen || !step) {
    return null;
  }

  const closeTutorial = async (persist: boolean) => {
    if (!persist) {
      setIsOpen(false);
      return;
    }

    setIsSaving(true);
    setError(null);
    try {
      const response = await fetch("/api/tex/tutorial/dismiss", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: "{}"
      });

      if (!response.ok) {
        const payload = (await response.json().catch(() => ({}))) as { error?: string };
        throw new Error(payload.error || `TEX request failed with status ${response.status}.`);
      }

      setIsOpen(false);
    } catch (dismissError) {
      setError(dismissError instanceof Error ? dismissError.message : "Could not save this choice.");
    } finally {
      setIsSaving(false);
    }
  };

  const goNext = async () => {
    if (stepIndex < tutorialSteps.length - 1) {
      setStepIndex((current) => current + 1);
      return;
    }

    await closeTutorial(doNotShowAgain);
  };

  const StepIcon = step.icon;

  return (
    <div className="tex-tutorial-backdrop" role="presentation">
      <section
        aria-labelledby="tex-tutorial-title"
        aria-modal="true"
        className="tex-tutorial-dialog"
        role="dialog"
      >
        <header className="tex-tutorial-header">
          <div className="tex-tutorial-title-group">
            <span className="tex-tutorial-icon" aria-hidden="true">
              <StepIcon />
            </span>
            <div>
              <p className="eyebrow">First-time guide</p>
              <h2 id="tex-tutorial-title">Welcome to {tenantName}</h2>
            </div>
          </div>
          <button
            aria-label="Close tutorial"
            className="tex-icon-button"
            disabled={isSaving}
            type="button"
            onClick={() => closeTutorial(doNotShowAgain)}
          >
            <X />
          </button>
        </header>

        <div className="tex-tutorial-progress" aria-label={`Step ${stepIndex + 1} of ${tutorialSteps.length}`}>
          <span style={{ inlineSize: `${progress}%` }} />
        </div>

        <div className="tex-tutorial-stage">
          <article className="tex-tutorial-copy">
            <span>{step.eyebrow}</span>
            <h3>{step.title}</h3>
            <p>{step.body}</p>
            <small>
              Step {stepIndex + 1} of {tutorialSteps.length}
            </small>
          </article>
          <TutorialSnapshot type={step.snapshot} />
        </div>

        {error ? <p className="tex-tutorial-error">{error}</p> : null}

        <footer className="tex-tutorial-footer">
          <label className="tex-tutorial-checkbox">
            <input
              checked={doNotShowAgain}
              disabled={isSaving}
              type="checkbox"
              onChange={(event) => setDoNotShowAgain(event.target.checked)}
            />
            <span>Don&apos;t show this tutorial again</span>
          </label>
          <div className="tex-tutorial-actions">
            <button
              className="tex-secondary-button"
              disabled={stepIndex === 0 || isSaving}
              type="button"
              onClick={() => setStepIndex((current) => Math.max(0, current - 1))}
            >
              Back
            </button>
            <button
              className="tex-primary-button"
              disabled={isSaving}
              type="button"
              onClick={goNext}
            >
              {stepIndex === tutorialSteps.length - 1
                ? isSaving
                  ? "Saving..."
                  : "Start TEX"
                : "Next"}
            </button>
          </div>
        </footer>
      </section>
    </div>
  );
}

function TutorialSnapshot({ type }: { type: TutorialStep["snapshot"] }) {
  return (
    <div className={`tex-tutorial-snapshot tex-tutorial-snapshot-${type}`} aria-hidden="true">
      <div className="tex-tutorial-window-bar">
        <span />
        <span />
        <span />
      </div>
      {type === "dashboard" ? <DashboardSnapshot /> : null}
      {type === "whatsapp" ? <WhatsappSnapshot /> : null}
      {type === "review" ? <ReviewSnapshot /> : null}
      {type === "approval" ? <ApprovalSnapshot /> : null}
      {type === "people" ? <PeopleSnapshot /> : null}
      {type === "reports" ? <ReportsSnapshot /> : null}
    </div>
  );
}

function DashboardSnapshot() {
  return (
    <>
      <div className="tex-tutorial-kpi-row">
        <span>Pending 4</span>
        <span>Approved AED 2.4k</span>
        <span>Receipts 18</span>
      </div>
      <div className="tex-tutorial-chart-line">
        <i />
        <i />
      </div>
      <div className="tex-tutorial-panel-note">Growth modules available</div>
    </>
  );
}

function WhatsappSnapshot() {
  return (
    <>
      <div className="tex-tutorial-status-card">
        <strong>Quick Connect</strong>
        <span>Connected</span>
      </div>
      <div className="tex-tutorial-chat">
        <p>Receipt image received</p>
        <p>OCR queued for review</p>
      </div>
    </>
  );
}

function ReviewSnapshot() {
  return (
    <div className="tex-tutorial-review-grid">
      <span>Sender matched</span>
      <span>Receipt attached</span>
      <span>Vendor read</span>
      <span>Create expense</span>
    </div>
  );
}

function ApprovalSnapshot() {
  return (
    <div className="tex-tutorial-expense-list">
      <span>Airport Cafe <b>AED 84</b></span>
      <span>Taxi Corp <b>Duplicate</b></span>
      <span>Hotel Stay <b>Approved</b></span>
    </div>
  );
}

function PeopleSnapshot() {
  return (
    <>
      <div className="tex-tutorial-drawer-mock">
        <strong>Add employee</strong>
        <span>Name</span>
        <span>WhatsApp phone</span>
        <button type="button">Create</button>
      </div>
      <div className="tex-tutorial-people-row">Team: Operations</div>
    </>
  );
}

function ReportsSnapshot() {
  return (
    <>
      <div className="tex-tutorial-report-bars">
        <span />
        <span />
        <span />
      </div>
      <div className="tex-tutorial-donut">
        <span />
      </div>
    </>
  );
}
