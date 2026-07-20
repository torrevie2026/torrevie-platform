import { withTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import { assertTexPermission, canReadBroadcastTexNotifications } from "./access";
import { writeTexAuditEvent } from "./audit";
import type { TexNotificationRow } from "./db-types";
import { mapNotification } from "./mappers";
import { sanitizeNotification } from "./people-input";
import { assertUuid, requireSingleRow } from "./shared";
import type { TexActorContext, TexNotification, TexNotificationInput } from "./types";

export async function listTexNotifications(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexNotification[]> {
  assertTexPermission(actor, "tex.expense.read");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexNotificationRow>(
      `
        select
          id,
          user_id,
          title,
          body,
          type,
          related_expense_id,
          related_trip_id,
          is_read,
          created_at::text as created_at
        from public.tex_notifications
        where tenant_id = public.current_tenant_id()
          and (user_id = $1 or ($2::boolean and user_id is null))
        order by created_at desc
        limit 100
      `,
      [actor.userId, canReadBroadcastTexNotifications(actor)]
    );

    return result.rows.map(mapNotification);
  });
}

export async function createTexNotification(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexNotificationInput
): Promise<TexNotification> {
  assertTexPermission(actor, "tex.expense.manage");
  const notification = sanitizeNotification(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexNotificationRow>(
      `
        insert into public.tex_notifications (
          tenant_id,
          user_id,
          title,
          body,
          type,
          related_expense_id,
          related_trip_id,
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
          $7
        )
        returning
          id,
          user_id,
          title,
          body,
          type,
          related_expense_id,
          related_trip_id,
          is_read,
          created_at::text as created_at
      `,
      [
        notification.userId,
        notification.title,
        notification.body,
        notification.type,
        notification.relatedExpenseId,
        notification.relatedTripId,
        actor.userId
      ]
    );
    const row = requireSingleRow(result.rows, "notification");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.notification.created",
      "tex_notification",
      row.id,
      {
        target_user_id: row.user_id ?? "broadcast"
      }
    );

    return mapNotification(row);
  });
}

export async function markTexNotificationRead(
  client: TenantQueryClient,
  actor: TexActorContext,
  notificationId: string
): Promise<TexNotification> {
  assertTexPermission(actor, "tex.expense.read");
  assertUuid(notificationId, "notification id");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexNotificationRow>(
      `
        update public.tex_notifications
           set is_read = true,
               updated_by = $1
         where tenant_id = public.current_tenant_id()
           and id = $2
           and (user_id = $1 or ($3::boolean and user_id is null))
        returning
          id,
          user_id,
          title,
          body,
          type,
          related_expense_id,
          related_trip_id,
          is_read,
          created_at::text as created_at
      `,
      [actor.userId, notificationId, canReadBroadcastTexNotifications(actor)]
    );
    const row = requireSingleRow(result.rows, "notification");

    await writeTexAuditEvent(client, actor, "tex.notification.read", "tex_notification", row.id, {
      target_user_id: row.user_id ?? "broadcast"
    });

    return mapNotification(row);
  });
}

export async function markAllTexNotificationsRead(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<{ updated: number }> {
  assertTexPermission(actor, "tex.expense.read");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<{ id: string }>(
      `
        update public.tex_notifications
           set is_read = true,
               updated_by = $1
         where tenant_id = public.current_tenant_id()
           and is_read = false
           and (user_id = $1 or ($2::boolean and user_id is null))
        returning id
      `,
      [actor.userId, canReadBroadcastTexNotifications(actor)]
    );

    await writeTexAuditEvent(
      client,
      actor,
      "tex.notification.read_all",
      "tex_notification",
      actor.userId,
      {
        updated: String(result.rows.length)
      }
    );

    return { updated: result.rows.length };
  });
}
