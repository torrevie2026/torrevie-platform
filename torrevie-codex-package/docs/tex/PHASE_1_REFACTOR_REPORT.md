# TEX Phase 1 Refactor Report

Date: 2026-07-20

## Scope

Phase 1 was a behavior-preserving refactor of the TEX customer-portal domain layer. The goal was to reduce the risk and maintenance burden of the monolithic `apps/customer-portal/lib/tex.ts` file without changing product behavior, database contracts, tenant isolation, API route surfaces, or notification semantics.

No Supabase schema, RLS, storage policy, auth, or deployment changes were made in this phase.

## Result

`apps/customer-portal/lib/tex.ts` is now a workflow facade: exported TEX operations remain there, while validation, mapping, persistence helpers, OCR helpers, WhatsApp helpers, and shared utilities have been moved into focused modules under `apps/customer-portal/lib/tex/`.

The main service file is now about 3,786 lines and has no remaining private helper functions detected by the current helper scan. Its responsibilities are now primarily:

- permission checks at workflow entry points
- tenant context wrapping
- orchestration of SQL operations and helper calls
- public TEX domain API exports

## New Module Boundaries

Core contracts:

- `types.ts` contains public TEX DTO/domain types.
- `db-types.ts` contains internal database row shapes.
- `mappers.ts` contains row-to-domain mapping.
- `shared.ts` contains small generic helpers.
- `validation.ts` contains generic numeric/date/UUID validation helpers.

Access and audit:

- `access.ts` contains TEX permission guards and standard-user scoping.
- `audit.ts` contains audit event persistence.

Inputs and settings:

- `expense-input.ts` contains expense, receipt upload, webhook submission, and expense status validation.
- `people-input.ts` contains employee/team/notification/driver advance input normalization.
- `trip-input.ts` contains trip and trip-leg input normalization.
- `settings-input.ts` contains category, policy, and budget input normalization.

TEX business helpers:

- `plan-context.ts` contains plan fallback and mapping.
- `onboarding.ts` contains onboarding progress mapping.
- `email-report.ts` contains email report summary/recipient/html helpers.
- `fx-rates.ts` contains FX provider/fallback fetch logic.
- `report-queries.ts` contains report expense query logic.
- `integration-settings-queries.ts` contains tenant integration settings queries.
- `people-queries.ts` contains employee/team lookup and validation helpers.
- `trip-queries.ts` contains trip existence validation.
- `duplicate-detection.ts` contains duplicate receipt matching.

Receipt and WhatsApp:

- `receipt-file.ts` contains receipt file type/name/base64 utilities.
- `receipt-storage.ts` contains Supabase storage upload/download helpers.
- `receipt-extraction.ts` contains OCR extraction wrappers for uploads, stored files, and WhatsApp review submissions.
- `quick-connect.ts` contains Quick Connect session/event helpers.
- `whatsapp-delivery.ts` contains WhatsApp reply dispatch, approval/rejection/payment replies, Quick Connect outbox queueing, and test dispatcher override.
- `whatsapp-expenses.ts` contains WhatsApp-created expense insert persistence.
- `whatsapp-messages.ts` contains WhatsApp message classification and reply text builders.
- `whatsapp-receipts.ts` contains receipt-field resolution, attachment status, currency defaults, and duplicate vendor normalization.
- `whatsapp-review.ts` contains WhatsApp review mapping and OCR result parsing.
- `whatsapp-senders.ts` contains phone/JID sender matching to employee profiles.
- `whatsapp-submissions.ts` contains WhatsApp submission insert persistence and status filter validation.

## Problem Areas Addressed

- The prior monolithic file mixed public workflows, SQL persistence, validation, storage, OCR, WhatsApp delivery, mapping, and formatting.
- Duplicate input-normalization logic was embedded beside workflow orchestration.
- WhatsApp receipt behavior was difficult to audit because sender matching, OCR extraction, delivery, duplicate matching, and expense insertion lived in one large file.
- Row shapes and public DTOs were co-located, making safe changes harder.
- Testing individual helpers was awkward because most logic was private to the monolith.

## Remaining Risks

- Large exported workflows still remain in `tex.ts`. They are easier to read now, but the file still owns many public operations.
- Some SQL query blocks are still embedded inside exported workflows. Moving them should be done only when the next boundary is clear.
- WhatsApp review resolution remains a high-risk orchestration path because it touches OCR, duplicate handling, employee assignment, expense insertion, audit, and outbound replies.
- There is no new dedicated unit test file for each extracted module yet; regression confidence currently comes from the existing TEX domain/API/cron/webhook test suite.

## Verification

The following commands passed after the refactor:

```bash
pnpm test:tex
pnpm typecheck
```

Covered suites:

- TEX AI provider tests
- TEX domain tests
- TEX API boundary tests
- TEX cron tests
- TEX webhook tests
- Full workspace TypeScript typecheck

## Recommended Next Phase

Phase 2 should be planned separately because it can change architectural ownership more significantly even if behavior remains the same.

Recommended sequence:

1. Split exported workflows from `tex.ts` by business area:
   - people/team service
   - trips/legs service
   - expenses/receipts service
   - finance/reporting service
   - WhatsApp review service
   - settings/integration service

2. Add focused tests for extracted modules:
   - duplicate matching
   - sender matching
   - receipt extraction fallbacks
   - WhatsApp delivery/outbox behavior
   - trial/standard-user expense scoping

3. Profile slow navigation paths with query counts and timings before optimizing:
   - dashboard/bootstrap
   - expenses queue
   - trips and trip legs
   - WhatsApp review

4. Move repeated SQL projections into query helpers only when multiple workflows reuse them.

5. Keep database/RLS changes out of refactor-only work unless a measured performance issue requires an index or policy adjustment.

## Phase 2 Progress

Started on 2026-07-20 as behavior-preserving workflow extraction from the `tex.ts` facade.

Completed slices:

- `notifications.ts` now owns notification listing, creation, single read marking, and bulk read marking.
- `settings-service.ts` now owns settings workspace reads, duplicate-processing settings, expense categories, spend policies, and budgets.
- `receipt-service.ts` now owns receipt upload/download workflows, including storage object persistence, file row persistence, audit logging, and standard-user receipt scoping.
- `finance-service.ts` now owns finance review, reporting workspace, email report dispatch/test override, FX workspace, FX refresh, and finance payment workflows.
- `people-service.ts` now owns employee profile and team creation/update/delete workflows, while shared people lookup helpers remain in `people-queries.ts` for WhatsApp and bootstrap reuse.
- `trips-service.ts` now owns trip listing, create/update/close workflows, trip leg listing, trip leg replacement, and trip leg deletion.
- `driver-advances-service.ts` now owns driver advance creation and deletion workflows.
- `expenses-service.ts` now owns manual/web expense listing, creation, update, and status transition workflows.
- `bootstrap-service.ts` now owns actor context resolution, bootstrap workspace loading, and onboarding status updates.
- `integrations-service.ts` now owns integration workspace loading and Quick Connect pairing/disconnect workflows.
- `webhook-service.ts` now owns raw webhook submission recording.
- `whatsapp-processing-service.ts` now owns WhatsApp receipt/status processing, unregistered submission listing, ignore, and resolution workflows.
- `apps/customer-portal/lib/tex.ts` is now a compatibility facade that only exports public TEX types and re-exports service functions.

The public API remains exported from `apps/customer-portal/lib/tex.ts`, so existing callers do not need import changes.

Verification after Phase 2 slices:

```bash
pnpm test:tex
pnpm typecheck
```
