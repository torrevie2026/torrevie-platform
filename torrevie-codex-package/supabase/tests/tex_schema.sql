begin;

insert into public.users (id, email) values
  ('00000000-0000-0000-0000-00000000c001', 'tex-a@example.test'),
  ('00000000-0000-0000-0000-00000000c002', 'tex-b@example.test'),
  ('00000000-0000-0000-0000-00000000c003', 'tex-c@example.test');

insert into public.tenants (id, name, slug, status) values
  ('00000000-0000-0000-0000-00000001c001', 'TEX A', 'tex-a', 'active'),
  ('00000000-0000-0000-0000-00000001c002', 'TEX B', 'tex-b', 'active');

insert into public.files (id, tenant_id, storage_path, filename) values
  ('00000000-0000-0000-0000-00000002c001', '00000000-0000-0000-0000-00000001c001', 'tenant/00000000-0000-0000-0000-00000001c001/tex/expense/a', 'a.jpg'),
  ('00000000-0000-0000-0000-00000002c002', '00000000-0000-0000-0000-00000001c002', 'tenant/00000000-0000-0000-0000-00000001c002/tex/expense/b', 'b.jpg');

insert into public.tex_employee_profiles (id, tenant_id, user_id, name, phone_number) values
  ('00000000-0000-0000-0000-00000003c001', '00000000-0000-0000-0000-00000001c001', '00000000-0000-0000-0000-00000000c001', 'Employee A', '+971500000001'),
  ('00000000-0000-0000-0000-00000003c002', '00000000-0000-0000-0000-00000001c002', '00000000-0000-0000-0000-00000000c002', 'Employee B', '+971500000002');

insert into public.tex_teams (id, tenant_id, name, manager_employee_profile_id) values
  ('00000000-0000-0000-0000-00000004c001', '00000000-0000-0000-0000-00000001c001', 'Team A', '00000000-0000-0000-0000-00000003c001'),
  ('00000000-0000-0000-0000-00000004c002', '00000000-0000-0000-0000-00000001c002', 'Team B', '00000000-0000-0000-0000-00000003c002');

insert into public.tex_team_members (id, tenant_id, team_id, employee_profile_id) values
  ('00000000-0000-0000-0000-00000005c001', '00000000-0000-0000-0000-00000001c001', '00000000-0000-0000-0000-00000004c001', '00000000-0000-0000-0000-00000003c001'),
  ('00000000-0000-0000-0000-00000005c002', '00000000-0000-0000-0000-00000001c002', '00000000-0000-0000-0000-00000004c002', '00000000-0000-0000-0000-00000003c002');

insert into public.tex_expense_categories (id, tenant_id, name) values
  ('00000000-0000-0000-0000-00000006c001', '00000000-0000-0000-0000-00000001c001', 'Meals A'),
  ('00000000-0000-0000-0000-00000006c002', '00000000-0000-0000-0000-00000001c002', 'Meals B');

insert into public.tex_trips (id, tenant_id, name, team_id, driver_employee_profile_id) values
  ('00000000-0000-0000-0000-00000007c001', '00000000-0000-0000-0000-00000001c001', 'Trip A', '00000000-0000-0000-0000-00000004c001', '00000000-0000-0000-0000-00000003c001'),
  ('00000000-0000-0000-0000-00000007c002', '00000000-0000-0000-0000-00000001c002', 'Trip B', '00000000-0000-0000-0000-00000004c002', '00000000-0000-0000-0000-00000003c002');

insert into public.tex_trip_legs (id, tenant_id, trip_id, sequence, origin, destination) values
  ('00000000-0000-0000-0000-00000008c001', '00000000-0000-0000-0000-00000001c001', '00000000-0000-0000-0000-00000007c001', 1, 'Dubai', 'Abu Dhabi'),
  ('00000000-0000-0000-0000-00000008c002', '00000000-0000-0000-0000-00000001c002', '00000000-0000-0000-0000-00000007c002', 1, 'Riyadh', 'Jeddah');

insert into public.tex_expenses (
  id, tenant_id, submitter_user_id, employee_profile_id, vendor, expense_date, amount, currency, category, trip_id, trip_leg_id, receipt_file_id
) values
  ('00000000-0000-0000-0000-00000009c001', '00000000-0000-0000-0000-00000001c001', '00000000-0000-0000-0000-00000000c001', '00000000-0000-0000-0000-00000003c001', 'Vendor A', current_date, 10, 'AED', 'Meals A', '00000000-0000-0000-0000-00000007c001', '00000000-0000-0000-0000-00000008c001', '00000000-0000-0000-0000-00000002c001'),
  ('00000000-0000-0000-0000-00000009c002', '00000000-0000-0000-0000-00000001c002', '00000000-0000-0000-0000-00000000c002', '00000000-0000-0000-0000-00000003c002', 'Vendor B', current_date, 20, 'SAR', 'Meals B', '00000000-0000-0000-0000-00000007c002', '00000000-0000-0000-0000-00000008c002', '00000000-0000-0000-0000-00000002c002');

insert into public.tex_unregistered_whatsapp_submissions (id, tenant_id, sender_phone, message_id, receipt_file_id) values
  ('00000000-0000-0000-0000-00000010c001', '00000000-0000-0000-0000-00000001c001', '+971500000011', 'msg-a', '00000000-0000-0000-0000-00000002c001'),
  ('00000000-0000-0000-0000-00000010c002', '00000000-0000-0000-0000-00000001c002', '+966500000022', 'msg-b', '00000000-0000-0000-0000-00000002c002');

insert into public.tex_whatsapp_pending_actions (id, tenant_id, employee_profile_id, expense_id, provider) values
  ('00000000-0000-0000-0000-00000011c001', '00000000-0000-0000-0000-00000001c001', '00000000-0000-0000-0000-00000003c001', '00000000-0000-0000-0000-00000009c001', 'wappfly'),
  ('00000000-0000-0000-0000-00000011c002', '00000000-0000-0000-0000-00000001c002', '00000000-0000-0000-0000-00000003c002', '00000000-0000-0000-0000-00000009c002', 'meta');

insert into public.tex_spend_policies (id, tenant_id, category) values
  ('00000000-0000-0000-0000-00000012c001', '00000000-0000-0000-0000-00000001c001', 'Meals A'),
  ('00000000-0000-0000-0000-00000012c002', '00000000-0000-0000-0000-00000001c002', 'Meals B');

insert into public.tex_budgets (id, tenant_id, department, month, year, budget_amount) values
  ('00000000-0000-0000-0000-00000013c001', '00000000-0000-0000-0000-00000001c001', 'Ops A', 1, 2026, 100),
  ('00000000-0000-0000-0000-00000013c002', '00000000-0000-0000-0000-00000001c002', 'Ops B', 1, 2026, 200);

insert into public.tex_driver_advances (id, tenant_id, employee_profile_id, amount, currency, base_amount, month, year) values
  ('00000000-0000-0000-0000-00000014c001', '00000000-0000-0000-0000-00000001c001', '00000000-0000-0000-0000-00000003c001', 100, 'AED', 100, 1, 2026),
  ('00000000-0000-0000-0000-00000014c002', '00000000-0000-0000-0000-00000001c002', '00000000-0000-0000-0000-00000003c002', 200, 'SAR', 200, 1, 2026);

insert into public.tex_employee_salary_payments (id, tenant_id, employee_profile_id, month, year, amount, currency) values
  ('00000000-0000-0000-0000-00000015c001', '00000000-0000-0000-0000-00000001c001', '00000000-0000-0000-0000-00000003c001', 1, 2026, 100, 'AED'),
  ('00000000-0000-0000-0000-00000015c002', '00000000-0000-0000-0000-00000001c002', '00000000-0000-0000-0000-00000003c002', 1, 2026, 200, 'SAR');

insert into public.tex_erp_connections (id, tenant_id, erp_type) values
  ('00000000-0000-0000-0000-00000016c001', '00000000-0000-0000-0000-00000001c001', 'erp-a'),
  ('00000000-0000-0000-0000-00000016c002', '00000000-0000-0000-0000-00000001c002', 'erp-b');

insert into public.tex_per_diem_rates (id, tenant_id, destination, daily_rate, currency) values
  ('00000000-0000-0000-0000-00000017c001', '00000000-0000-0000-0000-00000001c001', 'Dubai', 100, 'AED'),
  ('00000000-0000-0000-0000-00000017c002', '00000000-0000-0000-0000-00000001c002', 'Riyadh', 200, 'SAR');

insert into public.tex_notifications (id, tenant_id, user_id, title) values
  ('00000000-0000-0000-0000-00000018c001', '00000000-0000-0000-0000-00000001c001', '00000000-0000-0000-0000-00000000c001', 'Notification A'),
  ('00000000-0000-0000-0000-00000018c002', '00000000-0000-0000-0000-00000001c002', '00000000-0000-0000-0000-00000000c002', 'Notification B');

insert into public.tex_integration_settings (id, tenant_id, whatsapp_provider) values
  ('00000000-0000-0000-0000-00000019c001', '00000000-0000-0000-0000-00000001c001', 'wappfly'),
  ('00000000-0000-0000-0000-00000019c002', '00000000-0000-0000-0000-00000001c002', 'meta');

set local role authenticated;
set local app.current_tenant_id = '00000000-0000-0000-0000-00000001c001';

do $$
declare
  table_name text;
  visible_count integer;
  insert_succeeded boolean := false;
begin
  foreach table_name in array array[
    'tex_employee_profiles',
    'tex_teams',
    'tex_team_members',
    'tex_expense_categories',
    'tex_trips',
    'tex_trip_legs',
    'tex_expenses',
    'tex_unregistered_whatsapp_submissions',
    'tex_whatsapp_pending_actions',
    'tex_spend_policies',
    'tex_budgets',
    'tex_driver_advances',
    'tex_employee_salary_payments',
    'tex_erp_connections',
    'tex_per_diem_rates',
    'tex_notifications',
    'tex_integration_settings'
  ] loop
    execute format(
      'select count(*) from public.%I where tenant_id = %L',
      table_name,
      '00000000-0000-0000-0000-00000001c002'
    ) into visible_count;

    if visible_count <> 0 then
      raise exception '% cross-tenant select leaked rows', table_name;
    end if;

    execute format(
      'update public.%I set updated_by = %L where id = %L',
      table_name,
      '00000000-0000-0000-0000-00000000c001',
      replace('00000000-0000-0000-0000-00000000c002', '00000000c', lpad((array_position(array[
        'tex_employee_profiles',
        'tex_teams',
        'tex_team_members',
        'tex_expense_categories',
        'tex_trips',
        'tex_trip_legs',
        'tex_expenses',
        'tex_unregistered_whatsapp_submissions',
        'tex_whatsapp_pending_actions',
        'tex_spend_policies',
        'tex_budgets',
        'tex_driver_advances',
        'tex_employee_salary_payments',
        'tex_erp_connections',
        'tex_per_diem_rates',
        'tex_notifications',
        'tex_integration_settings'
      ], table_name) + 2)::text, 8, '0') || 'c')
    );

    execute format(
      'delete from public.%I where tenant_id = %L',
      table_name,
      '00000000-0000-0000-0000-00000001c002'
    );
  end loop;

  begin
    insert into public.tex_expense_categories (tenant_id, name)
    values ('00000000-0000-0000-0000-00000001c002', 'Cross Tenant Category');
    insert_succeeded := true;
  exception when others then null;
  end;

  if insert_succeeded then
    raise exception 'tex_expense_categories cross-tenant insert succeeded';
  end if;
end $$;

reset role;

do $$
declare
  remaining_count integer;
begin
  select count(*) into remaining_count
  from public.tex_expenses
  where tenant_id = '00000000-0000-0000-0000-00000001c002';

  if remaining_count <> 1 then
    raise exception 'tex_expenses cross-tenant delete removed rows';
  end if;

  if exists (
    select 1
    from public.tex_expense_categories
    where tenant_id = '00000000-0000-0000-0000-00000001c002'
      and updated_by = '00000000-0000-0000-0000-00000000c001'
  ) then
    raise exception 'tex_expense_categories cross-tenant update changed row';
  end if;

  begin
    insert into public.tex_unregistered_whatsapp_submissions (tenant_id, sender_phone, message_id)
    values ('00000000-0000-0000-0000-00000001c002', '+966500000033', 'msg-b');
    raise exception 'tex_unregistered_whatsapp_submissions duplicate message insert succeeded';
  exception when unique_violation then null;
  end;
end $$;

set local role authenticated;
set local app.current_tenant_id = '';

do $$
declare
  visible_count integer;
begin
  select count(*) into visible_count from public.tex_expenses;
  if visible_count <> 0 then raise exception 'tex_expenses visible without tenant context'; end if;
end $$;

rollback;
