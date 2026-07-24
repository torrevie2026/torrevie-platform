import {
  withTenantContext,
  type ResolvedTenantContext,
  type TenantQueryClient
} from "@torrevie/tenant-context";

export const fsmJobStatuses = [
  "new",
  "triage",
  "scheduled",
  "assigned",
  "in_progress",
  "waiting_info",
  "waiting_access",
  "on_hold",
  "pending_approval",
  "temp_fix",
  "rework",
  "completed",
  "closed",
  "cancelled"
] as const;

export const fsmUrgencyLevels = ["low", "medium", "high", "emergency"] as const;

export type FsmJobStatus = (typeof fsmJobStatuses)[number];
export type FsmUrgencyLevel = (typeof fsmUrgencyLevels)[number];

export type FsmJob = {
  id: string;
  jobNumber: string;
  title: string;
  description: string | null;
  status: FsmJobStatus;
  urgency: FsmUrgencyLevel;
  accountId: string | null;
  accountName: string | null;
  siteText: string | null;
  sourceChannel: string | null;
  assignedUserId: string | null;
  assignedName: string | null;
  scheduledFor: string | null;
  completedAt: string | null;
  createdAt: string;
};

export type FsmJobOption = {
  id: string;
  label: string;
};

export type FsmJobsWorkspace = {
  jobs: FsmJob[];
  accounts: FsmJobOption[];
  technicians: FsmJobOption[];
};

export type FsmJobInput = {
  title: string;
  description?: string | null;
  urgency: FsmUrgencyLevel;
  accountId?: string | null;
  siteText?: string | null;
  assignedUserId?: string | null;
  scheduledFor?: string | null;
  sourceChannel?: "whatsapp" | "voice" | "email" | "portal" | null;
  intakeRequestId?: string | null;
};

export type FsmJobStatusInput = {
  jobId: string;
  status: FsmJobStatus;
  note?: string | null;
};

type JobRow = {
  id: string;
  job_number: string;
  title: string;
  description: string | null;
  status: FsmJobStatus;
  urgency: FsmUrgencyLevel;
  account_id: string | null;
  account_name: string | null;
  site_text: string | null;
  source_channel: string | null;
  assigned_user_id: string | null;
  assigned_name: string | null;
  scheduled_for: string | null;
  completed_at: string | null;
  created_at: string;
};

type OptionRow = {
  id: string;
  label: string;
};

type IdRow = {
  id: string;
};

type StatusRow = {
  status: FsmJobStatus;
};

type EntitlementRow = {
  feature_key: string;
  enabled: boolean;
};

export async function listFsmJobsWorkspace(
  client: TenantQueryClient,
  context: ResolvedTenantContext
): Promise<FsmJobsWorkspace> {
  return withTenantContext(client, context, async () => {
    await assertJobsEntitled(client);

    const jobs = await client.query<JobRow>(
      `
          select
            jobs.id,
            jobs.job_number,
            jobs.title,
            jobs.description,
            jobs.status,
            jobs.urgency,
            jobs.account_id,
            accounts.name as account_name,
            jobs.site_text,
            jobs.source_channel::text,
            jobs.assigned_user_id,
            user_profiles.display_name as assigned_name,
            jobs.scheduled_for,
            jobs.completed_at,
            jobs.created_at
          from public.fsm_jobs jobs
          left join public.accounts accounts
            on accounts.tenant_id = jobs.tenant_id
           and accounts.id = jobs.account_id
           and accounts.deleted_at is null
          left join public.user_profiles
            on user_profiles.tenant_id = jobs.tenant_id
           and user_profiles.user_id = jobs.assigned_user_id
          where jobs.tenant_id = public.current_tenant_id()
          order by
            case jobs.urgency
              when 'emergency' then 0
              when 'high' then 1
              when 'medium' then 2
              else 3
            end,
            jobs.created_at desc
          limit 50
        `
    );
    const accounts = await client.query<OptionRow>(
      `
          select id, name as label
          from public.accounts
          where tenant_id = public.current_tenant_id()
            and deleted_at is null
          order by name
          limit 100
        `
    );
    const technicians = await client.query<OptionRow>(
      `
          select users.id, coalesce(user_profiles.display_name, users.email) as label
          from public.tenant_memberships memberships
          join public.users users
            on users.id = memberships.user_id
           and users.status = 'active'
          left join public.user_profiles
            on user_profiles.tenant_id = memberships.tenant_id
           and user_profiles.user_id = memberships.user_id
          where memberships.tenant_id = public.current_tenant_id()
            and memberships.status = 'active'
          order by label
          limit 100
        `
    );

    return {
      jobs: jobs.rows.map(mapJob),
      accounts: accounts.rows,
      technicians: technicians.rows
    };
  });
}

export async function createFsmJob(
  client: TenantQueryClient,
  context: ResolvedTenantContext,
  input: FsmJobInput
) {
  const job = sanitizeJobInput(input);

  return withTenantContext(client, context, async () => {
    await assertJobsEntitled(client);

    const created = await client.query<IdRow>(
      `
        insert into public.fsm_jobs (
          tenant_id,
          job_number,
          title,
          description,
          status,
          urgency,
          account_id,
          site_text,
          source_channel,
          intake_request_id,
          assigned_user_id,
          scheduled_for,
          created_by,
          updated_by
        )
        values (
          public.current_tenant_id(),
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          $8::public.channel_type,
          $9,
          $10,
          $11::timestamptz,
          $12,
          $12
        )
        returning id
      `,
      [
        buildJobNumber(),
        job.title,
        job.description ?? null,
        initialStatus(job),
        job.urgency,
        job.accountId ?? null,
        job.siteText ?? null,
        job.sourceChannel ?? null,
        job.intakeRequestId ?? null,
        job.assignedUserId ?? null,
        job.scheduledFor ?? null,
        context.userId
      ]
    );
    const jobId = requireId(created.rows, "job");

    await writeJobStateHistory(client, context, {
      jobId,
      oldStatus: null,
      newStatus: initialStatus(job),
      note: "Job created"
    });
    await writeFsmJobAuditEvent(client, context, "fsm.job.created", jobId, {
      status: initialStatus(job),
      urgency: job.urgency,
      source_channel: job.sourceChannel ?? "manual"
    });

    if (job.intakeRequestId) {
      await client.query(
        `
          update public.intake_requests
          set
            status = 'converted',
            converted_job_id = $1,
            updated_by = $2
          where tenant_id = public.current_tenant_id()
            and id = $3
        `,
        [jobId, context.userId, job.intakeRequestId]
      );
    }

    return jobId;
  });
}

export async function updateFsmJobStatus(
  client: TenantQueryClient,
  context: ResolvedTenantContext,
  input: FsmJobStatusInput
) {
  const status = normalizeJobStatus(input.status);
  const jobId = requiredUuid(input.jobId, "job");
  const note = optionalText(input.note);

  return withTenantContext(client, context, async () => {
    await assertJobsEntitled(client);

    const existing = await client.query<StatusRow>(
      `
        select status
        from public.fsm_jobs
        where tenant_id = public.current_tenant_id()
          and id = $1
        limit 1
      `,
      [jobId]
    );
    const oldStatus = existing.rows[0]?.status;

    if (!oldStatus) {
      throw new Error("FSM job was not found.");
    }

    if (oldStatus === status) {
      return;
    }

    await client.query(
      `
        update public.fsm_jobs
        set
          status = $1::public.fsm_job_status,
          completed_at = case when $1::public.fsm_job_status in ('completed', 'closed') then coalesce(completed_at, now()) else completed_at end,
          updated_by = $2
        where tenant_id = public.current_tenant_id()
          and id = $3
      `,
      [status, context.userId, jobId]
    );
    await writeJobStateHistory(client, context, { jobId, oldStatus, newStatus: status, note });
    await writeFsmJobAuditEvent(client, context, "fsm.job.status_changed", jobId, {
      old_status: oldStatus,
      new_status: status
    });
  });
}

export function buildFsmJobInput(raw: {
  title: string;
  description: string;
  urgency: string;
  accountId: string;
  siteText: string;
  assignedUserId: string;
  scheduledFor: string;
}): FsmJobInput {
  return sanitizeJobInput({
    title: raw.title,
    description: raw.description,
    urgency: normalizeUrgency(raw.urgency),
    accountId: raw.accountId,
    siteText: raw.siteText,
    assignedUserId: raw.assignedUserId,
    scheduledFor: raw.scheduledFor,
    sourceChannel: null,
    intakeRequestId: null
  });
}

export function buildFsmJobStatusInput(raw: {
  jobId: string;
  status: string;
  note: string;
}): FsmJobStatusInput {
  return {
    jobId: requiredUuid(raw.jobId, "job"),
    status: normalizeJobStatus(raw.status),
    note: optionalText(raw.note)
  };
}

function sanitizeJobInput(input: FsmJobInput): FsmJobInput {
  return {
    title: requiredText(input.title, "Job title", 120),
    description: optionalText(input.description, 1000),
    urgency: normalizeUrgency(input.urgency),
    accountId: optionalUuid(input.accountId, "customer"),
    siteText: optionalText(input.siteText, 180),
    assignedUserId: optionalUuid(input.assignedUserId, "assignee"),
    scheduledFor: optionalDateTime(input.scheduledFor),
    sourceChannel: normalizeSourceChannel(input.sourceChannel),
    intakeRequestId: optionalUuid(input.intakeRequestId, "intake request")
  };
}

function mapJob(row: JobRow): FsmJob {
  return {
    id: row.id,
    jobNumber: row.job_number,
    title: row.title,
    description: row.description,
    status: row.status,
    urgency: row.urgency,
    accountId: row.account_id,
    accountName: row.account_name,
    siteText: row.site_text,
    sourceChannel: row.source_channel,
    assignedUserId: row.assigned_user_id,
    assignedName: row.assigned_name,
    scheduledFor: row.scheduled_for,
    completedAt: row.completed_at,
    createdAt: row.created_at
  };
}

async function assertJobsEntitled(client: TenantQueryClient) {
  const entitlements = await client.query<EntitlementRow>(
    `
      select feature_key, enabled
      from public.get_org_entitlements(public.current_tenant_id())
      where feature_key = 'fsm.core.jobs.enabled'
      limit 1
    `
  );

  if (!entitlements.rows.some((row) => row.enabled)) {
    throw new Error("FSM jobs require an active FSM jobs entitlement.");
  }
}

function initialStatus(job: FsmJobInput): FsmJobStatus {
  if (job.assignedUserId) {
    return "assigned";
  }

  if (job.scheduledFor) {
    return "scheduled";
  }

  return "new";
}

async function writeJobStateHistory(
  client: TenantQueryClient,
  context: ResolvedTenantContext,
  input: {
    jobId: string;
    oldStatus: FsmJobStatus | null;
    newStatus: FsmJobStatus;
    note?: string | null;
  }
) {
  await client.query(
    `
      insert into public.fsm_job_state_history (
        tenant_id,
        job_id,
        old_status,
        new_status,
        note,
        changed_by
      )
      values (
        public.current_tenant_id(),
        $1,
        $2::public.fsm_job_status,
        $3::public.fsm_job_status,
        $4,
        $5
      )
    `,
    [input.jobId, input.oldStatus, input.newStatus, input.note ?? null, context.userId]
  );
}

async function writeFsmJobAuditEvent(
  client: TenantQueryClient,
  context: ResolvedTenantContext,
  action: string,
  jobId: string,
  metadata: Record<string, string>
) {
  await client.query(
    `
      insert into public.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
      values (
        public.current_tenant_id(),
        $1,
        $2,
        'fsm_job',
        $3,
        $4::jsonb
      )
    `,
    [context.userId, action, jobId, JSON.stringify(metadata)]
  );
}

function buildJobNumber() {
  const now = new Date();
  const date = [
    now.getUTCFullYear(),
    String(now.getUTCMonth() + 1).padStart(2, "0"),
    String(now.getUTCDate()).padStart(2, "0")
  ].join("");
  const suffix = String(Math.floor(Math.random() * 10_000)).padStart(4, "0");
  return `FSM-${date}-${suffix}`;
}

function normalizeUrgency(value: string): FsmUrgencyLevel {
  return fsmUrgencyLevels.includes(value as FsmUrgencyLevel)
    ? (value as FsmUrgencyLevel)
    : "medium";
}

function normalizeJobStatus(value: string): FsmJobStatus {
  if (!fsmJobStatuses.includes(value as FsmJobStatus)) {
    throw new Error("FSM job status is not valid.");
  }

  return value as FsmJobStatus;
}

function normalizeSourceChannel(value: unknown): FsmJobInput["sourceChannel"] {
  return value === "whatsapp" || value === "voice" || value === "email" || value === "portal"
    ? value
    : null;
}

function requiredText(value: string | null | undefined, label: string, maxLength: number) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    throw new Error(`${label} is required.`);
  }

  if (trimmed.length > maxLength) {
    throw new Error(`${label} is too long.`);
  }

  return trimmed;
}

function optionalText(value: string | null | undefined, maxLength = 500) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return null;
  }

  if (trimmed.length > maxLength) {
    throw new Error("Text value is too long.");
  }

  return trimmed;
}

function optionalUuid(value: string | null | undefined, label: string) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return null;
  }

  return requiredUuid(trimmed, label);
}

function requiredUuid(value: string, label: string) {
  const trimmed = String(value ?? "").trim();

  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(trimmed)) {
    throw new Error(`The selected ${label} is not valid.`);
  }

  return trimmed;
}

function optionalDateTime(value: string | null | undefined) {
  const trimmed = String(value ?? "").trim();

  if (!trimmed) {
    return null;
  }

  const date = new Date(trimmed);

  if (Number.isNaN(date.getTime())) {
    throw new Error("Scheduled date is not valid.");
  }

  return date.toISOString();
}

function requireId(rows: IdRow[], label: string) {
  const id = rows[0]?.id;

  if (!id) {
    throw new Error(`Unable to create ${label}.`);
  }

  return id;
}
