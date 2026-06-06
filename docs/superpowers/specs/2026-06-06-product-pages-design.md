# TrackPilot & Ylate product pages — design

Date: 2026-06-06

## Goal
Add two SEO-optimized, docs-style marketing pages for the user's own products and
wire them into the existing `(marketing)` section with shared nav.

- **TrackPilot** — `trackpilot` (npm v0.5.0, MIT, Node 20+). AI-friendly CLI + ESM
  library for YouTrack Cloud. Repo: https://github.com/javadtavakoli/trackpilot ,
  npm: https://www.npmjs.com/package/trackpilot
- **Ylate** — YouTrack time tracker. VS Code extension `JavadTavakoli.ylate` (v1.2.0)
  + Tauri desktop app (v0.2.0). Repo: https://github.com/javadtavakoli/vscode-yt-timetracker

## Accuracy constraints (most important)
- **No fabricated MCP / native Claude integration.** Verified: `trackpilot` has no MCP
  entrypoint (`bin` is just `trackpilot`). Frame "use with Claude" honestly as:
  (a) point a coding agent (Claude Code) at the CLI and run the documented
  read→create→command→release loop (JSON output + validate-before-write), and
  (b) wrap the `createApi` library methods as Claude API tool-use tools.
- **Ylate namespaces stay distinct**: settings are `youtrackTracker.baseUrl/.token/.projectId/.myIssuesOnly`;
  commands are `ylate.configure/.refreshTasks/.pauseResume/.stopTimer/.startCustom/.showPanel/.statusBarMenu`.
- **Two Ylate version streams**: desktop app = OS download grid (v0.2.0); VS Code ext = marketplace/vsix (v1.2.0).
- TrackPilot CLI run forms requested by user (`npx`, `pnpm dlx`, `yarn dlx`, `npm i -g`)
  are synthesized; `yarn dlx` is Berry, distinct from classic `yarn global add`.

## Routes & files
- New: `app/(marketing)/trackpilot/page.tsx`, `app/(marketing)/ylate/page.tsx`
- New: `app/(marketing)/trackpilot/opengraph-image.tsx`, `app/(marketing)/ylate/opengraph-image.tsx`
- Edit: `app/(marketing)/layout.tsx` (shared header nav: Home · TrackPilot · Ylate)
- Edit: `app/(marketing)/page.tsx` (feature cards linking to both)
- Edit: `app/sitemap.ts` (add /trackpilot, /ylate)
- New shared components (client, render-all-then-toggle so crawlers see everything):
  `components/marketing/code-block.tsx`, `command-tabs.tsx`, `os-downloads.tsx`,
  plus small server helpers for sections/JSON-LD.

## SEO
- Per-page `metadata`: title, description, canonical (`env.NEXT_PUBLIC_SITE_URL` based), OG, Twitter.
- Per-route `opengraph-image.tsx` via `next/og` `ImageResponse` (also fixes broken `/og.png`).
- `SoftwareApplication` + `FAQPage` JSON-LD via `<script type="application/ld+json">`.
- Sitemap updated; robots untouched (new paths already allowed; only /app,/api,/login disallowed).

## Interactivity (progressive enhancement)
- All package-manager variants and all OS downloads rendered in server HTML.
- Client JS only toggles the active PM tab and highlights the visitor's OS (`navigator.userAgent`).

## Download links (Ylate desktop v0.2.0)
Direct, version-labeled, + prominent "all releases" link to `/releases/latest`:
- Windows: `Ylate_0.2.0_x64-setup.exe`, `Ylate_0.2.0_x64_en-US.msi`
- macOS: `Ylate_0.2.0_universal.dmg`, `Ylate_universal.app.tar.gz`
- Linux: `Ylate_0.2.0_amd64.AppImage`, `Ylate_0.2.0_amd64.deb`, `Ylate-0.2.0-1.x86_64.rpm`
Base: `https://github.com/javadtavakoli/vscode-yt-timetracker/releases/download/desktop-v0.2.0/<asset>`

## Verify
`pnpm lint` and `pnpm build` pass before declaring done.
