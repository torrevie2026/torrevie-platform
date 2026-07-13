# Torrevie FSM Entitlements

Torrevie FSM uses the platform entitlement layer. It does not create a parallel plan, role, or module system.

## Data Sources

- `plans`, `plan_features`, `subscriptions`, and `subscription_entitlements` hold platform plan-derived access.
- `org_feature_overrides` grants or revokes tenant-specific exceptions.
- `get_org_entitlements(org_id)` merges active subscription entitlements with active overrides.
- `tenant_modules` from the staging export maps to feature keys such as `fsm.module.pm`.

## Plan Tiers

| Tier | Primary use | Key limits |
|---|---|---|
| Entry | SOLO and light operations | 5 field users, 2 office users, core jobs, WhatsApp, basic ROI |
| Growth | TRADE and growing operations | 50 field users, 10 office users, PM, SLA, inspections, contracts, email, portal, full ROI |
| Enterprise | FM, COMMUNITY, OEM, large operations | Unlimited seats, voice included, compliance, API, SSO, branches, white-label portal |

## Enforcement Rules

- Navigation and dashboards filter through entitlements.
- Server actions check entitlements before creating voice setup or enforcing seat limits.
- Edge Functions must call database entitlement functions before activating gated behavior.
- Downgrade locks features above tier without deleting data.
- Overrides win over plan defaults until `expires_at`.

## Current Known Gaps

- FSM jobs, invoices, inspections, and SLA records are not yet present.
- Some entitlement checks are therefore UI and setup oriented until the operational tables land.
- Payment-provider billing is out of scope for this revamp.
