# LeadRyze Chat Widget

A tiny, dependency-free embeddable AI sales agent — a tenant installs it on
THEIR OWN public website with one `<script>` tag, exactly like Intercom/
Drift/Tidio. An anonymous visitor chats with it; the AI qualifies them and,
once it has a name and a way to reach them, creates a real Lead in LeadRyze
CRM, assigns it round-robin to a sales rep, and existing automations fire.

This is a **fully independent project** — no framework (plain DOM APIs,
rendered inside a Shadow DOM for style isolation), its own tiny esbuild
build step, a sibling to `frontend/`, `backend/`, `ai/`, and
`leadryze-browser-agent/` at the repo root.

## What this talks to

The widget never talks to the AI microservice or MongoDB directly — every
call goes to the backend's new `public/widget` endpoints
(`backend/src/modules/public-widget/`), which resolve the tenant from the
`widgetKey` in the URL, check the request's Origin against that tenant's
configured `allowedDomains`, and only then proxy to the AI service using a
private key the browser never sees. See the project plan for the full
architecture and why the browser must never call the AI service directly.

## Setup

```bash
cd leadryze-widget
npm install
cp .env.example .env      # edit LEADRYZE_API_BASE_URL if your backend isn't on localhost:5000
npm run build              # bundles into dist/loader.js
```

`npm run type-check` runs `tsc --noEmit` on its own.

## Getting a widget on a page

1. Build (`npm run build`), then copy `dist/loader.js` into the backend's
   `public/widget/` folder (served at `/widget/loader.js` — see
   `backend/src/app.ts`'s own static-serving line).
2. In LeadRyze, enable the widget for a tenant and generate a widget key
   (`POST /api/v1/tenants/:id/widget/regenerate-key`), and set
   `widget.allowedDomains` to the real site(s) it'll be embedded on.
3. On the tenant's own website:
   ```html
   <script src="https://api.leadryze.com/widget/loader.js" data-widget-key="wgt_xxx" async></script>
   ```
That's the entire integration — no other markup or JS required. The script
injects its own floating chat bubble into the page on load.

## Local vs. live UAT testing without rebuilding

`LEADRYZE_API_BASE_URL` is baked into `dist/loader.js` at build time — normally
that's fine, but it means switching which backend a *built* bundle talks to
would otherwise require a full rebuild. To avoid that, the built widget also
accepts a per-embed **runtime** override via a `data-api-url` attribute:

```html
<script src="https://api.leadryze.com/widget/loader.js"
        data-widget-key="wgt_xxx"
        data-api-url="http://localhost:5000/api/v1" async></script>
```

This lets you take the exact same already-deployed `loader.js` and point one
test page at your local backend (to try out an in-progress change) while
every real tenant embed — with no `data-api-url` — keeps talking to the live
backend baked in at build time. Omit the attribute and it falls back to the
build-time default. This is the recommended way to do a local-changes ->
deploy -> retest-live UAT loop: build/deploy once, then just flip
`data-api-url` on a scratch test page to compare local vs. live behavior.

## Project layout

```
src/
  config.ts    — API_BASE_URL (build-time constant, see build.js)
  storage.ts   — visitorId (localStorage) / sessionId (sessionStorage) helpers
  ui.ts        — the floating bubble + chat panel, rendered inside a Shadow DOM
  loader.ts    — entry point: reads data-widget-key, fetches config, wires send/receive
```

## What's NOT included in this pass

Voice, WhatsApp/Instagram/Facebook channels, and meeting-booking are
explicitly out of scope for this widget — see the project plan's own
"Explicitly NOT this pass" section. This widget is text-chat only.
