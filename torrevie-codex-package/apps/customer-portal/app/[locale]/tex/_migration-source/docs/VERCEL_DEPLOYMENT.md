# TEX Vercel Deployment

Target project: `torrevie/torrevie-tex`

Production deployment:

- Vercel project created from this workspace.
- Neon marketplace resource provisioned through Vercel: `torrevie-tex-neon`.
- Neon region matched to CRM: `iad1`.
- Neon Auth disabled; TEX uses the CRM-style JWT cookie auth layer.
- `DATABASE_URL` and related Postgres variables are managed by Vercel/Neon.
- `AUTH_SECRET` and `APP_URL=https://tex1.torrevie.com` are configured in Vercel for production, preview, and development.
- `db/schema.sql` was applied successfully to Neon.
- Database verification: 23 public tables and 1 `email_send_state` row.
- First admin account seeded: `semaan@torrevie.com`.
- API routes enter through `api/index.js`, which delegates to `api/[...route].js`; SPA rewrites exclude `/api`.
- TEX has been rebranded to the Torrevie CRM-standard visual system, including logo assets, teal theme, PWA metadata, and auth screens.
- Frontend sign-in, sign-out, profile hydration, and password reset now use the Neon-backed `/api/auth/...` routes instead of Supabase Auth.
- Postmark password reset delivery is implemented in the API. Vercel must contain `EMAIL_PROVIDER=postmark`, `EMAIL_FROM`, and `POSTMARK_SERVER_TOKEN`; the CRM project stores these as encrypted production secrets, but Vercel does not expose their values for cloning.

Current production URL:

- `https://torrevie-tex.vercel.app`

Custom domain:

- `tex1.torrevie.com` has been added to the Vercel project.
- DNS now resolves to Vercel and the domain verifies successfully in Vercel.

Verification command:

```bash
npm exec vercel -- domains verify tex1.torrevie.com --scope torrevie
```
