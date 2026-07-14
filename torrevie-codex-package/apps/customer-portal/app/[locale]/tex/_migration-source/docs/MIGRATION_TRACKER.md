# TEX Migration Tracker

Target repository: `abousim/Torrevie_TEX`

Target production domain: `tex1.torrevie.com`

Baseline commit: `e4704fe7eafe0c9b169cd73c04d5d5136959e30e`

Migration plan: [`MIGRATION_PLAN.md`](../MIGRATION_PLAN.md)

## Completed

- [x] Initialized private GitHub repository.
- [x] Uploaded TEX baseline source snapshot.
- [x] Excluded local `.env`, `node_modules`, and `dist`.
- [x] Added repository README.
- [x] Added database/deployment migration plan.
- [x] Verified build/lint/test locally before upload.
- [x] Switched target database plan from Supabase to Neon, matching CRM.
- [x] Added initial Neon/Vercel API scaffolding.
- [x] Added Neon project, schema, and admin seed setup scripts.
- [x] Created Vercel project `torrevie/torrevie-tex`.
- [x] Provisioned Neon through the Vercel Marketplace.
- [x] Applied `db/schema.sql` to the new TEX Neon database.
- [x] Deployed production build to Vercel.
- [x] Added `tex1.torrevie.com` to the Vercel project.
- [x] Seeded first TEX production admin: `semaan@torrevie.com`.
- [x] Applied Torrevie CRM-standard branding to TEX UI, metadata, PWA assets, and auth screens.
- [x] Verified `tex1.torrevie.com` in Vercel after Cloudflare DNS propagation.
- [x] Migrated frontend login/session/password-reset screens from Supabase Auth to the Neon-backed API layer.
- [x] Added Postmark-compatible password reset delivery path in the API.
- [x] Added and applied the initial GCC currency baseline in Neon (`country_configs` and `currency_pegs`).
- [x] Added multi-company user memberships, auth company switching payload, and Admin Panel membership assignment.
- [x] Moved People employee manager selection, employee listing, and employee save/deactivate flows to the Neon API.
- [x] Added a no-network legacy Supabase compatibility shim and removed the Supabase browser SDK package from active dependencies.
- [x] Moved Settings company profile load/save and Admin/People user invitations to the Neon API.
- [x] Added invitation/password reset fallback links when Postmark delivery is not configured.
- [x] Configured TEX Postmark production delivery variables in Vercel and verified password reset delivery.
- [x] Hardened password reset routing so admin-triggered resets target a specific user ID and invalidate older open links for that target.
- [x] Invalidated outstanding password reset tokens after reset-routing hardening.
- [x] Moved Trips list/create/update/close flows from the Supabase shim to the Neon API.
- [x] Locked trip currency enforcement to each company's base currency in both the Trips UI and Neon API.
- [x] Moved New Expense manual creation, duplicate checks, policy checks, and draft save from the Supabase shim to the Neon API.
- [x] Added the Vercel `/api/webhooks/wappfly` inbound route and mapped the Al Ameen Wappfly session to Neon.
- [x] Replaced temporary receipt placeholders with Neon-backed receipt file storage and Vercel receipt upload/download/OCR endpoints.
- [x] Removed the Lovable AI gateway from OCR and switched the parser to the direct Google Gemini API.
- [x] Ported Wappfly receipt image capture to Neon/Vercel: encrypted WhatsApp media decrypt, delayed Wappfly media lookup, receipt file persistence, and OCR-backed expense population.
- [x] Moved expense approve/reject/pay/delete/trip actions off the Supabase shim and into Neon API routes with server-side Wappfly feedback.
- [x] Hardened direct Gemini OCR with base64 sanitization, model fallback/retry, and clearer OCR failure diagnostics.
- [x] Moved notification listing, mark-read, mark-all-read, and client notification creation to Neon API routes.
- [x] Moved expense edit/save to the Neon API, fixed edit date parsing, and added Trip/general-category approval gating in API and UI.
- [x] Backfilled standard TEX expense categories for existing Neon companies, including General and Maintenance.
- [x] Moved trip leg list/save/delete to Neon API routes and added Google Maps-backed place search and road-distance estimation support.
- [x] Enabled coordinators to see company receipt expenses, open receipt notifications directly, and link pending receipts to trips.
- [x] Moved Dashboard and Finance Review spend/settlement views to Neon APIs; added driver advances, trip driver amounts, and subcontractor payout settlement tracking.
- [x] Moved Manager, Employee, and My Team views to Neon APIs; added coordinator trip assignment on pending receipt cards.
- [x] Configured production Google Maps key on Vercel and verified Places autocomplete plus Routes distance estimates on live TEX.
- [x] Fixed trip driver payout update SQL casting so driver/subcontractor amounts save correctly.
- [x] Added authorized expense employee reassignment so receipts sent by one employee can be moved to the correct employee.
- [x] Treated Trip budget values as automatic paid driver advances in Dashboard and Finance Review.
- [x] Added employee monthly salary fields and salary payment tracking in Finance Review settlements.
- [x] Added in-app notifications for unregistered WhatsApp receipt senders.
- [x] Split platform Super Admin access from company Admin roles for tenant onboarding.
- [x] Fixed platform Super Admin password-reset routing so accounts without a tenant company open Admin Panel instead of self-service onboarding.
- [x] Moved self-service onboarding country load and company creation to Neon API routes.
- [x] Fixed Wappfly receipt replies to target the inbound WhatsApp chat JID, quote the original receipt message, persist acknowledgement audit details, and reuse that chat for approval/rejection/paid feedback.
- [x] Added a Neon-backed unregistered WhatsApp receipt queue so admins can review unknown senders, add the sender as an employee, or assign the receipt to an existing employee.
- [x] Added Wappfly direct-send fallback when quoted receipt replies are rejected, so unregistered-sender notices still reach the sender.
- [x] Sent unregistered Wappfly notices to both the LID chat and phone JID when needed, made notification clicks reveal the WhatsApp review queue, and de-duplicated album notifications.
- [x] Added Meta WhatsApp Cloud API webhook verification endpoint for migration away from Wappfly.
- [x] Added Meta WhatsApp Cloud API outbound text, media download, receipt intake, unregistered sender queueing, and company phone-number mapping.
- [x] Added a public TEX privacy policy route required for Meta app publishing and live WhatsApp webhook delivery.
- [x] Added Meta WhatsApp Cloud API provider controls to Company Settings and switched Al Ameen to the Meta provider.
- [x] Added the TEX privacy policy page to the main tool navigation.
- [x] Hardened Wappfly acknowledgements to prefer direct sends when quoted replies are accepted but later fail delivery.
- [x] Auto-reject duplicate WhatsApp receipt submissions and reply to the sender with the duplicate reason.
- [x] Added destructive Trip deletion with confirmation, linked expense and receipt-file cleanup, trip-leg cascade, trip budget advance removal, and audit logging.
- [x] Added return-to-origin Trip Leg support for land transport jobs, including Neon return-distance fields, Google Maps reverse-route estimates, return-inclusive leg totals, and coordinator UI controls.
- [x] Moved the customer Settings subscription plan display to the Neon company settings API so enterprise plans no longer appear as Trial.
- [x] Added WhatsApp trip-selection workflow: registered drivers receive numbered open-trip options after receipt submission and can reply with a number to auto-link the expense.
- [x] Hardened duplicate receipt detection to catch company-wide duplicate receipts across different employees when amount, currency, date window, and normalized vendor family match.
- [x] Fixed Finance Review month switching so approved receipts and unpaid trip payouts are filtered by the selected settlement period.
- [x] Added deposit slip attachment support for Trip paid advances, stored in Neon receipt files and shown in Trips plus Finance Review.

## Next Actions

- [ ] Port seed/reference data from Supabase migrations.
- [ ] Replace remaining Supabase frontend calls with `/api/...` module by module.
- [ ] Move Supabase edge functions into API routes.
- [ ] Choose and wire storage replacement for receipts and company logos.
- [ ] Validate API authorization by role: super admin, admin, finance, manager, coordinator, employee.
- [ ] Harden dependencies, especially `xlsx`.
- [ ] Configure hosting and environment variables for `tex1.torrevie.com`.
- [ ] Configure DNS and SSL.
- [ ] Run production smoke tests.

## Trace Standard

Use small branches and commits with prefixes from `MIGRATION_PLAN.md`:

- `migration:`
- `db:`
- `deploy:`
- `security:`
- `ui:`
- `fix:`
- `docs:`
