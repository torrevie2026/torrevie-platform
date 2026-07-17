# TEX Expense Platform

TEX is a multi-tenant expense, travel, approvals, finance review, reporting, and team-management application built with React, Vite, Tailwind, shadcn/ui, and a Neon-backed API migration in progress.

## Current Baseline

- Frontend: React 18, Vite 5, TypeScript, Tailwind, shadcn/ui, React Router, TanStack Query.
- Backend: currently transitioning from Supabase to the CRM-style Neon/Vercel API architecture.
- Key flows: login, onboarding, expense submission, receipt parsing, offline queue, approvals, trips, employees, reports, admin/settings, notifications, WhatsApp/webhook integrations.
- Package identity has been migrated from the Lovable scaffold name to `tex-expense-platform`.

## Local Development

```bash
npm install
npm run dev
```

The Vite dev server defaults to port `8080`.

## Verification

```bash
npm run build
npm run lint
npm test
```

Current status:

- `npm run build`: passes.
- `npm run lint`: passes with warnings.
- `npm test`: passes.

## Migration Notes

- Route pages are lazy-loaded to reduce the initial bundle.
- Vite manual chunks separate React, Supabase, TanStack Query, forms, and charts.
- Lint now keeps `no-explicit-any` as a warning so the project can pass checks while type debt is removed incrementally.
- Remaining warnings are concentrated around loose Supabase result typing, hook dependency arrays, and shadcn fast-refresh exports.
- Full repository, database, upload, and `tex1.torrevie.com` deployment planning is tracked in [MIGRATION_PLAN.md](./MIGRATION_PLAN.md).
- Supabase-to-Neon migration details are tracked in [docs/NEON_MIGRATION.md](./docs/NEON_MIGRATION.md).

## Security Follow-Up

`npm audit` currently reports dependency vulnerabilities. Most are updatable transitive packages, but `xlsx` has no audit fix available, so export/import functionality should either move to a maintained replacement or be isolated behind stricter validation before production hardening.
