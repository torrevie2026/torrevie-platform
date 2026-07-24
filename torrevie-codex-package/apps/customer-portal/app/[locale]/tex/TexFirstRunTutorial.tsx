"use client";

import {
  BarChart3,
  CheckCircle2,
  LayoutDashboard,
  MessageCircle,
  Pause,
  Play,
  ReceiptText,
  Users,
  X
} from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { texTutorialMediaAssets } from "./tex-tutorial-media";
import type { TexTutorialMediaAsset, TexTutorialScene } from "./tex-tutorial-media";

type TexFirstRunTutorialProps = {
  shouldShow: boolean;
  tenantName: string;
};

type TutorialStep = {
  eyebrow: string;
  title: string;
  body: string;
  caption: string;
  focus: string;
  icon: typeof LayoutDashboard;
  scene: TexTutorialScene;
};

const tutorialSteps: TutorialStep[] = [
  {
    eyebrow: "Workspace",
    title: "Start from a focused TEX dashboard",
    body:
      "Use the dashboard to see pending receipts, approval workload, spend movement, and the next action for your team.",
    caption: "Start every day from the TEX control tower.",
    focus: "Dashboard cards, spend trend, and shortcut actions.",
    icon: LayoutDashboard,
    scene: "dashboard"
  },
  {
    eyebrow: "WhatsApp intake",
    title: "Connect the receipt channel",
    body:
      "Quick Connect links the tenant WhatsApp number. Drivers and employees can then send receipts directly to TEX.",
    caption: "Connect WhatsApp once, then test receipt intake.",
    focus: "Connection status, service health, and pairing actions.",
    icon: MessageCircle,
    scene: "whatsapp"
  },
  {
    eyebrow: "OCR review",
    title: "Let TEX read receipts first",
    body:
      "Incoming receipts are matched to employees, OCR fields are prepared, and anything uncertain stays visible for review.",
    caption: "Receipts arrive with sender matching and OCR status.",
    focus: "Sender, attachment, OCR result, and create-expense action.",
    icon: ReceiptText,
    scene: "review"
  },
  {
    eyebrow: "Approval",
    title: "Approve, reject, or mark paid",
    body:
      "Managers can work through the expense queue, handle duplicates, and keep senders updated after decisions.",
    caption: "Approve clean items and keep duplicate signals visible.",
    focus: "Status, duplicate indication, receipt attachment, and approvals.",
    icon: CheckCircle2,
    scene: "approval"
  },
  {
    eyebrow: "People",
    title: "Build the team list",
    body:
      "Add employees, invite web users, assign roles, and organize teams as the workspace grows beyond the first drivers.",
    caption: "Create the operating team and assign managers.",
    focus: "Employee drawer, team membership, and web access.",
    icon: Users,
    scene: "people"
  },
  {
    eyebrow: "Reporting",
    title: "Track spend and growth options",
    body:
      "Reports show spend trends and categories. Growth modules add trips, trip legs, finance review, and higher limits.",
    caption: "Use reports to understand spend and growth needs.",
    focus: "Spend trend, category split, export actions, and Growth modules.",
    icon: BarChart3,
    scene: "reports"
  }
];

const autoplayDelayMs = 7000;

export function TexFirstRunTutorial({ shouldShow, tenantName }: TexFirstRunTutorialProps) {
  const [isOpen, setIsOpen] = useState(shouldShow);
  const [stepIndex, setStepIndex] = useState(0);
  const [doNotShowAgain, setDoNotShowAgain] = useState(false);
  const [isPlaying, setIsPlaying] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const step = tutorialSteps[stepIndex] ?? tutorialSteps[0];
  const progress = useMemo(
    () => Math.round(((stepIndex + 1) / tutorialSteps.length) * 100),
    [stepIndex]
  );

  useEffect(() => {
    if (!isOpen || !isPlaying || isSaving) {
      return;
    }

    const timer = window.setTimeout(() => {
      setStepIndex((current) => (current + 1) % tutorialSteps.length);
    }, autoplayDelayMs);

    return () => window.clearTimeout(timer);
  }, [isOpen, isPlaying, isSaving, stepIndex]);

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
      setIsPlaying(false);
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
            <strong>{step.focus}</strong>
            <small>
              Step {stepIndex + 1} of {tutorialSteps.length}
            </small>
          </article>
          <TutorialSnapshot step={step} tenantName={tenantName} />
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
              disabled={isSaving}
              type="button"
              onClick={() => setIsPlaying((current) => !current)}
            >
              {isPlaying ? <Pause aria-hidden="true" /> : <Play aria-hidden="true" />}
              {isPlaying ? "Pause" : "Play"}
            </button>
            <button
              className="tex-secondary-button"
              disabled={stepIndex === 0 || isSaving}
              type="button"
              onClick={() => {
                setIsPlaying(false);
                setStepIndex((current) => Math.max(0, current - 1));
              }}
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

function TutorialSnapshot({ step, tenantName }: { step: TutorialStep; tenantName: string }) {
  const media = texTutorialMediaAssets[step.scene];

  return (
    <figure className={`tex-tour-frame tex-tour-frame-${step.scene}`} aria-label={step.caption}>
      {media?.videoSrc || media?.imageSrc ? (
        <TutorialMedia media={media} />
      ) : (
        <GeneratedTutorialFrame step={step} tenantName={tenantName} />
      )}
      <figcaption>{step.caption}</figcaption>
    </figure>
  );
}

function TutorialMedia({ media }: { media: TexTutorialMediaAsset }) {
  if (media.videoSrc) {
    return (
      <video
        aria-label={media.alt}
        autoPlay
        className="tex-tour-media"
        controls
        loop
        muted
        playsInline
        poster={media.posterSrc}
        preload="metadata"
      >
        <source src={media.videoSrc} type={media.videoSrc.endsWith(".mp4") ? "video/mp4" : "video/webm"} />
      </video>
    );
  }

  if (media.imageSrc) {
    return <img alt={media.alt} className="tex-tour-media" loading="lazy" src={media.imageSrc} />;
  }

  return null;
}

function GeneratedTutorialFrame({ step, tenantName }: { step: TutorialStep; tenantName: string }) {
  return (
    <div className="tex-tour-screen">
      <div className="tex-tour-window-bar">
        <span />
        <span />
        <span />
        <b>app.torrevie.com/en/tex</b>
      </div>
      <div className="tex-tour-app">
        <aside className="tex-tour-rail">
          <strong>{tenantName}</strong>
          <span>Dashboard</span>
          <span>Expenses</span>
          <span>WhatsApp</span>
          <span>People</span>
          <span>Reports</span>
        </aside>
        <section className="tex-tour-content">
          {step.scene === "dashboard" ? <DashboardSnapshot /> : null}
          {step.scene === "whatsapp" ? <WhatsappSnapshot /> : null}
          {step.scene === "review" ? <ReviewSnapshot /> : null}
          {step.scene === "approval" ? <ApprovalSnapshot /> : null}
          {step.scene === "people" ? <PeopleSnapshot /> : null}
          {step.scene === "reports" ? <ReportsSnapshot /> : null}
        </section>
      </div>
      <span className="tex-tour-highlight" />
    </div>
  );
}

function DashboardSnapshot() {
  return (
    <div className="tex-tour-dashboard">
      <header>
        <span>TEX workspace</span>
        <h4>TEX expense workspace</h4>
      </header>
      <div className="tex-tour-kpis">
        <b>Total spend <strong>AED 498</strong></b>
        <b>Pending approval <strong>2</strong></b>
        <b>Flagged receipts <strong>1</strong></b>
      </div>
      <div className="tex-tour-chart">
        <i />
        <i />
        <i />
      </div>
      <div className="tex-tour-cta">View Growth options</div>
    </div>
  );
}

function WhatsappSnapshot() {
  return (
    <div className="tex-tour-whatsapp">
      <header>
        <span>Guided setup</span>
        <h4>Connect WhatsApp with Quick Connect</h4>
      </header>
      <div className="tex-tour-status-card">
        <b>Connection</b>
        <strong>Connected</strong>
      </div>
      <div className="tex-tour-status-grid">
        <span>WhatsApp number<br /><b>+971...</b></span>
        <span>Service status<br /><b>Available</b></span>
        <span>Last check<br /><b>Just now</b></span>
      </div>
      <div className="tex-tour-cta">Send a test receipt</div>
    </div>
  );
}

function ReviewSnapshot() {
  return (
    <div className="tex-tour-review">
      <header>
        <span>WhatsApp review</span>
        <h4>Unknown receipts waiting for review</h4>
      </header>
      <div className="tex-tour-table">
        <span>Sender<br /><b>Matched</b></span>
        <span>Receipt<br /><b>Attached</b></span>
        <span>OCR result<br /><b>Vendor read</b></span>
        <span>Action<br /><b>Create expense</b></span>
      </div>
    </div>
  );
}

function ApprovalSnapshot() {
  return (
    <div className="tex-tour-approval">
      <header>
        <span>Expense queue</span>
        <h4>Review, approve, and mark paid</h4>
      </header>
      <div className="tex-tour-expense-row"><b>Airport Cafe</b><span>AED 84</span><em>Approve</em></div>
      <div className="tex-tour-expense-row"><b>Taxi Corp</b><span>Duplicate</span><em>Reject</em></div>
      <div className="tex-tour-expense-row"><b>Hotel Stay</b><span>Approved</span><em>Mark paid</em></div>
    </div>
  );
}

function PeopleSnapshot() {
  return (
    <div className="tex-tour-people">
      <header>
        <span>People</span>
        <h4>TEX employee records</h4>
      </header>
      <div className="tex-tour-drawer-mock">
        <b>Add employee</b>
        <span>Name</span>
        <span>WhatsApp phone</span>
        <em>Create</em>
      </div>
      <div className="tex-tour-team-row">Team: Operations</div>
    </div>
  );
}

function ReportsSnapshot() {
  return (
    <div className="tex-tour-reports">
      <header>
        <span>Reports</span>
        <h4>Spend trend and category split</h4>
      </header>
      <div className="tex-tour-report-grid">
        <div className="tex-tour-report-bars">
          <span />
          <span />
          <span />
        </div>
        <div className="tex-tour-donut">
          <span />
        </div>
      </div>
      <div className="tex-tour-export">
        <span>Copy summary</span>
        <span>Excel</span>
        <span />
      </div>
    </div>
  );
}
