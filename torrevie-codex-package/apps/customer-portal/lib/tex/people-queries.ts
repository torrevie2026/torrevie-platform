import type { TenantQueryClient } from "@torrevie/tenant-context";
import { writeTexAuditEvent } from "./audit";
import type { TexEmployeeLimitRow, TexEmployeeProfileRow, TexTeamRow } from "./db-types";
import { mapEmployeeProfile, mapTeam } from "./mappers";
import {
  assertUuid,
  cleanOptional,
  cleanRequired,
  normalizePhoneDigits,
  requireSingleRow
} from "./shared";
import type {
  TexActorContext,
  TexEmployeeProfile,
  TexEmployeeProfileInput,
  TexTeam
} from "./types";

export async function getTexEmployeeProfile(
  client: TenantQueryClient,
  employeeProfileId: string
): Promise<TexEmployeeProfile> {
  assertUuid(employeeProfileId, "employee profile id");
  const result = await client.query<TexEmployeeProfileRow>(
    `
      select
        ep.id,
        ep.user_id,
        ep.name,
        ep.phone_number,
        ep.department,
        ep.monthly_salary::float as monthly_salary,
        ep.manager_user_id,
        manager_profile.display_name as manager_name,
        manager_user.email as manager_email,
        ep.submission_frequency,
        ep.is_active
      from public.tex_employee_profiles ep
      left join public.users manager_user
        on manager_user.id = ep.manager_user_id
      left join public.user_profiles manager_profile
        on manager_profile.tenant_id = ep.tenant_id
       and manager_profile.user_id = ep.manager_user_id
      where ep.tenant_id = public.current_tenant_id()
        and ep.id = $1
        and ep.is_active = true
      limit 1
    `,
    [employeeProfileId]
  );

  return mapEmployeeProfile(requireSingleRow(result.rows, "employee profile"));
}

export async function createTexEmployeeProfileFromWhatsapp(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: Pick<TexEmployeeProfileInput, "name" | "phoneNumber" | "department">
): Promise<TexEmployeeProfile> {
  const name = cleanRequired(input.name, "Employee name");
  const phoneNumber = normalizePhoneDigits(input.phoneNumber);
  const department = cleanOptional(input.department);

  if (!phoneNumber) {
    throw new Error("Employee WhatsApp phone is required.");
  }

  await assertTexEmployeeLimitAvailable(client, actor, phoneNumber);

  const result = await client.query<TexEmployeeProfileRow>(
    `
      insert into public.tex_employee_profiles (
        tenant_id,
        name,
        phone_number,
        department,
        is_active,
        created_by,
        updated_by
      )
      values (
        public.current_tenant_id(),
        $1,
        $2,
        $3,
        true,
        $4::uuid,
        $4::uuid
      )
      on conflict (tenant_id, phone_number)
      do update set
        name = excluded.name,
        department = coalesce(excluded.department, public.tex_employee_profiles.department),
        is_active = true,
        updated_by = excluded.updated_by,
        updated_at = now()
      returning
        id,
        user_id,
        name,
        phone_number,
        department,
        monthly_salary::float as monthly_salary,
        manager_user_id,
        null::text as manager_name,
        null::text as manager_email,
        submission_frequency,
        is_active
    `,
    [name, phoneNumber, department, actor.userId]
  );
  const employee = mapEmployeeProfile(requireSingleRow(result.rows, "employee profile"));

  await writeTexAuditEvent(
    client,
    actor,
    "tex.people.employee_created_from_whatsapp",
    "tex_employee_profile",
    employee.id,
    {
      phone_number: employee.phoneNumber
    }
  );

  return employee;
}

export async function assertTexEmployeeLimitAvailable(
  client: TenantQueryClient,
  actor: TexActorContext,
  phoneNumber: string
) {
  if (actor.texPlan.employeeLimit <= 0) {
    return;
  }

  const result = await client.query<TexEmployeeLimitRow>(
    `
      select
        count(*) filter (where is_active = true)::int as active_count,
        coalesce(bool_or(phone_number = $1), false) as existing_phone
      from public.tex_employee_profiles
      where tenant_id = public.current_tenant_id()
    `,
    [phoneNumber]
  );
  const row = result.rows[0];
  const activeCount = Number(row?.active_count ?? 0);
  const existingPhone = Boolean(row?.existing_phone);

  if (!existingPhone && activeCount >= actor.texPlan.employeeLimit) {
    throw new Error(`TEX ${actor.texPlan.planKey} plan employee limit reached.`);
  }
}

export async function assertTenantManagerUser(client: TenantQueryClient, managerUserId: string) {
  const result = await client.query<{ id: string }>(
    `
      select u.id
      from public.tenant_memberships tm
      join public.users u on u.id = tm.user_id
      where tm.tenant_id = public.current_tenant_id()
        and tm.user_id = $1
        and tm.status = 'active'
        and u.status = 'active'
      limit 1
    `,
    [managerUserId]
  );

  requireSingleRow(result.rows, "manager user");
}

export async function assertTenantEmployeeProfiles(
  client: TenantQueryClient,
  employeeProfileIds: Array<string | null>
) {
  for (const employeeProfileId of employeeProfileIds) {
    if (!employeeProfileId) {
      continue;
    }

    const result = await client.query<{ id: string }>(
      `
        select id
        from public.tex_employee_profiles
        where tenant_id = public.current_tenant_id()
          and id = $1
          and is_active = true
        limit 1
      `,
      [employeeProfileId]
    );

    requireSingleRow(result.rows, "employee profile");
  }
}

export async function replaceTexTeamMembers(
  client: TenantQueryClient,
  teamId: string,
  employeeProfileIds: readonly string[],
  actorUserId: string
) {
  await client.query(
    `
      delete from public.tex_team_members
       where tenant_id = public.current_tenant_id()
         and team_id = $1
    `,
    [teamId]
  );

  for (const employeeProfileId of employeeProfileIds) {
    await client.query(
      `
        insert into public.tex_team_members (
          tenant_id,
          team_id,
          employee_profile_id,
          created_by,
          updated_by
        )
        values (public.current_tenant_id(), $1, $2, $3, $3)
        on conflict (team_id, employee_profile_id) do nothing
      `,
      [teamId, employeeProfileId, actorUserId]
    );
  }
}

export async function getTexTeam(client: TenantQueryClient, teamId: string): Promise<TexTeam> {
  const result = await client.query<TexTeamRow>(
    `
      select
        t.id,
        t.name,
        t.description,
        t.manager_employee_profile_id,
        manager.name as manager_name,
        coalesce(
          string_agg(member.id::text, ',' order by member.name)
            filter (where member.id is not null),
          ''
        ) as member_employee_profile_ids,
        coalesce(
          string_agg(member.name, '|' order by member.name)
            filter (where member.id is not null),
          ''
        ) as member_names,
        count(member.id)::int as member_count
      from public.tex_teams t
      left join public.tex_employee_profiles manager
        on manager.tenant_id = t.tenant_id
       and manager.id = t.manager_employee_profile_id
      left join public.tex_team_members tm
        on tm.tenant_id = t.tenant_id
       and tm.team_id = t.id
      left join public.tex_employee_profiles member
        on member.tenant_id = tm.tenant_id
       and member.id = tm.employee_profile_id
      where t.tenant_id = public.current_tenant_id()
        and t.id = $1
      group by t.id, manager.name
      limit 1
    `,
    [teamId]
  );

  return mapTeam(requireSingleRow(result.rows, "team"));
}
