# Visual Identity — Reference for Codex

Source: `Torrevie_Visual_Identity.docx`. This document, combined with `BRAND_FOR_CODEX.md`'s design tokens, governs every visual decision in the codebase.

## Logo

The Torrevie mark reads as a T built into a shield, with a rising arrow forming the shield's open edge. Two asset files are provided in `assets/logo/`:

- `torrevie_logo_color.png` — full color mark (navy T, teal arrow). Use only on light backgrounds. Never place on navy, black, or a dark/busy photographic background; the navy portion loses contrast.
- `torrevie_logo_white.png` — white reversed mark. Use on navy or dark backgrounds.

Wordmark: "Torrevie" set in Inter Bold beside the mark, never the word "Consulting" in the primary lockup. Clear space around the mark equals the height of the shield shape on all sides. Below 60px digital width, drop the wordmark and use the shield mark alone; detail is lost below that size if the wordmark stays attached.

Never: recolor the mark outside navy/teal/black/white, stretch or skew or rotate it, place the full color version on a dark background, add drop shadows or outlines beyond the mark's existing dimensionality.

## Color palette

| Name | Hex | Usage |
| --- | --- | --- |
| Deep Navy | `#162449` | Primary. Backgrounds, headlines, the T portion of the mark, anything needing to feel authoritative. |
| White | `#FFFFFF` | Primary surface. Most of every layout should be white or near-white space. |
| Black | `#0A0A0A` | Monochrome logo version, and print body text where pure navy reads too soft on paper. |
| Turquoise | `#0D9488` | Signature accent. Section dividers, links, active states. The one color allowed to draw the eye. Never a background for large areas of text. |
| Steel Blue | `#4A6FA5` | Secondary accent for data visualization and product-specific color coding when teal is already assigned elsewhere. |
| Light Grey | `#F2F4F7` | Surface color for callout boxes, alternating table rows, section backgrounds needing separation from white. |

Gradients are permitted only in the logo itself, navy to teal. Never introduced into backgrounds, buttons, or text elsewhere in the product.

## Typography

One typeface family everywhere: **Inter**. Bold and Semibold for headings, Regular for body text. Inter Variable loaded as a web font for the product UI. No second typeface family appears anywhere in the application. (Fraunces was tested and rejected for an awkward swash on the letter "J." IBM Plex Mono is used only for tabular/KPI data in print documents, not in the product UI.)

## Iconography

Simple, outlined (not filled), rounded line caps, consistent stroke weight across the full set. Single color: navy on light backgrounds, white on dark. Never multi-color or gradient fills. Subject matter should favor operational and systems themes (workflow, measurement, data flow, connection) over literal object icons where an abstract equivalent exists.

## Graphic language (recurring UI devices)

- **Section dividers:** a short teal underline beneath headings, not a full-width decorative bar.
- **Callout boxes / cards:** light grey (`#F2F4F7`) background, no border, a solid teal or navy left edge for emphasis.
- **Data visualization:** flat bar and line charts in navy, teal, and steel blue. No 3D effects, no drop shadows on data points. Every chart should be legible in grayscale as a baseline test.
- **Background shapes:** large, soft circular forms in navy or teal at low opacity, used sparingly on cover/hero surfaces only (for example, a login screen), never behind body text or dense UI, where they reduce legibility.
- **Comparison layout:** a two-column, light-grey-versus-navy comparison block is a standard recurring device for any before/after or plan-comparison content (for example, comparing subscription plans).

## Photography and illustration (marketing surfaces, not core product UI)

Photography favors real operational environments (factory floors, distribution centers, control rooms) over staged office stock photography. Illustration, where used, is minimal flat style: simple geometric shapes in the brand palette, generous negative space, no gradients, shadows, or 3D rendering beyond the logo itself. This mainly applies to marketing pages and empty-state illustrations, not to dense data-entry screens.

## The test for every screen

Could a Torrevie screen be identified with the logo covered, from color, type, and layout alone? If not, it has drifted from this system.
