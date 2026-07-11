import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import {
  createProvisioningJob,
  retryProvisioningStep,
  runProvisioningJob,
  type ProvisioningJob,
  type ProvisioningJobWithSteps,
  type ProvisioningStatus,
  type ProvisioningStep,
  type ProvisioningStepKey,
  type ProvisioningStore
} from "./index.js";

class MemoryProvisioningStore implements ProvisioningStore {
  readonly auditEvents: Array<{ action: string; targetId: string }> = [];
  private readonly jobs = new Map<string, ProvisioningJob>();
  private readonly steps = new Map<string, ProvisioningStep>();

  async createJob(input: {
    tenantId: string;
    actorUserId: string;
    stepKeys: ProvisioningStepKey[];
  }): Promise<ProvisioningJobWithSteps> {
    const now = new Date().toISOString();
    const job: ProvisioningJob = {
      id: randomUUID(),
      tenantId: input.tenantId,
      status: "pending",
      startedAt: null,
      completedAt: null,
      createdAt: now,
      updatedAt: now
    };
    this.jobs.set(job.id, job);

    for (const stepKey of input.stepKeys) {
      const step: ProvisioningStep = {
        id: randomUUID(),
        provisioningJobId: job.id,
        tenantId: job.tenantId,
        stepKey,
        status: "pending",
        attemptCount: 0,
        error: null,
        createdAt: now,
        updatedAt: now
      };
      this.steps.set(step.id, step);
    }

    return this.cloneJob(job);
  }

  async listJobs() {
    return Array.from(this.jobs.values()).map((job) => this.cloneJob(job));
  }

  async getJob(jobId: string) {
    const job = this.jobs.get(jobId);
    return job ? this.cloneJob(job) : null;
  }

  async getStep(stepId: string) {
    const step = this.steps.get(stepId);
    return step ? { ...step } : null;
  }

  async setJobRunning(jobId: string) {
    return this.updateJob(jobId, "running", {
      startedAt: new Date().toISOString(),
      completedAt: null
    });
  }

  async setJobSucceeded(jobId: string) {
    return this.updateJob(jobId, "succeeded", {
      completedAt: new Date().toISOString()
    });
  }

  async setJobFailed(jobId: string) {
    return this.updateJob(jobId, "failed", {
      completedAt: new Date().toISOString()
    });
  }

  async setStepRunning(step: ProvisioningStep) {
    const existing = this.requireStep(step.id);
    return this.updateStep(step.id, {
      status: "running",
      attemptCount: existing.attemptCount + 1,
      error: null
    });
  }

  async setStepSucceeded(stepId: string) {
    return this.updateStep(stepId, {
      status: "succeeded",
      error: null
    });
  }

  async setStepFailed(stepId: string, error: string) {
    return this.updateStep(stepId, {
      status: "failed",
      error
    });
  }

  async writeAuditEvent(event: { action: string; targetId: string }) {
    this.auditEvents.push({
      action: event.action,
      targetId: event.targetId
    });
  }

  private updateJob(
    jobId: string,
    status: ProvisioningStatus,
    values: Partial<Pick<ProvisioningJob, "startedAt" | "completedAt">>
  ) {
    const job = this.requireJob(jobId);
    const updated = {
      ...job,
      ...values,
      status,
      updatedAt: new Date().toISOString()
    };
    this.jobs.set(jobId, updated);
    return { ...updated };
  }

  private updateStep(
    stepId: string,
    values: Partial<Pick<ProvisioningStep, "attemptCount" | "error" | "status">>
  ) {
    const step = this.requireStep(stepId);
    const updated = {
      ...step,
      ...values,
      updatedAt: new Date().toISOString()
    };
    this.steps.set(stepId, updated);
    return { ...updated };
  }

  private requireJob(jobId: string) {
    const job = this.jobs.get(jobId);

    if (!job) {
      throw new Error("Missing in-memory provisioning job.");
    }

    return job;
  }

  private requireStep(stepId: string) {
    const step = this.steps.get(stepId);

    if (!step) {
      throw new Error("Missing in-memory provisioning step.");
    }

    return step;
  }

  private cloneJob(job: ProvisioningJob): ProvisioningJobWithSteps {
    return {
      ...job,
      steps: Array.from(this.steps.values())
        .filter((step) => step.provisioningJobId === job.id)
        .map((step) => ({ ...step }))
    };
  }
}

async function main() {
  const store = new MemoryProvisioningStore();
  const tenantId = randomUUID();
  const actorUserId = randomUUID();
  let seedDefaultRuns = 0;
  let inviteRuns = 0;

  const job = await createProvisioningJob(store, {
    tenantId,
    actorUserId,
    stepKeys: ["seed_defaults", "create_admin_invite"]
  });

  await assert.rejects(
    () =>
      runProvisioningJob(store, job.id, actorUserId, {
        seed_defaults: () => {
          seedDefaultRuns += 1;
        },
        create_admin_invite: () => {
          inviteRuns += 1;
          throw new Error("SMTP provider unavailable");
        }
      }),
    /SMTP provider unavailable/
  );

  const failedJob = await store.getJob(job.id);
  assert.ok(failedJob);
  assert.equal(failedJob.status, "failed");
  assert.equal(seedDefaultRuns, 1);
  assert.equal(inviteRuns, 1);
  assert.equal(failedJob.steps[0]?.status, "succeeded");
  assert.equal(failedJob.steps[0]?.attemptCount, 1);
  assert.equal(failedJob.steps[1]?.status, "failed");
  assert.equal(failedJob.steps[1]?.attemptCount, 1);

  const failedStepId = failedJob.steps[1]?.id;
  assert.ok(failedStepId);

  await retryProvisioningStep(store, failedStepId, actorUserId, {
    seed_defaults: () => {
      seedDefaultRuns += 1;
    },
    create_admin_invite: () => {
      inviteRuns += 1;
    }
  });

  const retriedJob = await store.getJob(job.id);
  assert.ok(retriedJob);
  assert.equal(retriedJob.status, "succeeded");
  assert.equal(seedDefaultRuns, 1);
  assert.equal(inviteRuns, 2);
  assert.equal(retriedJob.steps[0]?.status, "succeeded");
  assert.equal(retriedJob.steps[0]?.attemptCount, 1);
  assert.equal(retriedJob.steps[1]?.status, "succeeded");
  assert.equal(retriedJob.steps[1]?.attemptCount, 2);
  assert.equal(store.auditEvents.filter((event) => event.action === "provisioning.step.retried").length, 1);

  console.log("Provisioning retry tests passed.");
}

void main();
