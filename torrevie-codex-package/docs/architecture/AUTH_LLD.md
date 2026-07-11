# Authentication Low-Level Design

## Provider

Supabase Auth, used as-is, no custom identity service.

## Methods enabled at launch

- Email and password.
- Email magic link (passwordless).
- Multi-factor authentication (TOTP), optional for standard customer users, mandatory for `customer_admin` and every Torrevie staff role.

## Tenant claim on the JWT

Supabase Auth custom access token hook injects `tenant_id` and a coarse `role_scope` (`platform` or `customer`) into the JWT at token issuance, resolved from the user's currently active `tenant_memberships` row. A user belonging to more than one tenant selects an active tenant at login (or via a tenant switcher); the JWT reflects only the currently active tenant, never every tenant the user belongs to at once.

```sql
-- Auth hook, simplified
create or replace function auth_hook_add_tenant_claim(event jsonb)
returns jsonb
language plpgsql
as $$
declare
  active_tenant uuid;
begin
  select tenant_id into active_tenant
  from tenant_memberships
  where user_id = (event->>'user_id')::uuid
    and status = 'active'
  order by joined_at desc
  limit 1;

  return jsonb_set(event, '{claims,tenant_id}', to_jsonb(active_tenant));
end;
$$;
```

This claim is a convenience for client-side UI state only (for example, showing the current tenant name). It is never trusted as the sole basis for a server-side authorization decision. Every server-side request re-resolves tenant membership from the database through `packages/tenant-context`, per the rule in `AGENTS.md` and the flow in the HLD, Section 16.

## Session and token lifetime

- Access token lifetime: 30 minutes.
- Refresh token rotation: enabled, Supabase default behavior.
- Idle session timeout on the web app: 8 hours of inactivity triggers a re-login prompt.
- Mobile app: refresh token stored in the platform secure keychain, never in plain shared preferences.

## Account lockout

Five failed attempts within 15 minutes triggers a temporary lockout of 15 minutes, enforced by Supabase Auth's built-in rate limiting plus an application-level check that also writes an `audit_events` row for the lockout itself.

## Invitations

No open self-registration for customer tenants. A new customer user is created only via an invitation issued by a `customer_admin` or a Torrevie staff member during provisioning. The invitation flow:

1. Inviter submits an email and a role within `apps/admin-portal` or `apps/customer-portal`.
2. A `tenant_memberships` row is created with `status = 'invited'`.
3. Supabase Auth sends an invite email; on acceptance, `status` moves to `active` and `joined_at` is set.
4. An `audit_events` row is written for the invite and for the acceptance.

## Deactivation

Setting `users.status = 'deactivated'` or `tenant_memberships.status = 'disabled'` blocks authentication at the application layer immediately on the next request; existing sessions are also explicitly revoked via Supabase Auth's admin API at the moment of deactivation, not left to expire naturally.

## Service accounts (API keys)

Integration service accounts authenticate with a scoped API key, not a Supabase Auth session. The key is a random token, stored hashed (never in plaintext) in `integration_secrets`, tied to a specific `tenant_id` and a specific, minimal set of permissions. Every request authenticated by an API key is attributed to the integration in `audit_events.actor_user_id`-equivalent field, distinguished from a human actor.

## Enterprise SSO (deferred)

Supabase Auth supports SAML and OIDC providers. Not configured at launch. When a specific enterprise contract requires it, this document is updated with the exact provider configuration and this becomes a scoped work package, not a default.

## MFA

TOTP-based, using Supabase Auth's MFA API. Enforcement:

- Torrevie staff roles: mandatory before any Control Plane access is granted.
- `customer_admin`: mandatory before administrative actions are permitted; a grace period of 7 days from account creation is allowed before enforcement blocks login entirely.
- All other customer roles: offered, not enforced, at launch.
