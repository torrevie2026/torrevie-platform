# TEX Migration Notes

This folder is the Torrevie customer portal TEX route.

Keep only Next.js route files and integrated TEX client/server components at this level:

- `page.tsx`
- `actions.ts`
- `TexExpensesClient.tsx`
- `TexFinanceClient.tsx`
- `TexTripsClient.tsx`

The previous standalone TEX project has been moved to `_migration-source/` for reference only. Do not preserve its standalone Vite, Neon, Vercel, or separate-app structure during migration.

Migration target rules:

- TEX remains inside `apps/customer-portal/app/[locale]/tex`.
- TEX API routes belong under `apps/customer-portal/app/api/tex`.
- TEX domain logic belongs under `apps/customer-portal/lib/tex.ts` or `apps/customer-portal/lib/tex/*`.
- Database changes belong in root `supabase/migrations`.
- Tenant-isolation tests belong in root `supabase/tests`.
- Use the shared Supabase database and platform tenant model.
- Do not introduce a separate deployable app, Neon database, or `tex1.torrevie.com` deployment path.
- Do not copy secrets from `_migration-source/`; document required variables in root `.env.example` only.
