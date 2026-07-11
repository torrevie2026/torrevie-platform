# Brand Guidelines — Quick Reference for Codex

Source: `Torrevie_Brand_Guidelines.docx`, the master reference that consolidates Brand Strategy and Positioning and Visual Identity. When any brand question arises during development that is not answered by `BRAND_FOR_CODEX.md`, this is the tie-breaker.

## At a glance

- **Name:** Torrevie. Not Torrevie Consulting, anywhere in the product.
- **Slogan:** Optimize. Execute. Scale. (full stops, no commas, no second tagline)
- **One-line positioning:** We help companies optimize operations before applying AI.
- **Color:** Deep Navy `#162449`, Turquoise `#0D9488`, Steel Blue `#4A6FA5`, Light Grey `#F2F4F7`, Black `#0A0A0A`, White `#FFFFFF`.
- **Typography:** Inter everywhere. No second family.
- **Logo:** full color mark on light backgrounds only; white reversed mark on navy/dark backgrounds.

## Do

- Use "Torrevie" alone on every screen, email, and document the product generates.
- Use "Optimize. Execute. Scale." with full stops, wherever the slogan appears at all (for example, a login screen or a marketing footer).
- Use Inter for every typeface need across web and mobile.
- Use the full color mark only on light backgrounds.
- Use the teal underline as the standard section divider in dashboards and reports.

## Do not

- Use "Torrevie Consulting" outside a legal footer.
- Use "Optimize, Execute, Scale" with commas, or introduce any competing tagline.
- Introduce a second typeface family anywhere in the codebase, including system-generated PDFs or emails.
- Place the full color mark on navy or dark photography.
- Add gradients, drop shadows, or 3D effects to UI elements outside the logo itself.

## Governance

A locked decision here (name, slogan, color, type) is never altered for a single screen, a single tenant's branding request, or a single feature. Tenant-level branding customization (per the HLD's `tenant_settings.branding` field) is limited to what Torrevie explicitly allows, for example a tenant's own logo in specific white-labeled surfaces, and never overrides Torrevie's own product chrome, admin portal, or system emails. If a genuine branding gap appears during development that none of the three brand documents or `BRAND_FOR_CODEX.md` answers, flag it rather than deciding it ad hoc, so it can be resolved once and reflected back into these documents.
