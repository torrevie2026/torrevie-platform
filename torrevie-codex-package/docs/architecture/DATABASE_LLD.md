# Database Low-Level Design — Platform Foundation and CRM Vertical Slice

Scope: column-level schema for every table needed through Work Package 18 (platform foundation plus the CRM vertical slice). FSM, TEX, CME, and LQS schemas are added in their own migration sets when those phases start, following the same standards defined here.

Conventions applied to every table unless stated otherwise:

- Primary key: `id uuid primary key default gen_random_uuid()`.
- `created_at timestamptz not null default now()`, `updated_at timestamptz not null default now()`, maintained by a shared `set_updated_at()` trigger.
- `created_by uuid references users(id)`, `updated_by uuid references users(id)`, nullable only for system-generated rows.
- `tenant_id uuid not null references tenants(id)` on every tenant-scoped table, indexed as the leading column of any composite index used for tenant-scoped lookups.
- `version integer not null default 1` on tables subject to concurrent edits (added explicitly where used).
- `deleted_at timestamptz` for soft deletion, on tables where recovery or audit history matters.

## Platform tables

### tenants

Global, not tenant-scoped itself.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| name | text not null | |
| slug | text not null unique | Used in URLs and support references |
| status | text not null | `active`, `trial`, `suspended`, `archived` |
| region | text | Data-residency configuration point |
| legal_entity_name | text | |
| billing_email | text | |
| created_at, updated_at | timestamptz | |

### tenant_settings

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id | uuid fk unique | One row per tenant |
| default_locale | text not null default 'en' | `en` or `ar` |
| timezone | text not null default 'Asia/Dubai' | |
| branding | jsonb | Logo override, allowed customization only |
| created_at, updated_at | timestamptz | |

### users

Global identity. A user can belong to more than one tenant through `tenant_memberships`.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | Matches Supabase Auth `auth.users.id` |
| email | text not null unique | |
| status | text not null default 'active' | `active`, `deactivated` |
| mfa_enrolled | boolean not null default false | |
| created_at, updated_at | timestamptz | |

### tenant_memberships

Tenant-scoped.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id | uuid fk | |
| user_id | uuid fk | |
| status | text not null default 'active' | `active`, `invited`, `disabled` |
| invited_by | uuid fk users(id) | |
| joined_at | timestamptz | |
| unique | (tenant_id, user_id) | One membership row per user per tenant |

### user_profiles

Tenant-scoped, since display fields can differ per tenant context.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id | uuid fk | |
| user_id | uuid fk | |
| display_name | text not null | |
| locale | text | Overrides tenant default if set |
| avatar_file_id | uuid fk files(id) | Nullable |

### roles

Global template rows, referenced by tenant. Custom roles are a Phase 11+ capability; at launch every tenant uses the fixed role set.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| key | text not null unique | e.g. `torrevie_platform_admin`, `customer_admin`, `customer_standard_user` |
| label | text not null | |
| scope | text not null | `platform` or `customer` |

### permissions

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| key | text not null unique | e.g. `opportunity.read`, `platform.provision` |
| description | text | |

### role_permissions

| Column | Type | Notes |
| --- | --- | --- |
| role_id | uuid fk | |
| permission_id | uuid fk | |
| primary key | (role_id, permission_id) | |

### user_role_assignments

Tenant-scoped.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id | uuid fk | |
| user_id | uuid fk | |
| role_id | uuid fk | |
| assigned_by | uuid fk users(id) | |
| unique | (tenant_id, user_id, role_id) | |

### products

Global.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| key | text not null unique | `crm`, `fsm`, `tex`, `cme`, `lqs` |
| label | text not null | |

### plans

Global.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| product_id | uuid fk | |
| key | text not null | e.g. `starter`, `growth`, `enterprise` |
| label | text not null | |
| unique | (product_id, key) | |

### plan_features

Global.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| plan_id | uuid fk | |
| feature_key | text not null | |
| limit_value | integer | Nullable, null means unlimited |

### subscriptions

Tenant-scoped.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id | uuid fk | |
| product_id | uuid fk | |
| plan_id | uuid fk | |
| status | text not null | `trial`, `active`, `expired`, `cancelled` |
| starts_at | timestamptz not null | |
| expires_at | timestamptz | |
| unique | (tenant_id, product_id) | One active subscription per product per tenant |

### subscription_entitlements

Tenant-scoped, resolved and cached from `plan_features` plus any tenant-specific override.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id | uuid fk | |
| subscription_id | uuid fk | |
| feature_key | text not null | |
| limit_value | integer | Nullable |
| override_reason | text | Set only when this differs from the plan default |

### feature_flags

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| key | text not null unique | |
| tenant_id | uuid fk nullable | Null means a global platform flag |
| enabled | boolean not null default false | |

### audit_events

Tenant-scoped, plus a Torrevie-wide view for staff via a security-definer function, never a direct cross-tenant table grant.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id | uuid fk | Nullable only for platform-level events with no tenant context |
| actor_user_id | uuid fk | Nullable for system-generated events |
| action | text not null | e.g. `opportunity.created`, `user.role_assigned` |
| target_type | text | |
| target_id | uuid | |
| metadata | jsonb | Never contains secrets or full sensitive record contents |
| occurred_at | timestamptz not null default now() | |

### files

Tenant-scoped, metadata only; the object itself lives in Supabase Storage.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id | uuid fk | |
| storage_path | text not null | `tenant/{tenant_id}/{product}/{entity_type}/{entity_id}/{file_id}` |
| filename | text not null | |
| content_type | text | |
| size_bytes | bigint | |
| uploaded_by | uuid fk users(id) | |

### provisioning_jobs

Tenant-scoped.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id | uuid fk | |
| status | text not null | `pending`, `running`, `succeeded`, `failed` |
| started_at | timestamptz | |
| completed_at | timestamptz | |

### provisioning_steps

Tenant-scoped through the parent job.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| provisioning_job_id | uuid fk | |
| tenant_id | uuid fk | Denormalized for direct RLS filtering |
| step_key | text not null | e.g. `create_tenant`, `seed_defaults`, `create_admin_invite` |
| status | text not null | `pending`, `running`, `succeeded`, `failed` |
| attempt_count | integer not null default 0 | |
| error | text | |

## CRM tables (Work Package 17)

### accounts

Tenant-scoped.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id | uuid fk | |
| name | text not null | |
| industry | text | |
| owner_user_id | uuid fk users(id) | |
| deleted_at | timestamptz | Soft delete |

### contacts

Tenant-scoped. Shared platform concept, referenced by FSM later rather than duplicated.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id | uuid fk | |
| account_id | uuid fk accounts(id) | Nullable |
| first_name | text not null | |
| last_name | text | |
| email | text | |
| phone | text | |
| source_module | text | `crm`, `fsm`, `lqs`; identifies originating context without duplicating the table |
| deleted_at | timestamptz | Soft delete |

### pipeline_stages

Tenant-scoped, customer-configurable.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id | uuid fk | |
| key | text not null | |
| label | text not null | |
| sort_order | integer not null | |

### opportunities

Tenant-scoped.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id | uuid fk | |
| account_id | uuid fk accounts(id) | |
| primary_contact_id | uuid fk contacts(id) | Nullable |
| pipeline_stage_id | uuid fk pipeline_stages(id) | |
| name | text not null | |
| amount | numeric(14,2) | |
| currency | text default 'AED' | |
| owner_user_id | uuid fk users(id) | |
| version | integer not null default 1 | Optimistic concurrency |
| closed_at | timestamptz | Nullable |

### activities

Tenant-scoped, shared concept usable by FSM and TEX approvals later.

| Column | Type | Notes |
| --- | --- | --- |
| id | uuid pk | |
| tenant_id | uuid fk | |
| related_type | text not null | e.g. `opportunity`, `account` |
| related_id | uuid not null | |
| activity_type | text not null | `call`, `email`, `meeting`, `note` |
| notes | text | |
| occurred_at | timestamptz not null default now() | |

## Indexing notes

- Every `tenant_id` column is indexed.
- Composite indexes lead with `tenant_id` for any query that filters by tenant plus another field, for example `(tenant_id, owner_user_id)` on `opportunities`.
- `contacts.email` gets a composite unique index `(tenant_id, email)` where email is present, not a global unique constraint, since two tenants may legitimately have contacts sharing an email address.

## JSONB usage

Limited to `tenant_settings.branding`, `audit_events.metadata`, and future product-specific configurable structures such as LQS questionnaire responses and FSM checklist responses, added in their respective migration sets. Never used for CRM's core fields, which are fixed and known in shape.
