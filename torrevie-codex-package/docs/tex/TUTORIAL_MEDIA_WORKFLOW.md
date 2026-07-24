# TEX Tutorial Media Workflow

The first-run TEX tutorial supports real captured media without changing the tutorial UI logic. Media lives in the customer portal public assets folder and is mapped through a small TypeScript manifest.

## Asset Location

Place production tutorial assets under:

```text
apps/customer-portal/public/tex/tutorial/
```

Use one folder for all TEX tutorial media so cache review, replacement, and visual QA stay simple.

## Recommended Files

Use short looping clips when possible, with a WebP poster fallback:

```text
dashboard.webm
dashboard.webp
whatsapp.webm
whatsapp.webp
review.webm
review.webp
approval.webm
approval.webp
people.webm
people.webp
reports.webm
reports.webp
```

MP4 is also supported, but WebM is preferred for smaller browser-delivered files.

## Capture Rules

- Capture from `app.torrevie.com/en/tex` using a clean demo tenant.
- Use seeded demo data only. Do not capture real customer names, phone numbers, receipt images, emails, tokens, or Stripe details.
- Prefer desktop width around `1440x900` and mobile width around `390x844`.
- Keep each clip between 4 and 8 seconds.
- Show one focused workflow per clip.
- Avoid cursor wandering, browser extensions, notifications, and operating system chrome.
- Confirm the final media reads clearly at mobile size.

## Encoding Targets

- Video: WebM VP9 or MP4 H.264.
- Poster: WebP or PNG.
- Max video size: 2 MB per scene.
- Max poster size: 350 KB per scene.
- Aspect ratio: 16:9.
- No audio track unless a narrated tutorial is explicitly approved.

## Manifest Update

After media files are captured and placed under `public/tex/tutorial`, update:

```text
apps/customer-portal/app/[locale]/tex/tex-tutorial-media.ts
```

Example:

```ts
dashboard: {
  alt: "TEX dashboard showing total spend, pending approvals, and reporting shortcuts",
  videoSrc: "/tex/tutorial/dashboard.webm",
  posterSrc: "/tex/tutorial/dashboard.webp"
}
```

If a scene has no real asset yet, leave `videoSrc` and `imageSrc` empty. The tutorial will keep using the generated guided frame for that scene.

## Verification

Before deployment, run:

```text
pnpm verify:tex:tutorial-media
pnpm --filter @torrevie/customer-portal typecheck:local
pnpm --filter @torrevie/customer-portal build
```

Then open a fresh trial tenant and verify:

- The tutorial appears on first login.
- Media plays inline on desktop and mobile.
- Pause, Back, Next, Close, and Don't show again all work.
- Missing media falls back to generated frames.
- Reduced-motion browser settings do not create distracting motion.
