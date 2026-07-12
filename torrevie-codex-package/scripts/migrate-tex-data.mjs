import pg from "pg";

const { Client } = pg;

const SOURCE_SYSTEM = "tex-neon";
const args = new Set(process.argv.slice(2));
const apply = args.has("--apply");
const includeBlobData = args.has("--include-legacy-file-data");

const oldUrl = process.env.OLD_TEX_DATABASE_URL;
const targetUrl = process.env.TARGET_DATABASE_URL || process.env.DATABASE_URL;

if (!oldUrl || !targetUrl) {
  console.error("Missing OLD_TEX_DATABASE_URL and TARGET_DATABASE_URL/DATABASE_URL.");
  process.exit(1);
}

const oldDb = new Client(connectionConfig(oldUrl, process.env.OLD_TEX_DATABASE_SSL));
const targetDb = new Client(connectionConfig(targetUrl, process.env.TARGET_DATABASE_SSL ?? process.env.TORREVIE_DATABASE_SSL));

const sourceTables = [
  "companies",
  "app_users",
  "user_company_memberships",
  "employees",
  "teams",
  "team_members",
  "expense_categories",
  "receipt_files",
  "trips",
  "trip_legs",
  "expenses",
  "unregistered_whatsapp_submissions",
  "whatsapp_pending_actions",
  "spend_policies",
  "budgets",
  "driver_advances",
  "employee_salary_payments",
  "erp_connections",
  "per_diem_rates",
  "notifications"
];

const targetTables = [
  "tenants",
  "users",
  "tenant_memberships",
  "user_profiles",
  "user_role_assignments",
  "subscriptions",
  "tex_integration_settings",
  "tex_employee_profiles",
  "tex_teams",
  "tex_team_members",
  "tex_expense_categories",
  "tex_legacy_files",
  "tex_trips",
  "tex_trip_legs",
  "tex_expenses",
  "tex_unregistered_whatsapp_submissions",
  "tex_whatsapp_pending_actions",
  "tex_spend_policies",
  "tex_budgets",
  "tex_driver_advances",
  "tex_employee_salary_payments",
  "tex_erp_connections",
  "tex_per_diem_rates",
  "tex_notifications"
];

try {
  await oldDb.connect();
  await targetDb.connect();

  const summary = {
    mode: apply ? "apply" : "dry_run",
    sourceCounts: await countTables(oldDb, sourceTables),
    targetBefore: await countTables(targetDb, targetTables),
    warnings: []
  };

  if (!apply) {
    summary.plan = await buildPlan();
    console.log(JSON.stringify(summary, null, 2));
    process.exit(0);
  }

  await targetDb.query("begin");
  const runId = await startRun(summary);

  try {
    const result = await migrate();
    summary.result = result;
    summary.targetAfter = await countTables(targetDb, targetTables);
    await finishRun(runId, "succeeded", summary);
    await targetDb.query("commit");
    console.log(JSON.stringify(summary, null, 2));
  } catch (error) {
    await targetDb.query("rollback");
    await markRunFailed(runId, summary, error);
    throw error;
  }
} catch (error) {
  console.error(error);
  process.exitCode = 1;
} finally {
  await oldDb.end().catch(() => {});
  await targetDb.end().catch(() => {});
}

async function buildPlan() {
  const [{ rows: companies }, { rows: users }] = await Promise.all([
    oldDb.query("select id, name, plan from companies order by created_at, name"),
    oldDb.query("select id, email, role, super_admin from app_users order by created_at, email")
  ]);

  const targetCompanies = await targetDb.query(
    "select id, slug, name from tenants where slug = any($1)",
    [companies.map((company) => tenantSlug(company))]
  );
  const targetUsers = await targetDb.query(
    "select id, email from users where lower(email) = any($1)",
    [users.map((user) => normalizeEmail(user.email)).filter(Boolean)]
  );

  return {
    companies: companies.map((company) => ({
      oldCompanyId: company.id,
      name: company.name,
      slug: tenantSlug(company),
      existingTenantId: targetCompanies.rows.find((row) => row.slug === tenantSlug(company))?.id ?? null,
      sourcePlan: company.plan ?? null
    })),
    users: users.map((user) => ({
      oldUserId: user.id,
      email: normalizeEmail(user.email),
      sourceRole: user.super_admin ? "super_admin" : user.role,
      platformRole: roleForUser(user),
      existingUserId: targetUsers.rows.find((row) => row.email === normalizeEmail(user.email))?.id ?? null
    })),
    legacyFileData: includeBlobData ? "will copy bytea data into tex_legacy_files.data" : "will preserve metadata only; use --include-legacy-file-data to copy bytea blobs"
  };
}

async function migrate() {
  const result = {
    tenants: 0,
    users: 0,
    memberships: 0,
    texRows: {}
  };

  const roleIds = await loadRoleIds();
  const texProduct = await one(
    targetDb.query(
      `
        select p.id as product_id, pl.id as plan_id
        from products p
        join plans pl on pl.product_id = p.id
        where p.key = 'tex' and pl.key = 'enterprise'
        limit 1
      `
    ),
    "TEX enterprise plan"
  );

  const companyMap = new Map();
  const userMap = new Map();
  const employeeMap = new Map();
  const legacyFileMap = new Map();

  const { rows: companies } = await oldDb.query("select * from companies order by created_at, name");
  for (const company of companies) {
    const tenant = await upsertTenant(company);
    companyMap.set(company.id, tenant.id);
    await recordMap(tenant.id, "companies", company.id, "tenants", tenant.id, { slug: tenant.slug });
    await upsertSubscription(tenant.id, texProduct.product_id, texProduct.plan_id, company);
    await upsertIntegrationSettings(tenant.id, company);
    result.tenants += 1;
  }

  const { rows: users } = await oldDb.query("select * from app_users order by created_at, email");
  for (const user of users) {
    const platformUser = await upsertUser(user);
    userMap.set(user.id, platformUser.id);
    await recordMap(companyMap.get(user.company_id) ?? null, "app_users", user.id, "users", platformUser.id, {
      email: normalizeEmail(user.email)
    });
    result.users += 1;
  }

  for (const user of users) {
    const tenantId = companyMap.get(user.company_id);
    const userId = userMap.get(user.id);
    if (!tenantId || !userId) continue;
    await upsertMembership(tenantId, userId, user, roleIds);
    result.memberships += 1;
  }

  const { rows: extraMemberships } = await oldDb.query("select * from user_company_memberships order by created_at");
  for (const membership of extraMemberships) {
    const tenantId = companyMap.get(membership.company_id);
    const userId = userMap.get(membership.user_id);
    if (!tenantId || !userId) continue;
    await upsertMembership(tenantId, userId, membership, roleIds);
    result.memberships += 1;
  }

  const { rows: employees } = await oldDb.query("select * from employees order by created_at");
  for (const employee of employees) {
    const tenantId = companyMap.get(employee.company_id);
    if (!tenantId) continue;
    await targetDb.query(
      `
        insert into tex_employee_profiles (
          id, tenant_id, name, phone_number, department, monthly_salary, manager_user_id,
          is_active, submission_frequency, created_at, updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::timestamptz,coalesce($11::timestamptz,$10::timestamptz))
        on conflict (id) do update set
          tenant_id = excluded.tenant_id,
          name = excluded.name,
          phone_number = excluded.phone_number,
          department = excluded.department,
          monthly_salary = excluded.monthly_salary,
          manager_user_id = excluded.manager_user_id,
          is_active = excluded.is_active,
          submission_frequency = excluded.submission_frequency,
          updated_at = excluded.updated_at
      `,
      [
        employee.id,
        tenantId,
        employee.name,
        employee.phone_number,
        employee.department,
        employee.monthly_salary ?? 0,
        userMap.get(employee.manager_profile_id) ?? null,
        employee.is_active ?? true,
        normalizeSubmissionFrequency(employee.submission_frequency),
        employee.created_at,
        employee.updated_at
      ]
    );
    employeeMap.set(employee.id, employee.id);
    await recordMap(tenantId, "employees", employee.id, "tex_employee_profiles", employee.id);
    increment(result.texRows, "tex_employee_profiles");
  }

  await migrateSimple("expense_categories", "tex_expense_categories", companyMap, (row, tenantId) => ({
    columns: ["id", "tenant_id", "name", "is_active", "is_system", "sort_order", "created_at", "updated_at"],
    values: [row.id, tenantId, row.name, row.is_active, row.is_system, row.sort_order, row.created_at, row.updated_at]
  }), result);

  await migrateLegacyFiles(companyMap, userMap, legacyFileMap, result);

  await migrateTeams(companyMap, employeeMap, result);
  await migrateTrips(companyMap, userMap, employeeMap, legacyFileMap, result);
  await migrateTripLegs(companyMap, result);
  await migrateExpenses(companyMap, userMap, employeeMap, legacyFileMap, result);
  await migrateWhatsApp(companyMap, userMap, employeeMap, legacyFileMap, result);

  await migrateSimple("spend_policies", "tex_spend_policies", companyMap, (row, tenantId) => ({
    columns: ["id", "tenant_id", "category", "daily_limit", "monthly_limit", "requires_notes_above", "is_blocked", "created_at", "updated_at"],
    values: [row.id, tenantId, row.category, row.daily_limit, row.monthly_limit, row.requires_notes_above, row.is_blocked, row.created_at, row.created_at]
  }), result);

  await migrateSimple("budgets", "tex_budgets", companyMap, (row, tenantId) => ({
    columns: ["id", "tenant_id", "department", "month", "year", "budget_amount", "created_at", "updated_at"],
    values: [row.id, tenantId, row.department, row.month, row.year, row.budget_amount, row.created_at, row.created_at]
  }), result);

  await migrateDriverAdvances(companyMap, employeeMap, userMap, result);
  await migrateSalaryPayments(companyMap, employeeMap, userMap, result);

  await migrateSimple("erp_connections", "tex_erp_connections", companyMap, (row, tenantId) => ({
    columns: ["id", "tenant_id", "erp_type", "base_url", "is_active", "last_sync_at", "created_at", "updated_at"],
    values: [row.id, tenantId, row.erp_type, row.base_url, row.is_active, row.last_sync_at, row.created_at, row.created_at]
  }), result);

  await migrateSimple("per_diem_rates", "tex_per_diem_rates", companyMap, (row, tenantId) => ({
    columns: ["id", "tenant_id", "destination", "daily_rate", "currency", "created_at", "updated_at"],
    values: [row.id, tenantId, row.destination, row.daily_rate, row.currency, row.created_at, row.created_at]
  }), result);

  await migrateNotifications(companyMap, userMap, result);

  return result;
}

async function migrateTeams(companyMap, employeeMap, result) {
  const { rows: teams } = await oldDb.query("select * from teams order by created_at");
  for (const team of teams) {
    const tenantId = companyMap.get(team.company_id);
    if (!tenantId) continue;
    await targetDb.query(
      `
        insert into tex_teams (id, tenant_id, name, description, manager_employee_profile_id, created_at, updated_at)
        values ($1,$2,$3,$4,$5,$6,$6)
        on conflict (id) do update set
          tenant_id = excluded.tenant_id,
          name = excluded.name,
          description = excluded.description,
          manager_employee_profile_id = excluded.manager_employee_profile_id,
          updated_at = excluded.updated_at
      `,
      [team.id, tenantId, team.name, team.description, employeeMap.get(team.manager_id) ?? null, team.created_at]
    );
    await recordMap(tenantId, "teams", team.id, "tex_teams", team.id);
    increment(result.texRows, "tex_teams");
  }

  const { rows: members } = await oldDb.query("select * from team_members order by joined_at");
  for (const member of members) {
    const tenantId = await tenantForTeam(member.team_id);
    const employeeId = employeeMap.get(member.employee_id);
    if (!tenantId || !employeeId) continue;
    await targetDb.query(
      `
        insert into tex_team_members (id, tenant_id, team_id, employee_profile_id, joined_at, created_at, updated_at)
        values ($1,$2,$3,$4,$5,$5,$5)
        on conflict (id) do update set
          tenant_id = excluded.tenant_id,
          team_id = excluded.team_id,
          employee_profile_id = excluded.employee_profile_id,
          joined_at = excluded.joined_at,
          updated_at = excluded.updated_at
      `,
      [member.id, tenantId, member.team_id, employeeId, member.joined_at]
    );
    await recordMap(tenantId, "team_members", member.id, "tex_team_members", member.id);
    increment(result.texRows, "tex_team_members");
  }
}

async function migrateTrips(companyMap, userMap, employeeMap, legacyFileMap, result) {
  const { rows: trips } = await oldDb.query("select * from trips order by created_at");
  for (const trip of trips) {
    const tenantId = companyMap.get(trip.company_id);
    if (!tenantId) continue;
    await targetDb.query(
      `
        insert into tex_trips (
          id, tenant_id, name, description, trip_type, origin, destination, budget_amount,
          start_date, end_date, status, enforce_currency, enforced_currency, team_id,
          container_number, driver_employee_profile_id, driver_trip_amount,
          subcontractor_driver_name, subcontractor_amount, subcontractor_notes,
          driver_payout_status, driver_payout_paid_by, driver_payout_paid_at,
          legacy_advance_deposit_slip_url, legacy_advance_deposit_file_id,
          created_by, created_at, updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$27)
        on conflict (id) do update set
          tenant_id = excluded.tenant_id,
          name = excluded.name,
          description = excluded.description,
          status = excluded.status,
          updated_at = excluded.updated_at
      `,
      [
        trip.id,
        tenantId,
        trip.name,
        trip.description,
        normalizeTripType(trip.trip_type),
        trip.origin,
        trip.destination,
        trip.budget_aed,
        trip.start_date,
        trip.end_date,
        normalizeTripStatus(trip.status),
        trip.enforce_currency ?? false,
        trip.enforced_currency,
        trip.team_id,
        trip.container_number,
        employeeMap.get(trip.driver_employee_id) ?? null,
        trip.driver_trip_amount ?? 0,
        trip.subcontractor_driver_name,
        trip.subcontractor_amount ?? 0,
        trip.subcontractor_notes,
        normalizePaidStatus(trip.driver_payout_status),
        userMap.get(trip.driver_payout_paid_by) ?? null,
        trip.driver_payout_paid_at,
        trip.advance_deposit_slip_url,
        legacyFileMap.get(trip.advance_deposit_slip_file_id) ?? null,
        userMap.get(trip.created_by) ?? null,
        trip.created_at
      ]
    );
    await recordMap(tenantId, "trips", trip.id, "tex_trips", trip.id);
    increment(result.texRows, "tex_trips");
  }
}

async function migrateTripLegs(companyMap, result) {
  const { rows: legs } = await oldDb.query("select * from trip_legs order by created_at");
  for (const leg of legs) {
    const tenantId = companyMap.get(leg.company_id);
    if (!tenantId) continue;
    await targetDb.query(
      `
        insert into tex_trip_legs (
          id, tenant_id, trip_id, sequence, origin, origin_place_id, origin_lat, origin_lng,
          origin_country, destination, destination_place_id, destination_lat, destination_lng,
          destination_country, mode, status, planned_start, planned_end, actual_start, actual_end,
          distance_km, is_return_trip, return_distance_km, return_duration_seconds, total_distance_km,
          duration_seconds, distance_source, route_polyline, budget_amount, container_ref, notes,
          created_at, updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33)
        on conflict (id) do update set
          tenant_id = excluded.tenant_id,
          trip_id = excluded.trip_id,
          sequence = excluded.sequence,
          status = excluded.status,
          updated_at = excluded.updated_at
      `,
      [
        leg.id, tenantId, leg.trip_id, leg.sequence, leg.origin, leg.origin_place_id, leg.origin_lat, leg.origin_lng,
        leg.origin_country, leg.destination, leg.destination_place_id, leg.destination_lat, leg.destination_lng,
        leg.destination_country, normalizeLegMode(leg.mode), normalizeLegStatus(leg.status), leg.planned_start, leg.planned_end,
        leg.actual_start, leg.actual_end, leg.distance_km, leg.is_return_trip ?? false, leg.return_distance_km,
        leg.return_duration_seconds, leg.total_distance_km, leg.duration_seconds, leg.distance_source, leg.route_polyline,
        leg.budget, leg.container_ref, leg.notes, leg.created_at, leg.updated_at ?? leg.created_at
      ]
    );
    await recordMap(tenantId, "trip_legs", leg.id, "tex_trip_legs", leg.id);
    increment(result.texRows, "tex_trip_legs");
  }
}

async function migrateExpenses(companyMap, userMap, employeeMap, legacyFileMap, result) {
  const { rows: expenses } = await oldDb.query("select * from expenses order by created_at");
  for (const expense of expenses) {
    const tenantId = companyMap.get(expense.company_id);
    if (!tenantId) continue;
    await targetDb.query(
      `
        insert into tex_expenses (
          id, tenant_id, submitter_user_id, employee_profile_id, employee_name, employee_phone,
          whatsapp_chat_jid, vendor, expense_date, amount, currency, base_amount, exchange_rate,
          category, expense_type, payment_method, trip_id, trip_leg_id, trip_name, notes,
          tax_id_number, tax_amount, legacy_receipt_image_url, legacy_receipt_file_id,
          original_currency, original_amount, status, source, policy_flag, policy_flag_reason,
          approved_by, approved_at, rejected_by, rejected_at, rejected_reason,
          finance_reviewed_by, finance_reviewed_at, paid_by, paid_at,
          created_at, updated_at, created_by, updated_by
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24,$25,$26,$27,$28,$29,$30,$31,$32,$33,$34,$35,$36,$37,$38,$39,$40,$41,$42,$43)
        on conflict (id) do update set
          tenant_id = excluded.tenant_id,
          status = excluded.status,
          updated_at = excluded.updated_at
      `,
      [
        expense.id, tenantId, userMap.get(expense.submitter_id) ?? null, employeeMap.get(expense.employee_id) ?? null,
        expense.employee_name, expense.employee_phone, expense.whatsapp_chat_jid, expense.vendor, expense.date,
        expense.amount, expense.currency, expense.base_amount, expense.exchange_rate, expense.category,
        expense.expense_type ?? "receipt", expense.payment_method, expense.trip_id, expense.leg_id, expense.trip_name,
        expense.notes, expense.tax_id_number, expense.tax_amount, expense.receipt_image_url,
        legacyFileMap.get(expense.receipt_file_id) ?? null, expense.original_currency, expense.original_amount,
        normalizeExpenseStatus(expense.status), expense.source ?? "web", expense.policy_flag ?? false,
        expense.policy_flag_reason, userMap.get(expense.approved_by) ?? null, expense.approved_at,
        userMap.get(expense.rejected_by) ?? null, expense.rejected_at, expense.rejected_reason,
        userMap.get(expense.finance_reviewed_by) ?? null, expense.finance_reviewed_at,
        userMap.get(expense.paid_by) ?? null, expense.paid_at, expense.created_at,
        expense.updated_at ?? expense.created_at, userMap.get(expense.submitter_id) ?? null,
        userMap.get(expense.submitter_id) ?? null
      ]
    );
    await recordMap(tenantId, "expenses", expense.id, "tex_expenses", expense.id);
    increment(result.texRows, "tex_expenses");
  }
}

async function migrateWhatsApp(companyMap, userMap, employeeMap, legacyFileMap, result) {
  const { rows: submissions } = await oldDb.query("select * from unregistered_whatsapp_submissions order by created_at");
  for (const row of submissions) {
    const tenantId = companyMap.get(row.company_id);
    if (!tenantId) continue;
    await targetDb.query(
      `
        insert into tex_unregistered_whatsapp_submissions (
          id, tenant_id, sender_raw, sender_phone, whatsapp_chat_jid, message_id, session_id,
          message_text, payload, status, resolved_expense_id, resolved_employee_profile_id,
          resolved_by, resolved_at, legacy_receipt_image_url, legacy_receipt_file_id,
          created_at, updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$17)
        on conflict (id) do update set
          tenant_id = excluded.tenant_id,
          status = excluded.status,
          updated_at = excluded.updated_at
      `,
      [
        row.id, tenantId, row.sender_raw, row.sender_phone, row.whatsapp_chat_jid, row.message_id, row.session_id,
        row.message_text, row.payload ?? {}, normalizeSubmissionStatus(row.status), row.resolved_expense_id,
        employeeMap.get(row.resolved_employee_id) ?? null, userMap.get(row.resolved_by) ?? null, row.resolved_at,
        row.receipt_image_url, legacyFileMap.get(row.receipt_file_id) ?? null, row.created_at
      ]
    );
    await recordMap(tenantId, "unregistered_whatsapp_submissions", row.id, "tex_unregistered_whatsapp_submissions", row.id);
    increment(result.texRows, "tex_unregistered_whatsapp_submissions");
  }

  const { rows: actions } = await oldDb.query("select * from whatsapp_pending_actions order by created_at");
  for (const row of actions) {
    const tenantId = companyMap.get(row.company_id);
    if (!tenantId) continue;
    await targetDb.query(
      `
        insert into tex_whatsapp_pending_actions (
          id, tenant_id, employee_profile_id, expense_id, sender_phone, whatsapp_chat_jid,
          provider, action, options, status, expires_at, resolved_at, created_at, updated_at
        )
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$13)
        on conflict (id) do update set
          tenant_id = excluded.tenant_id,
          status = excluded.status,
          updated_at = excluded.updated_at
      `,
      [
        row.id, tenantId, employeeMap.get(row.employee_id) ?? null, row.expense_id, row.sender_phone,
        row.whatsapp_chat_jid, normalizeProvider(row.provider), normalizeAction(row.action), row.options ?? [],
        normalizePendingStatus(row.status), row.expires_at, row.resolved_at, row.created_at
      ]
    );
    await recordMap(tenantId, "whatsapp_pending_actions", row.id, "tex_whatsapp_pending_actions", row.id);
    increment(result.texRows, "tex_whatsapp_pending_actions");
  }
}

async function migrateLegacyFiles(companyMap, userMap, legacyFileMap, result) {
  const projection = includeBlobData ? "data" : "null::bytea as data";
  const { rows: files } = await oldDb.query(`select id, company_id, uploaded_by, file_name, content_type, size_bytes, ${projection}, created_at from receipt_files order by created_at`);
  for (const file of files) {
    const tenantId = companyMap.get(file.company_id);
    if (!tenantId) continue;
    const legacy = await one(
      targetDb.query(
        `
          insert into tex_legacy_files (
            tenant_id, source_system, source_file_id, file_name, content_type, size_bytes,
            data, uploaded_by, created_at
          )
          values ($1,$2,$3,$4,$5,$6,$7,$8,$9)
          on conflict (tenant_id, source_system, source_file_id) do update set
            file_name = excluded.file_name,
            content_type = excluded.content_type,
            size_bytes = excluded.size_bytes,
            data = coalesce(excluded.data, tex_legacy_files.data),
            uploaded_by = excluded.uploaded_by
          returning id
        `,
        [
          tenantId, SOURCE_SYSTEM, file.id, file.file_name, file.content_type, file.size_bytes,
          file.data, userMap.get(file.uploaded_by) ?? null, file.created_at
        ]
      ),
      "legacy file"
    );
    legacyFileMap.set(file.id, legacy.id);
    await recordMap(tenantId, "receipt_files", file.id, "tex_legacy_files", legacy.id);
    increment(result.texRows, "tex_legacy_files");
  }
}

async function migrateDriverAdvances(companyMap, employeeMap, userMap, result) {
  const { rows } = await oldDb.query("select * from driver_advances order by created_at");
  for (const row of rows) {
    const tenantId = companyMap.get(row.company_id);
    const employeeId = employeeMap.get(row.employee_id);
    if (!tenantId || !employeeId) continue;
    await targetDb.query(
      `
        insert into tex_driver_advances (id, tenant_id, employee_profile_id, amount, currency, base_amount, advance_date, month, year, notes, created_by, created_at, updated_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$12)
        on conflict (id) do update set amount = excluded.amount, updated_at = excluded.updated_at
      `,
      [row.id, tenantId, employeeId, row.amount, row.currency, row.base_amount, row.advance_date, row.month, row.year, row.notes, userMap.get(row.created_by) ?? null, row.created_at]
    );
    await recordMap(tenantId, "driver_advances", row.id, "tex_driver_advances", row.id);
    increment(result.texRows, "tex_driver_advances");
  }
}

async function migrateSalaryPayments(companyMap, employeeMap, userMap, result) {
  const { rows } = await oldDb.query("select * from employee_salary_payments order by created_at");
  for (const row of rows) {
    const tenantId = companyMap.get(row.company_id);
    const employeeId = employeeMap.get(row.employee_id);
    if (!tenantId || !employeeId) continue;
    await targetDb.query(
      `
        insert into tex_employee_salary_payments (id, tenant_id, employee_profile_id, month, year, amount, currency, paid_by, paid_at, note, created_at, updated_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$11)
        on conflict (id) do update set amount = excluded.amount, updated_at = excluded.updated_at
      `,
      [row.id, tenantId, employeeId, row.month, row.year, row.amount, row.currency, userMap.get(row.paid_by) ?? null, row.paid_at, row.note, row.created_at]
    );
    await recordMap(tenantId, "employee_salary_payments", row.id, "tex_employee_salary_payments", row.id);
    increment(result.texRows, "tex_employee_salary_payments");
  }
}

async function migrateNotifications(companyMap, userMap, result) {
  const { rows } = await oldDb.query("select * from notifications order by created_at");
  for (const row of rows) {
    const tenantId = companyMap.get(row.company_id);
    if (!tenantId) continue;
    await targetDb.query(
      `
        insert into tex_notifications (id, tenant_id, user_id, title, body, type, related_expense_id, related_trip_id, is_read, created_at, updated_at)
        values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
        on conflict (id) do update set is_read = excluded.is_read, updated_at = excluded.updated_at
      `,
      [row.id, tenantId, userMap.get(row.user_id) ?? null, row.title, row.body, row.type, row.related_expense_id, row.related_trip_id, row.is_read ?? false, row.created_at]
    );
    await recordMap(tenantId, "notifications", row.id, "tex_notifications", row.id);
    increment(result.texRows, "tex_notifications");
  }
}

async function migrateSimple(sourceTable, targetTable, companyMap, mapper, result) {
  const { rows } = await oldDb.query(`select * from ${sourceTable} order by created_at`);
  for (const row of rows) {
    const tenantId = companyMap.get(row.company_id);
    if (!tenantId) continue;
    const mapped = mapper(row, tenantId);
    const placeholders = mapped.values.map((_, index) => `$${index + 1}`).join(",");
    const updates = mapped.columns
      .filter((column) => column !== "id")
      .map((column) => `${column} = excluded.${column}`)
      .join(", ");
    await targetDb.query(
      `insert into ${targetTable} (${mapped.columns.join(",")}) values (${placeholders}) on conflict (id) do update set ${updates}`,
      mapped.values
    );
    await recordMap(tenantId, sourceTable, row.id, targetTable, row.id);
    increment(result.texRows, targetTable);
  }
}

async function upsertTenant(company) {
  const slug = tenantSlug(company);
  const tenant = await one(
    targetDb.query(
      `
        insert into tenants (id, name, slug, status, legal_entity_name, billing_email, created_at, updated_at)
        values ($1,$2,$3,'active',$2,$4,$5,$5)
        on conflict (slug) do update set
          name = excluded.name,
          legal_entity_name = excluded.legal_entity_name,
          updated_at = now()
        returning id, slug
      `,
      [company.id, company.name, slug, null, company.created_at]
    ),
    "tenant"
  );
  await targetDb.query(
    `
      insert into tenant_settings (tenant_id, default_locale, timezone, created_at, updated_at)
      values ($1,'en','Asia/Dubai',coalesce($2,now()),now())
      on conflict (tenant_id) do update set
        updated_at = now()
    `,
    [tenant.id, company.created_at]
  );
  return tenant;
}

async function upsertUser(user) {
  const email = normalizeEmail(user.email);
  if (!email) {
    throw new Error(`Old app_user ${user.id} has no email.`);
  }
  return one(
    targetDb.query(
      `
        insert into users (id, email, status, created_at, updated_at)
        values ($1,$2,'active',$3::timestamptz,coalesce($4::timestamptz,$3::timestamptz))
        on conflict (email) do update set
          status = 'active',
          updated_at = now()
        returning id
      `,
      [user.id, email, user.created_at, user.updated_at]
    ),
    "user"
  );
}

async function upsertMembership(tenantId, userId, sourceMembership, roleIds) {
  await targetDb.query(
    `
      insert into tenant_memberships (tenant_id, user_id, status, joined_at, created_at, updated_at)
      values ($1,$2,'active',coalesce($3::timestamptz, now()),coalesce($3::timestamptz, now()),coalesce($4::timestamptz,$3::timestamptz,now()))
      on conflict (tenant_id, user_id) do update set
        status = 'active',
        updated_at = now()
    `,
    [tenantId, userId, sourceMembership.created_at, sourceMembership.updated_at]
  );

  const displayName = sourceMembership.full_name || sourceMembership.name || sourceMembership.email || "TEX User";
  const profileUpdate = await targetDb.query(
    `
      update user_profiles
         set display_name = $3,
             updated_at = now()
       where tenant_id = $1
         and user_id = $2
    `,
    [tenantId, userId, displayName]
  );
  if (profileUpdate.rowCount === 0) {
    await targetDb.query(
      `
        insert into user_profiles (tenant_id, user_id, display_name, created_at, updated_at)
        values ($1,$2,$3,coalesce($4::timestamptz,now()),coalesce($5::timestamptz,$4::timestamptz,now()))
      `,
      [tenantId, userId, displayName, sourceMembership.created_at, sourceMembership.updated_at]
    );
  }

  const roleId = roleIds.get(roleForUser(sourceMembership));
  if (!roleId) throw new Error(`Missing platform role for ${roleForUser(sourceMembership)}.`);
  await targetDb.query(
    `
      insert into user_role_assignments (tenant_id, user_id, role_id, created_at, updated_at)
      values ($1,$2,$3,now(),now())
      on conflict (tenant_id, user_id, role_id) do nothing
    `,
    [tenantId, userId, roleId]
  );
}

async function upsertSubscription(tenantId, productId, planId, company) {
  await targetDb.query(
    `
      insert into subscriptions (tenant_id, product_id, plan_id, status, starts_at, created_at, updated_at)
      values ($1,$2,$3,'active',coalesce($4,now()),coalesce($4,now()),now())
      on conflict (tenant_id, product_id) do update set
        plan_id = excluded.plan_id,
        status = 'active',
        updated_at = now()
    `,
    [tenantId, productId, planId, company.created_at]
  );
}

async function upsertIntegrationSettings(tenantId, company) {
  await targetDb.query(
    `
      insert into tex_integration_settings (
        tenant_id, whatsapp_provider, whatsapp_instance_id, wappfly_session_id,
        meta_phone_number_id, meta_whatsapp_business_account_id, created_at, updated_at
      )
      values ($1,$2,$3,$4,$5,$6,coalesce($7,now()),now())
      on conflict (tenant_id) do update set
        whatsapp_provider = excluded.whatsapp_provider,
        whatsapp_instance_id = excluded.whatsapp_instance_id,
        wappfly_session_id = excluded.wappfly_session_id,
        meta_phone_number_id = excluded.meta_phone_number_id,
        meta_whatsapp_business_account_id = excluded.meta_whatsapp_business_account_id,
        updated_at = now()
    `,
    [
      tenantId,
      normalizeProvider(company.whatsapp_provider),
      company.whatsapp_instance_id,
      company.wappfly_session_id,
      company.meta_phone_number_id,
      company.meta_whatsapp_business_account_id,
      company.created_at
    ]
  );
}

async function recordMap(tenantId, sourceTable, sourceId, targetTable, targetId, metadata = {}) {
  await targetDb.query(
    `
      insert into tex_migration_map (tenant_id, source_system, source_table, source_id, target_table, target_id, metadata)
      values ($1,$2,$3,$4,$5,$6,$7::jsonb)
      on conflict (source_system, source_table, source_id, target_table) do update set
        tenant_id = excluded.tenant_id,
        target_id = excluded.target_id,
        metadata = excluded.metadata
    `,
    [tenantId, SOURCE_SYSTEM, sourceTable, String(sourceId), targetTable, targetId, JSON.stringify(metadata)]
  );
}

async function loadRoleIds() {
  const { rows } = await targetDb.query("select id, key from roles where scope = 'customer'");
  return new Map(rows.map((row) => [row.key, row.id]));
}

async function countTables(client, tables) {
  const counts = {};
  for (const table of tables) {
    try {
      const { rows } = await client.query(`select count(*)::int as count from ${table}`);
      counts[table] = rows[0].count;
    } catch (error) {
      counts[table] = { error: error.message };
    }
  }
  return counts;
}

async function startRun(summary) {
  const row = await one(
    targetDb.query(
      "insert into tex_migration_runs (source_system, mode, status, summary) values ($1,'apply','started',$2::jsonb) returning id",
      [SOURCE_SYSTEM, JSON.stringify(summary)]
    ),
    "migration run"
  );
  return row.id;
}

async function finishRun(runId, status, summary, error) {
  await targetDb.query(
    "update tex_migration_runs set status = $1, summary = $2::jsonb, error = $3, completed_at = now() where id = $4",
    [status, JSON.stringify(summary), error?.stack || error?.message || null, runId]
  );
}

async function markRunFailed(runId, summary, error) {
  await targetDb.query(
    "update tex_migration_runs set status = 'failed', summary = $1::jsonb, error = $2, completed_at = now() where id = $3",
    [JSON.stringify(summary), error?.stack || error?.message || null, runId]
  );
}

async function tenantForTeam(teamId) {
  const { rows } = await targetDb.query("select tenant_id from tex_teams where id = $1", [teamId]);
  return rows[0]?.tenant_id ?? null;
}

async function one(promise, label) {
  const { rows } = await promise;
  if (!rows[0]) throw new Error(`Missing ${label}.`);
  return rows[0];
}

function connectionConfig(connectionString, sslFlag) {
  return {
    connectionString,
    ssl: sslFlag === "false" ? undefined : { rejectUnauthorized: false }
  };
}

function tenantSlug(company) {
  return slugify(company.name || `tex-${String(company.id).slice(0, 8)}`);
}

function slugify(value) {
  const slug = String(value).toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "");
  return slug || "tex-tenant";
}

function normalizeEmail(value) {
  return value ? String(value).trim().toLowerCase() : "";
}

function roleForUser(user) {
  if (user.super_admin) return "customer_admin";
  switch (user.role) {
    case "admin":
      return "customer_admin";
    case "finance":
    case "manager":
    case "coordinator":
      return "customer_manager";
    default:
      return "customer_standard_user";
  }
}

function normalizeSubmissionFrequency(value) {
  return ["realtime", "daily", "weekly", "monthly"].includes(value) ? value : "realtime";
}

function normalizeProvider(value) {
  return ["ultramsg", "wappfly", "meta"].includes(value) ? value : "ultramsg";
}

function normalizeTripType(value) {
  return ["general", "logistics"].includes(value) ? value : "general";
}

function normalizeTripStatus(value) {
  return ["open", "closed", "cancelled"].includes(value) ? value : "open";
}

function normalizePaidStatus(value) {
  return value === "paid" ? "paid" : "unpaid";
}

function normalizeLegMode(value) {
  return ["road", "sea", "air", "rail"].includes(value) ? value : null;
}

function normalizeLegStatus(value) {
  return ["planned", "in_transit", "completed", "cancelled"].includes(value) ? value : "planned";
}

function normalizeExpenseStatus(value) {
  return ["pending", "approved", "rejected", "paid"].includes(value) ? value : "pending";
}

function normalizeSubmissionStatus(value) {
  return ["open", "resolved", "ignored"].includes(value) ? value : "open";
}

function normalizePendingStatus(value) {
  return ["open", "resolved", "expired", "cancelled"].includes(value) ? value : "open";
}

function normalizeAction(value) {
  return value === "select_trip" ? value : "select_trip";
}

function increment(object, key) {
  object[key] = (object[key] ?? 0) + 1;
}
