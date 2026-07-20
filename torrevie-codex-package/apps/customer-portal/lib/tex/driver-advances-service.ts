import { withTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import { assertTexPermission } from "./access";
import { writeTexAuditEvent } from "./audit";
import type { TexDriverAdvanceRow } from "./db-types";
import { mapDriverAdvance } from "./mappers";
import { sanitizeDriverAdvance } from "./people-input";
import { assertUuid, requireSingleRow } from "./shared";
import type { TexActorContext, TexDriverAdvance, TexDriverAdvanceInput } from "./types";

export async function createTexDriverAdvance(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexDriverAdvanceInput
): Promise<TexDriverAdvance> {
  assertTexPermission(actor, "tex.finance.review");
  const advance = sanitizeDriverAdvance(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexDriverAdvanceRow>(
      `
        insert into public.tex_driver_advances (
          tenant_id,
          employee_profile_id,
          amount,
          currency,
          base_amount,
          advance_date,
          month,
          year,
          notes,
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
          $8,
          $9,
          $9
        )
        returning
          id,
          employee_profile_id,
          amount::float as amount,
          currency,
          base_amount::float as base_amount,
          advance_date::text as advance_date,
          month,
          year,
          notes
      `,
      [
        advance.employeeProfileId,
        advance.amount,
        advance.currency,
        advance.baseAmount,
        advance.advanceDate,
        advance.month,
        advance.year,
        advance.notes,
        actor.userId
      ]
    );
    const row = requireSingleRow(result.rows, "driver advance");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.finance.driver_advance_created",
      "tex_driver_advance",
      row.id,
      {
        employee_profile_id: row.employee_profile_id
      }
    );

    return mapDriverAdvance(row);
  });
}

export async function deleteTexDriverAdvance(
  client: TenantQueryClient,
  actor: TexActorContext,
  advanceId: string
): Promise<void> {
  assertTexPermission(actor, "tex.finance.review");
  assertUuid(advanceId, "driver advance id");

  await withTenantContext(client, actor, async () => {
    const result = await client.query<{ id: string; employee_profile_id: string }>(
      `
        delete from public.tex_driver_advances
        where tenant_id = public.current_tenant_id()
          and id = $1
        returning id, employee_profile_id
      `,
      [advanceId]
    );
    const row = requireSingleRow(result.rows, "driver advance");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.finance.driver_advance_deleted",
      "tex_driver_advance",
      row.id,
      {
        employee_profile_id: row.employee_profile_id
      }
    );
  });
}
