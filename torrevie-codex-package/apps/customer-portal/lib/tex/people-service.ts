import { withTenantContext, type TenantQueryClient } from "@torrevie/tenant-context";
import { assertTexPermission } from "./access";
import { writeTexAuditEvent } from "./audit";
import type { TexEmployeeProfileRow, TexTeamRow } from "./db-types";
import { mapEmployeeProfile } from "./mappers";
import { sanitizeSubmissionFrequency, sanitizeTeamInput } from "./people-input";
import {
  assertTenantEmployeeProfiles,
  assertTenantManagerUser,
  assertTexEmployeeLimitAvailable,
  getTexTeam,
  replaceTexTeamMembers
} from "./people-queries";
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
  TexTeam,
  TexTeamInput
} from "./types";
import { optionalNonNegative, sanitizeOptionalUuid } from "./validation";

export async function createTexEmployeeProfile(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexEmployeeProfileInput
): Promise<TexEmployeeProfile> {
  assertTexPermission(actor, "tex.people.manage");

  const name = cleanRequired(input.name, "Employee name");
  const phoneNumber = normalizePhoneDigits(input.phoneNumber);
  const department = cleanOptional(input.department);
  const monthlySalary = optionalNonNegative(input.monthlySalary, "monthly salary") ?? 0;
  const managerUserId = sanitizeOptionalUuid(input.managerUserId, "manager user id");
  const submissionFrequency = sanitizeSubmissionFrequency(input.submissionFrequency);

  if (!phoneNumber) {
    throw new Error("Employee WhatsApp phone is required.");
  }

  return withTenantContext(client, actor, async () => {
    if (managerUserId) {
      await assertTenantManagerUser(client, managerUserId);
    }
    await assertTexEmployeeLimitAvailable(client, actor, phoneNumber);

    const result = await client.query<TexEmployeeProfileRow>(
      `
        insert into public.tex_employee_profiles (
          tenant_id,
          name,
          phone_number,
          department,
          monthly_salary,
          manager_user_id,
          submission_frequency,
          is_active,
          created_by,
          updated_by
        )
        values (public.current_tenant_id(), $1, $2, $3, $4, $5, $6, $7, $8, $8)
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
      [
        name,
        phoneNumber,
        department,
        monthlySalary,
        managerUserId,
        submissionFrequency,
        input.isActive,
        actor.userId
      ]
    );
    const employee = requireSingleRow(result.rows, "employee profile");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.employee.created",
      "tex_employee_profile",
      employee.id,
      {
        employee_name: employee.name
      }
    );

    return mapEmployeeProfile(employee);
  });
}

export async function updateTexEmployeeProfile(
  client: TenantQueryClient,
  actor: TexActorContext,
  employeeProfileId: string,
  input: TexEmployeeProfileInput
): Promise<TexEmployeeProfile> {
  assertTexPermission(actor, "tex.people.manage");
  assertUuid(employeeProfileId, "employee profile id");

  const name = cleanRequired(input.name, "Employee name");
  const phoneNumber = normalizePhoneDigits(input.phoneNumber);
  const department = cleanOptional(input.department);
  const monthlySalary = optionalNonNegative(input.monthlySalary, "monthly salary") ?? 0;
  const managerUserId = sanitizeOptionalUuid(input.managerUserId, "manager user id");
  const submissionFrequency = sanitizeSubmissionFrequency(input.submissionFrequency);

  if (!phoneNumber) {
    throw new Error("Employee WhatsApp phone is required.");
  }

  return withTenantContext(client, actor, async () => {
    if (managerUserId) {
      await assertTenantManagerUser(client, managerUserId);
    }

    const result = await client.query<TexEmployeeProfileRow>(
      `
        update public.tex_employee_profiles
           set name = $2,
               phone_number = $3,
               department = $4,
               monthly_salary = $5,
               manager_user_id = $6,
               submission_frequency = $7,
               is_active = $8,
               updated_by = $9
         where tenant_id = public.current_tenant_id()
           and id = $1
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
      [
        employeeProfileId,
        name,
        phoneNumber,
        department,
        monthlySalary,
        managerUserId,
        submissionFrequency,
        input.isActive,
        actor.userId
      ]
    );
    const employee = requireSingleRow(result.rows, "employee profile");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.employee.updated",
      "tex_employee_profile",
      employee.id,
      {
        employee_name: employee.name
      }
    );

    return mapEmployeeProfile(employee);
  });
}

export async function deleteTexEmployeeProfile(
  client: TenantQueryClient,
  actor: TexActorContext,
  employeeProfileId: string
): Promise<void> {
  assertTexPermission(actor, "tex.people.manage");
  assertUuid(employeeProfileId, "employee profile id");

  await withTenantContext(client, actor, async () => {
    const result = await client.query<{ id: string; name: string }>(
      `
        delete from public.tex_employee_profiles
         where tenant_id = public.current_tenant_id()
           and id = $1
        returning id, name
      `,
      [employeeProfileId]
    );
    const employee = requireSingleRow(result.rows, "employee profile");

    await writeTexAuditEvent(
      client,
      actor,
      "tex.employee.deleted",
      "tex_employee_profile",
      employee.id,
      {
        employee_name: employee.name
      }
    );
  });
}

export async function createTexTeam(
  client: TenantQueryClient,
  actor: TexActorContext,
  input: TexTeamInput
): Promise<TexTeam> {
  assertTexPermission(actor, "tex.people.manage");
  const sanitized = sanitizeTeamInput(input);

  return withTenantContext(client, actor, async () => {
    await assertTenantEmployeeProfiles(client, [
      sanitized.managerEmployeeProfileId,
      ...sanitized.memberEmployeeProfileIds
    ]);

    const result = await client.query<TexTeamRow>(
      `
        insert into public.tex_teams (
          tenant_id,
          name,
          description,
          manager_employee_profile_id,
          created_by,
          updated_by
        )
        values (public.current_tenant_id(), $1, $2, $3, $4, $4)
        returning
          id,
          name,
          description,
          manager_employee_profile_id,
          null::text as manager_name,
          ''::text as member_employee_profile_ids,
          ''::text as member_names,
          0::int as member_count
      `,
      [sanitized.name, sanitized.description, sanitized.managerEmployeeProfileId, actor.userId]
    );
    const team = requireSingleRow(result.rows, "team");

    await replaceTexTeamMembers(client, team.id, sanitized.memberEmployeeProfileIds, actor.userId);
    await writeTexAuditEvent(client, actor, "tex.team.created", "tex_team", team.id, {
      team_name: sanitized.name,
      members: sanitized.memberEmployeeProfileIds.join(",")
    });

    return getTexTeam(client, team.id);
  });
}

export async function updateTexTeam(
  client: TenantQueryClient,
  actor: TexActorContext,
  teamId: string,
  input: TexTeamInput
): Promise<TexTeam> {
  assertTexPermission(actor, "tex.people.manage");
  assertUuid(teamId, "team id");
  const sanitized = sanitizeTeamInput(input);

  return withTenantContext(client, actor, async () => {
    await assertTenantEmployeeProfiles(client, [
      sanitized.managerEmployeeProfileId,
      ...sanitized.memberEmployeeProfileIds
    ]);

    const result = await client.query<{ id: string; name: string }>(
      `
        update public.tex_teams
           set name = $2,
               description = $3,
               manager_employee_profile_id = $4,
               updated_by = $5
         where tenant_id = public.current_tenant_id()
           and id = $1
        returning id, name
      `,
      [
        teamId,
        sanitized.name,
        sanitized.description,
        sanitized.managerEmployeeProfileId,
        actor.userId
      ]
    );
    const team = requireSingleRow(result.rows, "team");

    await replaceTexTeamMembers(client, team.id, sanitized.memberEmployeeProfileIds, actor.userId);
    await writeTexAuditEvent(client, actor, "tex.team.updated", "tex_team", team.id, {
      team_name: team.name,
      members: sanitized.memberEmployeeProfileIds.join(",")
    });

    return getTexTeam(client, team.id);
  });
}

export async function deleteTexTeam(
  client: TenantQueryClient,
  actor: TexActorContext,
  teamId: string
): Promise<void> {
  assertTexPermission(actor, "tex.people.manage");
  assertUuid(teamId, "team id");

  await withTenantContext(client, actor, async () => {
    await client.query(
      `
        delete from public.tex_team_members
         where tenant_id = public.current_tenant_id()
           and team_id = $1
      `,
      [teamId]
    );
    const result = await client.query<{ id: string; name: string }>(
      `
        delete from public.tex_teams
         where tenant_id = public.current_tenant_id()
           and id = $1
        returning id, name
      `,
      [teamId]
    );
    const team = requireSingleRow(result.rows, "team");

    await writeTexAuditEvent(client, actor, "tex.team.deleted", "tex_team", team.id, {
      team_name: team.name
    });
  });
}
