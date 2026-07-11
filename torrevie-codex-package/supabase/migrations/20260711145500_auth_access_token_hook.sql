create or replace function public.auth_hook_add_tenant_claim(event jsonb)
returns jsonb
language plpgsql
stable
security definer
set search_path = ''
as $$
declare
  claims jsonb;
  active_tenant uuid;
  active_role_scope text;
begin
  claims := event->'claims';

  select tm.tenant_id, coalesce(r.scope, 'customer')
  into active_tenant, active_role_scope
  from public.tenant_memberships tm
  left join public.user_role_assignments ura
    on ura.tenant_id = tm.tenant_id
   and ura.user_id = tm.user_id
  left join public.roles r
    on r.id = ura.role_id
  where tm.user_id = (event->>'user_id')::uuid
    and tm.status = 'active'
  order by
    case when r.scope = 'platform' then 0 else 1 end,
    tm.joined_at desc nulls last,
    tm.created_at desc
  limit 1;

  if active_tenant is not null then
    claims := jsonb_set(claims, '{tenant_id}', to_jsonb(active_tenant::text), true);
    claims := jsonb_set(claims, '{role_scope}', to_jsonb(coalesce(active_role_scope, 'customer')), true);
  end if;

  return jsonb_set(event, '{claims}', claims, true);
end;
$$;

revoke execute on function public.auth_hook_add_tenant_claim(jsonb) from public;
grant execute on function public.auth_hook_add_tenant_claim(jsonb) to supabase_auth_admin;
