import { withTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import { assertTexPermission } from "./access";
import { writeTexAuditEvent } from "./audit";
import type { TexTripLegRow, TexTripListRow } from "./db-types";
import { mapTripLeg, mapTripListItem } from "./mappers";
import { assertUuid, requireSingleRow } from "./shared";
import { sanitizeTrip, sanitizeTripLegs, tripLegValues, tripValues } from "./trip-input";
import { assertTripExists } from "./trip-queries";
import type {
  TexActorContext,
  TexTripInput,
  TexTripLeg,
  TexTripLegInput,
  TexTripListItem
} from "./types";

export async function listTexTrips(
  client: TenantQueryClient,
  actor: TexActorContext
): Promise<TexTripListItem[]> {
  assertTexPermission(actor, "tex.expense.read");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexTripListRow>(
      `
        select
          t.id,
          t.name,
          t.description,
          t.trip_type,
          t.origin,
          t.destination,
          t.status,
          t.start_date::text as start_date,
          t.end_date::text as end_date,
          t.budget_amount::float as budget_amount,
          t.enforce_currency,
          t.enforced_currency,
          t.team_id,
          team.name as team_name,
          t.container_number,
          t.driver_employee_profile_id,
          driver.name as driver_name,
          t.driver_trip_amount::float as driver_trip_amount,
          t.subcontractor_driver_name,
          t.subcontractor_amount::float as subcontractor_amount,
          t.driver_payout_status,
          (select count(*)::int from public.tex_trip_legs leg where leg.tenant_id = t.tenant_id and leg.trip_id = t.id) as leg_count,
          (
            select coalesce(sum(coalesce(leg.total_distance_km, leg.distance_km, 0)), 0)::float
            from public.tex_trip_legs leg
            where leg.tenant_id = t.tenant_id
              and leg.trip_id = t.id
          ) as total_distance_km,
          count(e.id)::int as expense_count,
          coalesce(sum(e.amount), 0)::float as spend_amount
        from public.tex_trips t
        left join public.tex_teams team
          on team.tenant_id = t.tenant_id
         and team.id = t.team_id
        left join public.tex_employee_profiles driver
          on driver.tenant_id = t.tenant_id
         and driver.id = t.driver_employee_profile_id
        left join public.tex_expenses e
          on e.tenant_id = t.tenant_id
         and e.trip_id = t.id
        where t.tenant_id = public.current_tenant_id()
        group by t.id, team.name, driver.name
        order by t.status = 'open' desc, t.created_at desc
        limit 100
      `
    );

    return result.rows.map(mapTripListItem);
  });
}

export async function createTexTrip(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexTripInput
): Promise<TexTripListItem> {
  assertTexPermission(actor, "tex.expense.manage");
  const trip = sanitizeTrip(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexTripListRow>(
      `
        insert into public.tex_trips (
          tenant_id,
          name,
          description,
          trip_type,
          origin,
          destination,
          budget_amount,
          advance_deposit_file_id,
          start_date,
          end_date,
          enforce_currency,
          enforced_currency,
          team_id,
          container_number,
          driver_employee_profile_id,
          driver_trip_amount,
          subcontractor_driver_name,
          subcontractor_amount,
          subcontractor_notes,
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
          $10,
          $11,
          $12,
          $13,
          $14,
          $15,
          $16,
          $17,
          $19,
          $19
        )
        returning
          id,
          name,
          description,
          trip_type,
          origin,
          destination,
          status,
          start_date::text as start_date,
          end_date::text as end_date,
          budget_amount::float as budget_amount,
          enforce_currency,
          enforced_currency,
          team_id,
          null::text as team_name,
          container_number,
          driver_employee_profile_id,
          null::text as driver_name,
          driver_trip_amount::float as driver_trip_amount,
          subcontractor_driver_name,
          subcontractor_amount::float as subcontractor_amount,
          driver_payout_status,
          0::int as leg_count,
          0::float as total_distance_km,
          0::int as expense_count,
          0::float as spend_amount
      `,
      tripValues(trip, actor.userId)
    );
    const row = requireSingleRow(result.rows, "trip");
    await writeTexAuditEvent(client, actor, "tex.trip.created", "tex_trip", row.id, {
      name: row.name
    });

    return mapTripListItem(row);
  });
}

export async function updateTexTrip(
  client: TenantQueryClient,
  actor: TexActorContext,
  tripId: string,
  input: TexTripInput
): Promise<TexTripListItem> {
  assertTexPermission(actor, "tex.expense.manage");
  assertUuid(tripId, "trip id");
  const trip = sanitizeTrip(input);

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexTripListRow>(
      `
        update public.tex_trips
           set name = $1,
               description = $2,
               trip_type = $3,
               origin = $4,
               destination = $5,
               budget_amount = $6,
               advance_deposit_file_id = $7,
               start_date = $8,
               end_date = $9,
               enforce_currency = $10,
               enforced_currency = $11,
               team_id = $12,
               container_number = $13,
               driver_employee_profile_id = $14,
               driver_trip_amount = $15,
               subcontractor_driver_name = $16,
               subcontractor_amount = $17,
               subcontractor_notes = $18,
               updated_by = $19
         where tenant_id = public.current_tenant_id()
           and id = $20
        returning
          id,
          name,
          description,
          trip_type,
          origin,
          destination,
          status,
          start_date::text as start_date,
          end_date::text as end_date,
          budget_amount::float as budget_amount,
          enforce_currency,
          enforced_currency,
          team_id,
          null::text as team_name,
          container_number,
          driver_employee_profile_id,
          null::text as driver_name,
          driver_trip_amount::float as driver_trip_amount,
          subcontractor_driver_name,
          subcontractor_amount::float as subcontractor_amount,
          driver_payout_status,
          0::int as leg_count,
          0::float as total_distance_km,
          0::int as expense_count,
          0::float as spend_amount
      `,
      [...tripValues(trip, actor.userId), tripId]
    );
    const row = requireSingleRow(result.rows, "trip");
    await writeTexAuditEvent(client, actor, "tex.trip.updated", "tex_trip", row.id, {
      name: row.name
    });

    return mapTripListItem(row);
  });
}

export async function closeTexTrip(
  client: TenantQueryClient,
  actor: TexActorContext,
  tripId: string
): Promise<TexTripListItem> {
  assertTexPermission(actor, "tex.expense.manage");
  assertUuid(tripId, "trip id");

  return withTenantContext(client, actor, async () => {
    const result = await client.query<TexTripListRow>(
      `
        update public.tex_trips
           set status = 'closed',
               updated_by = $1
         where tenant_id = public.current_tenant_id()
           and id = $2
        returning
          id,
          name,
          description,
          trip_type,
          origin,
          destination,
          status,
          start_date::text as start_date,
          end_date::text as end_date,
          budget_amount::float as budget_amount,
          enforce_currency,
          enforced_currency,
          team_id,
          null::text as team_name,
          container_number,
          driver_employee_profile_id,
          null::text as driver_name,
          driver_trip_amount::float as driver_trip_amount,
          subcontractor_driver_name,
          subcontractor_amount::float as subcontractor_amount,
          driver_payout_status,
          (select count(*)::int from public.tex_trip_legs where tenant_id = public.current_tenant_id() and trip_id = public.tex_trips.id) as leg_count,
          (select coalesce(sum(coalesce(total_distance_km, distance_km, 0)), 0)::float from public.tex_trip_legs where tenant_id = public.current_tenant_id() and trip_id = public.tex_trips.id) as total_distance_km,
          0::int as expense_count,
          0::float as spend_amount
      `,
      [actor.userId, tripId]
    );
    const row = requireSingleRow(result.rows, "trip");
    await writeTexAuditEvent(client, actor, "tex.trip.closed", "tex_trip", row.id, {
      name: row.name
    });

    return mapTripListItem(row);
  });
}

export async function listTexTripLegs(
  client: TenantQueryClient,
  actor: TexActorContext,
  tripId: string
): Promise<TexTripLeg[]> {
  assertTexPermission(actor, "tex.expense.read");
  assertUuid(tripId, "trip id");

  return withTenantContext(client, actor, async () => {
    await assertTripExists(client, tripId);
    const result = await client.query<TexTripLegRow>(
      `
        select
          id,
          sequence,
          origin,
          origin_place_id,
          origin_lat::float as origin_lat,
          origin_lng::float as origin_lng,
          origin_country,
          destination,
          destination_place_id,
          destination_lat::float as destination_lat,
          destination_lng::float as destination_lng,
          destination_country,
          mode,
          status,
          planned_start::text as planned_start,
          planned_end::text as planned_end,
          actual_start::text as actual_start,
          actual_end::text as actual_end,
          distance_km::float as distance_km,
          is_return_trip,
          return_distance_km::float as return_distance_km,
          return_duration_seconds,
          total_distance_km::float as total_distance_km,
          duration_seconds,
          distance_source,
          route_polyline,
          budget_amount::float as budget_amount,
          container_ref,
          notes
        from public.tex_trip_legs
        where tenant_id = public.current_tenant_id()
          and trip_id = $1
        order by sequence asc, created_at asc
      `,
      [tripId]
    );

    return result.rows.map(mapTripLeg);
  });
}

export async function replaceTexTripLegs(
  client: TenantQueryClient,
  actor: TexActorContext,
  tripId: string,
  input: { legs?: TexTripLegInput[] }
): Promise<TexTripLeg[]> {
  assertTexPermission(actor, "tex.trip.manage");
  assertUuid(tripId, "trip id");
  const legs = sanitizeTripLegs(input.legs ?? []);

  return withTenantContext(client, actor, async () => {
    await assertTripExists(client, tripId);
    const savedIds: string[] = [];

    for (const leg of legs) {
      const result = leg.id
        ? await client.query<{ id: string }>(
            `
              update public.tex_trip_legs
                 set sequence = $1,
                     origin = $2,
                     origin_place_id = $3,
                     origin_lat = $4,
                     origin_lng = $5,
                     origin_country = $6,
                     destination = $7,
                     destination_place_id = $8,
                     destination_lat = $9,
                     destination_lng = $10,
                     destination_country = $11,
                     mode = $12,
                     status = $13,
                     planned_start = $14,
                     planned_end = $15,
                     actual_start = $16,
                     actual_end = $17,
                     distance_km = $18,
                     is_return_trip = $19,
                     return_distance_km = $20,
                     return_duration_seconds = $21,
                     total_distance_km = $22,
                     duration_seconds = $23,
                     distance_source = $24,
                     route_polyline = $25,
                     budget_amount = $26,
                     container_ref = $27,
                     notes = $28,
                     updated_by = $29
               where tenant_id = public.current_tenant_id()
                 and trip_id = $30
                 and id = $31
              returning id
            `,
            [...tripLegValues(leg), actor.userId, tripId, leg.id]
          )
        : await client.query<{ id: string }>(
            `
              insert into public.tex_trip_legs (
                tenant_id,
                trip_id,
                sequence,
                origin,
                origin_place_id,
                origin_lat,
                origin_lng,
                origin_country,
                destination,
                destination_place_id,
                destination_lat,
                destination_lng,
                destination_country,
                mode,
                status,
                planned_start,
                planned_end,
                actual_start,
                actual_end,
                distance_km,
                is_return_trip,
                return_distance_km,
                return_duration_seconds,
                total_distance_km,
                duration_seconds,
                distance_source,
                route_polyline,
                budget_amount,
                container_ref,
                notes,
                created_by,
                updated_by
              )
              values (
                public.current_tenant_id(),
                $29,
                $1,
                $2,
                $3,
                $4,
                $5,
                $6,
                $7,
                $8,
                $9,
                $10,
                $11,
                $12,
                $13,
                $14,
                $15,
                $16,
                $17,
                $18,
                $19,
                $20,
                $21,
                $22,
                $23,
                $24,
                $25,
                $26,
                $27,
                $28,
                $30,
                $30
              )
              returning id
            `,
            [...tripLegValues(leg), tripId, actor.userId]
          );
      const row = requireSingleRow(result.rows, "trip leg");
      savedIds.push(row.id);
    }

    if (savedIds.length > 0) {
      await client.query(
        `
          delete from public.tex_trip_legs
           where tenant_id = public.current_tenant_id()
             and trip_id = $1
             and not (id = any(string_to_array($2, ',')::uuid[]))
        `,
        [tripId, savedIds.join(",")]
      );
    } else {
      await client.query(
        `
          delete from public.tex_trip_legs
           where tenant_id = public.current_tenant_id()
             and trip_id = $1
        `,
        [tripId]
      );
    }

    await writeTexAuditEvent(client, actor, "tex.trip.legs_updated", "tex_trip", tripId, {
      leg_count: String(savedIds.length)
    });

    return listTexTripLegs(client, actor, tripId);
  });
}

export async function deleteTexTripLeg(
  client: TenantQueryClient,
  actor: TexActorContext,
  tripId: string,
  legId: string
): Promise<void> {
  assertTexPermission(actor, "tex.trip.manage");
  assertUuid(tripId, "trip id");
  assertUuid(legId, "trip leg id");

  await withTenantContext(client, actor, async () => {
    await assertTripExists(client, tripId);
    await client.query(
      `
        delete from public.tex_trip_legs
         where tenant_id = public.current_tenant_id()
           and trip_id = $1
           and id = $2
      `,
      [tripId, legId]
    );
    await writeTexAuditEvent(client, actor, "tex.trip.leg_deleted", "tex_trip_leg", legId, {
      trip_id: tripId
    });
  });
}
