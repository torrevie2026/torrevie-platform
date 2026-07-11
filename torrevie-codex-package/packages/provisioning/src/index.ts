import type { SupabaseClient } from "@supabase/supabase-js";

export const defaultProvisioningStepKeys = [
  "generate_tenant_identifier",
  "create_tenant_record",
  "initialize_tenant_settings",
  "create_admin_invitation",
  "apply_default_roles",
  "initialize_product_defaults",
  "setup_storage_path",
  "send_onboarding_email"
] as const;

export const provisioningStatuses = ["pending", "running", "succeeded", "failed"] as const;

export type ProvisioningStatus = (typeof provisioningStatuses)[number];
export type ProvisioningStepKey = (typeof defaultProvisioningStepKeys)[number] | string;

export type ProvisioningJob = {
  id: string;
  tenantId: string;
  status: ProvisioningStatus;
  startedAt: string | null;
  completedAt: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProvisioningStep = {
  id: string;
  provisioningJobId: string;
  tenantId: string;
  stepKey: ProvisioningStepKey;
  status: ProvisioningStatus;
  attemptCount: number;
  error: string | null;
  createdAt: string;
  updatedAt: string;
};

export type ProvisioningJobWithSteps = ProvisioningJob & {
  steps: ProvisioningStep[];
};

export type ProvisioningStepHandler = (context: {
  job: ProvisioningJob;
  step: ProvisioningStep;
  actorUserId: string;
}) => Promise<void> | void;

export type ProvisioningStepHandlers = Partial<Record<string, ProvisioningStepHandler>>;

export type ProvisioningStore = {
  createJob(input: {
    tenantId: string;
    actorUserId: string;
    stepKeys: ProvisioningStepKey[];
  }): Promise<ProvisioningJobWithSteps>;
  listJobs(): Promise<ProvisioningJobWithSteps[]>;
  getJob(jobId: string): Promise<ProvisioningJobWithSteps | null>;
  getStep(stepId: string): Promise<ProvisioningStep | null>;
  setJobRunning(jobId: string, actorUserId: string): Promise<ProvisioningJob>;
  setJobSucceeded(jobId: string, actorUserId: string): Promise<ProvisioningJob>;
  setJobFailed(jobId: string, actorUserId: string): Promise<ProvisioningJob>;
  setStepRunning(step: ProvisioningStep, actorUserId: string): Promise<ProvisioningStep>;
  setStepSucceeded(stepId: string, actorUserId: string): Promise<ProvisioningStep>;
  setStepFailed(stepId: string, error: string, actorUserId: string): Promise<ProvisioningStep>;
  writeAuditEvent(event: {
    tenantId: string;
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, string>;
  }): Promise<void>;
};

export async function createProvisioningJob(
  store: ProvisioningStore,
  input: {
    tenantId: string;
    actorUserId: string;
    stepKeys?: ProvisioningStepKey[];
  }
) {
  const stepKeys = [...(input.stepKeys ?? defaultProvisioningStepKeys)];
  const job = await store.createJob({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    stepKeys
  });

  await store.writeAuditEvent({
    tenantId: input.tenantId,
    actorUserId: input.actorUserId,
    action: "provisioning.job.created",
    targetType: "provisioning_job",
    targetId: job.id,
    metadata: {
      status: job.status,
      step_count: String(job.steps.length)
    }
  });

  return job;
}

export async function runProvisioningJob(
  store: ProvisioningStore,
  jobId: string,
  actorUserId: string,
  handlers: ProvisioningStepHandlers = {}
) {
  const initialJob = await requireJob(store, jobId);
  let job = await store.setJobRunning(initialJob.id, actorUserId);

  await store.writeAuditEvent({
    tenantId: job.tenantId,
    actorUserId,
    action: "provisioning.job.running",
    targetType: "provisioning_job",
    targetId: job.id,
    metadata: {
      status: job.status
    }
  });

  const runnableSteps = initialJob.steps.filter((step) => step.status !== "succeeded");

  for (const step of runnableSteps) {
    const runningStep = await store.setStepRunning(step, actorUserId);

    try {
      await executeStepHandler(handlers, job, runningStep, actorUserId);
      await store.setStepSucceeded(runningStep.id, actorUserId);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Unknown provisioning error.";
      await store.setStepFailed(runningStep.id, message, actorUserId);
      job = await store.setJobFailed(job.id, actorUserId);
      await store.writeAuditEvent({
        tenantId: job.tenantId,
        actorUserId,
        action: "provisioning.job.failed",
        targetType: "provisioning_job",
        targetId: job.id,
        metadata: {
          failed_step: runningStep.stepKey,
          error: message
        }
      });
      throw new Error(`Provisioning step ${runningStep.stepKey} failed: ${message}`);
    }
  }

  job = await store.setJobSucceeded(job.id, actorUserId);
  await store.writeAuditEvent({
    tenantId: job.tenantId,
    actorUserId,
    action: "provisioning.job.succeeded",
    targetType: "provisioning_job",
    targetId: job.id,
    metadata: {
      status: job.status
    }
  });

  return await requireJob(store, job.id);
}

export async function retryProvisioningStep(
  store: ProvisioningStore,
  stepId: string,
  actorUserId: string,
  handlers: ProvisioningStepHandlers = {}
) {
  const step = await store.getStep(stepId);

  if (!step) {
    throw new Error("Provisioning step was not found.");
  }

  if (step.status !== "failed") {
    throw new Error("Only failed provisioning steps can be retried.");
  }

  const job = await requireJob(store, step.provisioningJobId);
  await store.setJobRunning(job.id, actorUserId);
  const runningStep = await store.setStepRunning(step, actorUserId);

  try {
    await executeStepHandler(handlers, job, runningStep, actorUserId);
    await store.setStepSucceeded(runningStep.id, actorUserId);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Unknown provisioning error.";
    await store.setStepFailed(runningStep.id, message, actorUserId);
    await store.setJobFailed(job.id, actorUserId);
    throw new Error(`Provisioning step ${runningStep.stepKey} failed: ${message}`);
  }

  const refreshed = await requireJob(store, job.id);
  const allSucceeded = refreshed.steps.every((candidate) => candidate.status === "succeeded");

  if (allSucceeded) {
    await store.setJobSucceeded(job.id, actorUserId);
  }

  await store.writeAuditEvent({
    tenantId: step.tenantId,
    actorUserId,
    action: "provisioning.step.retried",
    targetType: "provisioning_step",
    targetId: step.id,
    metadata: {
      step_key: step.stepKey
    }
  });

  return await requireJob(store, job.id);
}

export class SupabaseProvisioningStore implements ProvisioningStore {
  constructor(private readonly client: SupabaseClient) {}

  async createJob(input: {
    tenantId: string;
    actorUserId: string;
    stepKeys: ProvisioningStepKey[];
  }): Promise<ProvisioningJobWithSteps> {
    const { data, error } = await this.client
      .from("provisioning_jobs")
      .insert({
        tenant_id: input.tenantId,
        status: "pending",
        created_by: input.actorUserId,
        updated_by: input.actorUserId
      })
      .select("id,tenant_id,status,started_at,completed_at,created_at,updated_at")
      .single();

    if (error) {
      throw new Error(`Unable to create provisioning job: ${error.message}`);
    }

    const job = mapJob(data as ProvisioningJobRow);
    const stepRows = input.stepKeys.map((stepKey) => ({
      provisioning_job_id: job.id,
      tenant_id: job.tenantId,
      step_key: stepKey,
      status: "pending",
      created_by: input.actorUserId,
      updated_by: input.actorUserId
    }));
    const { error: stepsError } = await this.client.from("provisioning_steps").insert(stepRows);

    if (stepsError) {
      throw new Error(`Unable to create provisioning steps: ${stepsError.message}`);
    }

    return await requireJob(this, job.id);
  }

  async listJobs(): Promise<ProvisioningJobWithSteps[]> {
    const { data, error } = await this.client
      .from("provisioning_jobs")
      .select("id,tenant_id,status,started_at,completed_at,created_at,updated_at")
      .order("created_at", { ascending: false });

    if (error) {
      throw new Error(`Unable to list provisioning jobs: ${error.message}`);
    }

    const jobs = ((data ?? []) as ProvisioningJobRow[]).map(mapJob);

    if (jobs.length === 0) {
      return [];
    }

    const { data: stepsData, error: stepsError } = await this.client
      .from("provisioning_steps")
      .select("id,provisioning_job_id,tenant_id,step_key,status,attempt_count,error,created_at,updated_at")
      .in(
        "provisioning_job_id",
        jobs.map((job) => job.id)
      )
      .order("created_at", { ascending: true });

    if (stepsError) {
      throw new Error(`Unable to list provisioning steps: ${stepsError.message}`);
    }

    const steps = ((stepsData ?? []) as ProvisioningStepRow[]).map(mapStep);
    return jobs.map((job) => ({
      ...job,
      steps: steps.filter((step) => step.provisioningJobId === job.id)
    }));
  }

  async getJob(jobId: string): Promise<ProvisioningJobWithSteps | null> {
    const { data, error } = await this.client
      .from("provisioning_jobs")
      .select("id,tenant_id,status,started_at,completed_at,created_at,updated_at")
      .eq("id", jobId)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to get provisioning job: ${error.message}`);
    }

    if (!data) {
      return null;
    }

    const { data: stepsData, error: stepsError } = await this.client
      .from("provisioning_steps")
      .select("id,provisioning_job_id,tenant_id,step_key,status,attempt_count,error,created_at,updated_at")
      .eq("provisioning_job_id", jobId)
      .order("created_at", { ascending: true });

    if (stepsError) {
      throw new Error(`Unable to get provisioning steps: ${stepsError.message}`);
    }

    return {
      ...mapJob(data as ProvisioningJobRow),
      steps: ((stepsData ?? []) as ProvisioningStepRow[]).map(mapStep)
    };
  }

  async getStep(stepId: string): Promise<ProvisioningStep | null> {
    const { data, error } = await this.client
      .from("provisioning_steps")
      .select("id,provisioning_job_id,tenant_id,step_key,status,attempt_count,error,created_at,updated_at")
      .eq("id", stepId)
      .maybeSingle();

    if (error) {
      throw new Error(`Unable to get provisioning step: ${error.message}`);
    }

    return data ? mapStep(data as ProvisioningStepRow) : null;
  }

  async setJobRunning(jobId: string, actorUserId: string) {
    return await this.updateJob(jobId, {
      status: "running",
      started_at: new Date().toISOString(),
      completed_at: null,
      updated_by: actorUserId
    });
  }

  async setJobSucceeded(jobId: string, actorUserId: string) {
    return await this.updateJob(jobId, {
      status: "succeeded",
      completed_at: new Date().toISOString(),
      updated_by: actorUserId
    });
  }

  async setJobFailed(jobId: string, actorUserId: string) {
    return await this.updateJob(jobId, {
      status: "failed",
      completed_at: new Date().toISOString(),
      updated_by: actorUserId
    });
  }

  async setStepRunning(step: ProvisioningStep, actorUserId: string) {
    return await this.updateStep(step.id, {
      status: "running",
      attempt_count: step.attemptCount + 1,
      error: null,
      updated_by: actorUserId
    });
  }

  async setStepSucceeded(stepId: string, actorUserId: string) {
    return await this.updateStep(stepId, {
      status: "succeeded",
      error: null,
      updated_by: actorUserId
    });
  }

  async setStepFailed(stepId: string, error: string, actorUserId: string) {
    return await this.updateStep(stepId, {
      status: "failed",
      error,
      updated_by: actorUserId
    });
  }

  async writeAuditEvent(event: {
    tenantId: string;
    actorUserId: string;
    action: string;
    targetType: string;
    targetId: string;
    metadata: Record<string, string>;
  }) {
    const { error } = await this.client.from("audit_events").insert({
      tenant_id: event.tenantId,
      actor_user_id: event.actorUserId,
      action: event.action,
      target_type: event.targetType,
      target_id: event.targetId,
      metadata: event.metadata
    });

    if (error) {
      throw new Error(`Unable to write provisioning audit event: ${error.message}`);
    }
  }

  private async updateJob(jobId: string, values: ProvisioningJobUpdate) {
    const { data, error } = await this.client
      .from("provisioning_jobs")
      .update(values)
      .eq("id", jobId)
      .select("id,tenant_id,status,started_at,completed_at,created_at,updated_at")
      .single();

    if (error) {
      throw new Error(`Unable to update provisioning job: ${error.message}`);
    }

    return mapJob(data as ProvisioningJobRow);
  }

  private async updateStep(stepId: string, values: ProvisioningStepUpdate) {
    const { data, error } = await this.client
      .from("provisioning_steps")
      .update(values)
      .eq("id", stepId)
      .select("id,provisioning_job_id,tenant_id,step_key,status,attempt_count,error,created_at,updated_at")
      .single();

    if (error) {
      throw new Error(`Unable to update provisioning step: ${error.message}`);
    }

    return mapStep(data as ProvisioningStepRow);
  }
}

async function requireJob(store: ProvisioningStore, jobId: string) {
  const job = await store.getJob(jobId);

  if (!job) {
    throw new Error("Provisioning job was not found.");
  }

  return job;
}

async function executeStepHandler(
  handlers: ProvisioningStepHandlers,
  job: ProvisioningJob,
  step: ProvisioningStep,
  actorUserId: string
) {
  const handler = handlers[step.stepKey];

  if (handler) {
    await handler({ job, step, actorUserId });
  }
}

function mapJob(row: ProvisioningJobRow): ProvisioningJob {
  return {
    id: row.id,
    tenantId: row.tenant_id,
    status: row.status,
    startedAt: row.started_at,
    completedAt: row.completed_at,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapStep(row: ProvisioningStepRow): ProvisioningStep {
  return {
    id: row.id,
    provisioningJobId: row.provisioning_job_id,
    tenantId: row.tenant_id,
    stepKey: row.step_key,
    status: row.status,
    attemptCount: row.attempt_count,
    error: row.error,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

type ProvisioningJobRow = {
  id: string;
  tenant_id: string;
  status: ProvisioningStatus;
  started_at: string | null;
  completed_at: string | null;
  created_at: string;
  updated_at: string;
};

type ProvisioningStepRow = {
  id: string;
  provisioning_job_id: string;
  tenant_id: string;
  step_key: string;
  status: ProvisioningStatus;
  attempt_count: number;
  error: string | null;
  created_at: string;
  updated_at: string;
};

type ProvisioningJobUpdate = {
  status: ProvisioningStatus;
  started_at?: string;
  completed_at?: string | null;
  updated_by: string;
};

type ProvisioningStepUpdate = {
  status: ProvisioningStatus;
  attempt_count?: number;
  error: string | null;
  updated_by: string;
};
