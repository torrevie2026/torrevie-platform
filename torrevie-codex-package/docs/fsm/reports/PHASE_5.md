# Phase 5 Report: WP-31 Brand and ROI

Date: 2026-07-13

## Scope

- Added an ROI dashboard under Torrevie FSM reports.
- Added tenant-scoped ROI aggregates from `intake_requests` and `call_logs`.
- Added editable ROI settings for baseline jobs per month, baseline response time, and estimated admin minutes saved per request.
- Added monthly value email text generation in Torrevie style.
- Added client report pack summary helpers and the fixed Torrevie FSM document footer.
- Added Enterprise white-label footer suppression through `fsm.white_label.portal.enabled`.
- Updated Customer Portal metadata and PWA manifest to `Torrevie FSM | Field Service Management` and `Torrevie FSM`.
- Added the approved Torrevie mark and the locked slogan to the Customer Portal login page.
- Removed Customer Portal gradients, drawer shadow, and off-token danger fallbacks touched by this phase.
- Added `pnpm test:fsm-roi` and included it in the normal test chain.

## Migration

- No migration was added in this phase.
- ROI settings reuse `tenants.baseline_metrics`.

## Decisions

- Used existing Channel Hub data for ROI because the repository does not yet contain FSM jobs, invoices, inspections, or SLA records.
- Treated converted and closed intake requests as the temporary proxy for completed operational work until the FSM job table exists.
- Rendered revenue, first-time-fix, and SLA compliance as pending metrics until their source tables exist.
- Kept monthly value email as a generated text artifact, not a scheduled sender, because the notification workflow is not yet implemented for FSM.
- Kept client report packs as a summary artifact with footer behavior until PDF generation and inspection data exist.
- Changed primary buttons in the Customer Portal to navy to follow the brand rule that turquoise is an accent, not the primary button background.

## Verification

- `pnpm test:fsm-roi`
- `pnpm test:fsm-adaptive-ux`
- `pnpm lint`
- `pnpm typecheck`

All gates listed above passed locally before this report was written.

## Known Gaps

- FSM jobs, invoices, inspections, and SLA records are not present in this repository yet.
- PDF generation is not present yet, so this phase provides the document footer helper and report-pack summary rather than a generated PDF.
- Monthly value email sending is not scheduled yet.
- Full Admin Portal brand cleanup remains outside this focused customer FSM slice.

## Manual Actions

- No provider accounts, secrets, DNS records, phone numbers, or billed resources were created.
