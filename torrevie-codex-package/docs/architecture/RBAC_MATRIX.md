# RBAC and Permission Matrix

## Roles

| Role key | Scope | Description |
| --- | --- | --- |
| torrevie_platform_admin | platform | Full Control Plane access |
| torrevie_operations_admin | platform | Tenant health, provisioning, support access |
| torrevie_support_agent | platform | Read-only tenant health, time-boxed support access sessions |
| torrevie_billing_admin | platform | Subscription, plan, usage data |
| torrevie_security_admin | platform | Audit logs, security events, access-control config |
| customer_admin | customer | Full administration of own tenant |
| customer_module_admin | customer | Administration scoped to one subscribed product |
| customer_manager | customer | Elevated in-product permissions (approvals, reassignment) |
| customer_standard_user | customer | Day-to-day product usage |
| customer_readonly | customer | View-only access |
| integration_service | customer | Scoped API access for one integration |

## Core permission keys (extend per product as each module is built)

| Permission key | Description |
| --- | --- |
| platform.provision | Create, suspend, reactivate, archive a tenant |
| platform.subscription.manage | Assign products, plans, entitlements to a tenant |
| platform.support_access.grant | Start a time-boxed support-access session |
| platform.audit.read_all | Read audit events across every tenant |
| tenant.settings.manage | Edit tenant settings and branding |
| tenant.user.invite | Invite a new user into the tenant |
| tenant.user.manage | Edit or deactivate an existing tenant member |
| tenant.role.assign | Assign a role to a tenant member |
| crm.account.read | Read CRM accounts |
| crm.account.write | Create or edit CRM accounts |
| crm.opportunity.read | Read opportunities, scoped by ownership rule below |
| crm.opportunity.write | Create or edit opportunities, scoped by ownership rule below |
| crm.pipeline.manage | Configure pipeline stages |
| fsm.work_order.read | Read work orders |
| fsm.work_order.update_assigned | Update a work order the technician is assigned to |
| fsm.work_order.manage | Full work order administration |
| tex.expense.submit | Submit an expense claim |
| tex.expense.approve | Approve an expense claim at an assigned approval step |
| tex.policy.manage | Configure expense policies |
| cme.content.draft | Create AI-assisted content drafts |
| cme.content.publish | Approve and publish content |
| lqs.lead.read | Read leads |
| lqs.lead.qualify | Update qualification status |
| lqs.scoring.manage | Configure scoring and routing rules |

## Role-to-permission mapping (initial, extend as product permissions are added)

| Role | Permissions |
| --- | --- |
| torrevie_platform_admin | platform.provision, platform.subscription.manage, platform.support_access.grant, platform.audit.read_all, all customer_admin-equivalent permissions for support purposes only, exercised via a support-access session |
| torrevie_operations_admin | platform.provision, platform.support_access.grant |
| torrevie_support_agent | platform.support_access.grant (session-scoped only), platform.audit.read_all (read-only) |
| torrevie_billing_admin | platform.subscription.manage (read/write), platform.audit.read_all (billing-relevant events only) |
| torrevie_security_admin | platform.audit.read_all, tenant.role.assign (review only, not routine use) |
| customer_admin | tenant.settings.manage, tenant.user.invite, tenant.user.manage, tenant.role.assign, and every product permission for products the tenant is subscribed to |
| customer_module_admin | Full write access within one subscribed product only, for example crm.pipeline.manage, but not tenant.user.manage |
| customer_manager | crm.opportunity.write (any record, not just own), tex.expense.approve, fsm.work_order.manage |
| customer_standard_user | crm.account.read, crm.opportunity.read/write (own records only), fsm.work_order.update_assigned, tex.expense.submit, cme.content.draft, lqs.lead.qualify |
| customer_readonly | All `.read` permissions for subscribed products only, no write permissions |
| integration_service | Exactly the permission set configured for that specific integration at creation time, never a role-based default |

## Ownership-scoped permissions

Some permissions are further narrowed by ownership at the application layer, not by the permission key alone:

- `crm.opportunity.write` for `customer_standard_user` applies only where `opportunities.owner_user_id` matches the caller, or the caller is on the same team as the owner (team membership resolved separately, added when team structures are built). `customer_manager` and above bypass this narrowing.
- `fsm.work_order.update_assigned` applies only where the caller's user_id appears in that specific work order's technician assignment.
- `tex.expense.approve` applies only where the caller is the designated approver for the expense's current approval step, resolved by the workflow library, not by role alone.

This mirrors HLD Section 16: role gives the general capability, ownership and workflow context narrow it further, and RLS is the final backstop regardless of what the application layer decided.
