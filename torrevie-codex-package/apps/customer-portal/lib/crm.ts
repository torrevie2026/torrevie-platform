import { assertPermission, type ProductKey, type RoleKey } from "@torrevie/permissions";
import { withTenantContext, type ResolvedTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";

export type CrmActorContext = ResolvedTenantContext & {
  roles: readonly RoleKey[];
  entitledProducts: readonly ProductKey[];
  moduleAdminProducts?: readonly ProductKey[];
};

export type CrmAccountInput = {
  name: string;
  industry?: string | null;
};

export type CrmContactInput = {
  firstName: string;
  lastName?: string | null;
  email?: string | null;
  phone?: string | null;
};

export type CrmOpportunityInput = {
  name: string;
  amount?: number | null;
  currency?: string | null;
  pipelineStageId?: string | null;
};

export type CrmVerticalSliceInput = {
  account: CrmAccountInput;
  contact: CrmContactInput;
  opportunity: CrmOpportunityInput;
};

export type CrmPipelineStage = {
  id: string;
  key: string;
  label: string;
  sortOrder: number;
};

export type CrmOpportunityCard = {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  version: number;
  accountName: string;
  contactName: string | null;
  ownerUserId: string | null;
  pipelineStageId: string;
};

export type CrmPipelineColumn = CrmPipelineStage & {
  opportunities: CrmOpportunityCard[];
};

export type CrmDashboard = {
  accountCount: number;
  contactCount: number;
  opportunityCount: number;
  pipeline: CrmPipelineColumn[];
};

export type CrmVerticalSliceResult = {
  accountId: string;
  contactId: string;
  opportunityId: string;
  pipelineStageId: string;
};

const defaultPipelineStages = [
  { key: "qualified", label: "Qualified", sortOrder: 10 },
  { key: "proposal", label: "Proposal", sortOrder: 20 },
  { key: "won", label: "Won", sortOrder: 30 }
] as const;

export async function ensureDefaultCrmPipeline(
  client: TenantQueryClient,
  actor: CrmActorContext
): Promise<CrmPipelineStage[]> {
  assertCrmPermission(actor, "crm.pipeline.manage");

  return withTenantContext(client, actor, async () => {
    for (const stage of defaultPipelineStages) {
      await client.query(
        `
          insert into public.pipeline_stages (tenant_id, key, label, sort_order, created_by, updated_by)
          values (public.current_tenant_id(), $1, $2, $3, $4, $4)
          on conflict (tenant_id, key)
          do update set label = excluded.label,
                        sort_order = excluded.sort_order,
                        updated_by = excluded.updated_by
        `,
        [stage.key, stage.label, stage.sortOrder, actor.userId]
      );
    }

    const stages = await listPipelineStagesInContext(client);
    await writeCrmAuditEvent(client, actor, {
      action: "crm.pipeline.initialized",
      targetType: "pipeline",
      targetId: stages[0]?.id ?? null,
      metadata: {
        stage_count: String(stages.length)
      }
    });

    return stages;
  });
}

export async function listCrmDashboard(
  client: TenantQueryClient,
  actor: CrmActorContext
): Promise<CrmDashboard> {
  assertCrmPermission(actor, "crm.account.read");
  assertCrmPermission(actor, "crm.opportunity.read");

  return withTenantContext(client, actor, async () => {
    const [stages, counts, opportunityRows] = await Promise.all([
      listPipelineStagesInContext(client),
      listCrmCountsInContext(client),
      client.query<OpportunityRow>(
        `
          select
            o.id,
            o.name,
            o.amount,
            o.currency,
            o.version,
            o.owner_user_id,
            o.pipeline_stage_id,
            a.name as account_name,
            nullif(concat_ws(' ', c.first_name, c.last_name), '') as contact_name
          from public.opportunities o
          join public.accounts a
            on a.tenant_id = o.tenant_id
           and a.id = o.account_id
          left join public.contacts c
            on c.tenant_id = o.tenant_id
           and c.id = o.primary_contact_id
          where o.tenant_id = public.current_tenant_id()
          order by o.created_at desc
        `
      )
    ]);

    const cards = opportunityRows.rows.map(mapOpportunityCard);

    return {
      ...counts,
      pipeline: stages.map((stage) => ({
        ...stage,
        opportunities: cards.filter((card) => card.pipelineStageId === stage.id)
      }))
    };
  });
}

export async function createCrmVerticalSlice(
  client: TenantQueryClient,
  actor: CrmActorContext,
  input: CrmVerticalSliceInput
): Promise<CrmVerticalSliceResult> {
  assertCrmPermission(actor, "crm.account.write");
  assertCrmPermission(actor, "crm.opportunity.write", actor.userId);

  const account = sanitizeAccount(input.account);
  const contact = sanitizeContact(input.contact);
  const opportunity = sanitizeOpportunity(input.opportunity);

  return withTenantContext(client, actor, async () => {
    const pipelineStageId = opportunity.pipelineStageId ?? (await firstPipelineStageId(client));

    const accountResult = await client.query<{ id: string }>(
      `
        insert into public.accounts (tenant_id, name, industry, owner_user_id, created_by, updated_by)
        values (public.current_tenant_id(), $1, $2, $3, $3, $3)
        returning id
      `,
      [account.name, account.industry, actor.userId]
    );
    const accountId = requireSingleId(accountResult.rows, "account");
    await writeCrmAuditEvent(client, actor, {
      action: "crm.account.created",
      targetType: "account",
      targetId: accountId,
      metadata: {
        source: "crm_vertical_slice"
      }
    });

    const contactResult = await client.query<{ id: string }>(
      `
        insert into public.contacts (
          tenant_id,
          account_id,
          first_name,
          last_name,
          email,
          phone,
          source_module,
          created_by,
          updated_by
        )
        values (public.current_tenant_id(), $1, $2, $3, $4, $5, 'crm', $6, $6)
        returning id
      `,
      [accountId, contact.firstName, contact.lastName, contact.email, contact.phone, actor.userId]
    );
    const contactId = requireSingleId(contactResult.rows, "contact");
    await writeCrmAuditEvent(client, actor, {
      action: "crm.contact.created",
      targetType: "contact",
      targetId: contactId,
      metadata: {
        source: "crm_vertical_slice"
      }
    });

    const opportunityResult = await client.query<{ id: string }>(
      `
        insert into public.opportunities (
          tenant_id,
          account_id,
          primary_contact_id,
          pipeline_stage_id,
          name,
          amount,
          currency,
          owner_user_id,
          created_by,
          updated_by
        )
        values (public.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $7, $7)
        returning id
      `,
      [
        accountId,
        contactId,
        pipelineStageId,
        opportunity.name,
        opportunity.amount,
        opportunity.currency,
        actor.userId
      ]
    );
    const opportunityId = requireSingleId(opportunityResult.rows, "opportunity");
    await writeCrmAuditEvent(client, actor, {
      action: "crm.opportunity.created",
      targetType: "opportunity",
      targetId: opportunityId,
      metadata: {
        pipeline_stage_id: pipelineStageId,
        currency: opportunity.currency ?? "AED",
        source: "crm_vertical_slice"
      }
    });

    return {
      accountId,
      contactId,
      opportunityId,
      pipelineStageId
    };
  });
}

export async function moveOpportunityToStage(
  client: TenantQueryClient,
  actor: CrmActorContext,
  opportunityId: string,
  pipelineStageId: string
): Promise<{ opportunityId: string; pipelineStageId: string; version: number }> {
  assertUuid(opportunityId, "opportunity id");
  assertUuid(pipelineStageId, "pipeline stage id");

  return withTenantContext(client, actor, async () => {
    const existing = await client.query<{ owner_user_id: string | null; version: number }>(
      `
        select owner_user_id, version
        from public.opportunities
        where tenant_id = public.current_tenant_id()
          and id = $1
      `,
      [opportunityId]
    );
    const [row] = existing.rows;

    if (!row) {
      throw new Error("Opportunity was not found.");
    }

    assertCrmPermission(actor, "crm.opportunity.write", row.owner_user_id ?? undefined);
    await assertPipelineStageExists(client, pipelineStageId);

    const result = await client.query<{ id: string; pipeline_stage_id: string; version: number }>(
      `
        update public.opportunities
           set pipeline_stage_id = $1,
               version = version + 1,
               updated_by = $2
         where tenant_id = public.current_tenant_id()
           and id = $3
         returning id, pipeline_stage_id, version
      `,
      [pipelineStageId, actor.userId, opportunityId]
    );
    const [updated] = result.rows;

    if (!updated) {
      throw new Error("Opportunity could not be moved.");
    }

    await writeCrmAuditEvent(client, actor, {
      action: "crm.opportunity.stage_moved",
      targetType: "opportunity",
      targetId: updated.id,
      metadata: {
        pipeline_stage_id: updated.pipeline_stage_id,
        version: String(updated.version)
      }
    });

    return {
      opportunityId: updated.id,
      pipelineStageId: updated.pipeline_stage_id,
      version: updated.version
    };
  });
}

async function writeCrmAuditEvent(
  client: TenantQueryClient,
  actor: CrmActorContext,
  event: {
    action: string;
    targetType: string;
    targetId: string | null;
    metadata?: Record<string, string>;
  }
) {
  await client.query(
    `
      insert into public.audit_events (tenant_id, actor_user_id, action, target_type, target_id, metadata)
      values (public.current_tenant_id(), $1, $2, $3, $4, $5::jsonb)
    `,
    [actor.userId, event.action, event.targetType, event.targetId, JSON.stringify(event.metadata ?? {})]
  );
}

function assertCrmPermission(
  actor: CrmActorContext,
  permission: "crm.account.read" | "crm.account.write" | "crm.opportunity.read" | "crm.opportunity.write" | "crm.pipeline.manage",
  ownerUserId?: string
) {
  if (actor.roleScope !== "customer") {
    throw new Error("CRM access requires a customer tenant context.");
  }

  assertPermission({
    roles: actor.roles,
    permission,
    entitledProducts: actor.entitledProducts,
    moduleAdminProducts: actor.moduleAdminProducts,
    ownership: {
      actorUserId: actor.userId,
      ownerUserId
    }
  });
}

async function listPipelineStagesInContext(client: TenantQueryClient): Promise<CrmPipelineStage[]> {
  const result = await client.query<PipelineStageRow>(
    `
      select id, key, label, sort_order
      from public.pipeline_stages
      where tenant_id = public.current_tenant_id()
      order by sort_order asc, label asc
    `
  );

  return result.rows.map((stage) => ({
    id: stage.id,
    key: stage.key,
    label: stage.label,
    sortOrder: stage.sort_order
  }));
}

async function listCrmCountsInContext(client: TenantQueryClient) {
  const result = await client.query<{ account_count: number; contact_count: number; opportunity_count: number }>(
    `
      select
        (select count(*)::int from public.accounts where tenant_id = public.current_tenant_id() and deleted_at is null) as account_count,
        (select count(*)::int from public.contacts where tenant_id = public.current_tenant_id() and deleted_at is null) as contact_count,
        (select count(*)::int from public.opportunities where tenant_id = public.current_tenant_id()) as opportunity_count
    `
  );
  const [row] = result.rows;

  return {
    accountCount: row?.account_count ?? 0,
    contactCount: row?.contact_count ?? 0,
    opportunityCount: row?.opportunity_count ?? 0
  };
}

async function firstPipelineStageId(client: TenantQueryClient) {
  const result = await client.query<{ id: string }>(
    `
      select id
      from public.pipeline_stages
      where tenant_id = public.current_tenant_id()
      order by sort_order asc
      limit 1
    `
  );
  return requireSingleId(result.rows, "pipeline stage");
}

async function assertPipelineStageExists(client: TenantQueryClient, pipelineStageId: string) {
  const result = await client.query<{ id: string }>(
    `
      select id
      from public.pipeline_stages
      where tenant_id = public.current_tenant_id()
        and id = $1
    `,
    [pipelineStageId]
  );

  if (result.rows.length !== 1) {
    throw new Error("Pipeline stage was not found.");
  }
}

function sanitizeAccount(input: CrmAccountInput): Required<CrmAccountInput> {
  const name = input.name.trim();

  if (name.length < 2) {
    throw new Error("Account name must be at least 2 characters.");
  }

  return {
    name,
    industry: cleanOptional(input.industry)
  };
}

function sanitizeContact(input: CrmContactInput): Required<CrmContactInput> {
  const firstName = input.firstName.trim();

  if (firstName.length < 1) {
    throw new Error("Contact first name is required.");
  }

  const email = cleanOptional(input.email)?.toLowerCase() ?? null;

  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    throw new Error("A valid contact email address is required.");
  }

  return {
    firstName,
    lastName: cleanOptional(input.lastName),
    email,
    phone: cleanOptional(input.phone)
  };
}

function sanitizeOpportunity(input: CrmOpportunityInput): Required<CrmOpportunityInput> {
  const name = input.name.trim();

  if (name.length < 2) {
    throw new Error("Opportunity name must be at least 2 characters.");
  }

  const amount = input.amount ?? null;

  if (amount !== null && amount < 0) {
    throw new Error("Opportunity amount cannot be negative.");
  }

  const currency = (input.currency?.trim().toUpperCase() || "AED");

  if (!/^[A-Z]{3}$/.test(currency)) {
    throw new Error("Opportunity currency must be a three-letter ISO code.");
  }

  return {
    name,
    amount,
    currency,
    pipelineStageId: cleanOptional(input.pipelineStageId)
  };
}

function cleanOptional(value: string | null | undefined) {
  const clean = value?.trim();
  return clean ? clean : null;
}

function assertUuid(value: string, label: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value)) {
    throw new Error(`Invalid ${label}.`);
  }
}

function requireSingleId(rows: readonly { id: string }[], label: string) {
  const [row] = rows;

  if (!row) {
    throw new Error(`Unable to create or find ${label}.`);
  }

  return row.id;
}

function mapOpportunityCard(row: OpportunityRow): CrmOpportunityCard {
  return {
    id: row.id,
    name: row.name,
    amount: row.amount,
    currency: row.currency,
    version: row.version,
    accountName: row.account_name,
    contactName: row.contact_name,
    ownerUserId: row.owner_user_id,
    pipelineStageId: row.pipeline_stage_id
  };
}

type PipelineStageRow = {
  id: string;
  key: string;
  label: string;
  sort_order: number;
};

type OpportunityRow = {
  id: string;
  name: string;
  amount: number | null;
  currency: string;
  version: number;
  owner_user_id: string | null;
  pipeline_stage_id: string;
  account_name: string;
  contact_name: string | null;
};
