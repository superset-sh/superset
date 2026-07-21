# Remote Version Notices

**Status:** Implemented + CDP-verified end-to-end (screenshots in PR) · **Date:** 2026-07-20 · **Branch:** `version-warning-popup`

A server-driven popup channel so we can warn users on an old desktop version about
the next version (e.g. "vNext has breaking changes, update first") **without shipping
a desktop release**. The desktop ships a dumb renderer; the server owns the content
and the rules as data.

## Goal

- Show a warning/info popup, or a blocking forced-update page, targeted by app version.
- Publish and change these entirely server-side — no desktop release, no code deploy.
- One mechanism for both the soft warning and the existing hard block.

## What already exists (build on this, don't reinvent)

| Piece | Location | State |
|---|---|---|
| `GET /api/desktop/version` → `{ minimumVersion, message }` | `apps/api/src/app/api/desktop/version/route.ts` | Live, but `minimumVersion` is a hardcoded constant |
| `useVersionCheck` (fetch + semver compare, fails open) | `apps/desktop/src/renderer/hooks/useVersionCheck/` | Written, **not mounted anywhere** |
| `UpdateRequiredPage` (full-screen blocker) | `apps/desktop/src/renderer/components/UpdateRequiredPage/` | Written, **not mounted anywhere** |
| Auto-updater (`autoUpdate.install`/`check`) | `apps/desktop/src/main/lib/auto-updater.ts` + tRPC router | Live; CTA reuses this |
| Dismissal store pattern (per-id `dismissedAt` map) | `apps/desktop/src/renderer/stores/v2-setup-card-dismissals/` | Copy this shape |
| Modal + markdown primitives | `@superset/ui` `Dialog`, `MarkdownRenderer`, root `-layout.tsx` (`<Alerter/>`) | Reuse |

The scaffold (`useVersionCheck` + `UpdateRequiredPage`) is essentially this feature
half-built. This design finishes it and makes it data-driven.

## Design

### Data model — one "notice", server-owned

```ts
type Notice = {
  id: string;                    // stable; dismissal is keyed on this. Republish = new id.
  severity: "info" | "warning" | "blocking";
  trigger: "immediate" | "pre-update" | "post-update";
  // immediate   = show on poll/boot
  // pre-update  = intercept the update click with a confirm popover
  // post-update = release announcement: shows only to installs that UPDATED
  //               into the range (previousVersion < minVersion); fresh
  //               installs never see it. Renderer tracks version transitions
  //               in a persisted app-version-history store.

  // targeting
  minVersion?: string;           // show if appVersion >= min
  maxVersion?: string;           // show if appVersion <= max  ← "warn everyone below 2.0.0"
  platforms?: ("darwin" | "win32" | "linux")[];
  channels?: ("stable" | "canary")[];
  startsAt?: string;             // optional schedule window (ISO)
  endsAt?: string;

  // presentation
  title: string;
  body: string;                  // markdown → MarkdownRenderer
  cta?: { label: string; action: "install-update" | "open-url"; url?: string };
  dismissible: boolean;          // blocking ⇒ false
};
```

### Storage — DB table (Drizzle)

New table `desktop_notices` in `packages/db/src/schema/`, columns mirroring the shape
above plus `active`, `createdAt`, `updatedAt`.

Why DB over PostHog / Edge Config for this case:

- **Version range is the primary axis.** DB models `minVersion`/`maxVersion` natively.
  PostHog flag conditions match person properties and compare semver as strings
  (`"10.0.0" < "9.0.0"` is wrong), so you'd end up doing semver client-side anyway.
- **A list of concurrent notices** is N rows / one query. PostHog is one payload per
  flag → N flags.
- **The blocking gate is a safety mechanism** — keep it first-party, not load-bearing
  on an analytics vendor's uptime.
- **Still no deploy to publish:** a row write is a data change, reaches users on next
  poll — same liveness as Edge Config/PostHog.

Reserve PostHog only if we later want to roll out a *non-blocking* notice to a % of
users; that's out of scope now.

### Server

`GET /api/desktop/version` returns:

```jsonc
{
  "minimumVersion": "1.5.0",   // kept for backward compat with old clients
  "message": "...",
  "notices": [ /* active rows within their schedule window */ ]
}
```

A `blocking` notice supersedes the hardcoded `minimumVersion` going forward; the old
field stays so pre-notices clients still get gated.

### Client

Upgrade `useVersionCheck` → `useDesktopNotices`:

1. **Poll**, not just mount — add `refetchInterval` (~30–60 min) + refetch on `online`
   and window focus, so a freshly published notice reaches **already-running** apps,
   not only on next launch.
2. **Filter** notices by `window.App.appVersion` (semver), platform, build channel,
   schedule window, and the dismissal store.
3. **Render the highest-severity applicable notice:**
   - `blocking` → wire up the existing `UpdateRequiredPage` (non-dismissible).
   - `warning` / `info` → `Dialog modal={true}` + `MarkdownRenderer` body + CTA.
     CTA `install-update` calls the existing `autoUpdate.install` / `check`.
4. **Dismissal** → reuse the `v2-setup-card-dismissals` per-`id` persisted store.
   Republishing under a new `id` re-shows. Optional session-only "remind me later".
5. **Mount** in `-layout.tsx` beside `<Alerter/>` (root — shows regardless of auth),
   or the authenticated layout if it should only reach signed-in users.
6. **`pre-update` trigger** → doesn't show on poll. Instead, every UI path that
   calls `autoUpdate.install` (UpdatesPill click, update dialogs) goes through a
   shared `useConfirmedInstall()` wrapper: if an applicable non-dismissed
   `pre-update` notice exists, show a confirmation banner first —
   **Continue update** proceeds with `install`, **Not now** backs out (session-only;
   it re-asks on the next update click unless explicitly dismissed). No matching
   notice → install immediately, zero added friction.

## UI design

Three surfaces, one per severity. All content (title, body, CTA) is server-driven —
the layouts below are fixed; only the copy and accent change.

### 1. `warning` / `info` — centered modal

`Dialog modal={true}`, `~440px` wide, dims + blocks the app behind it. An accent bar
+ icon on the left encodes severity (amber `warning`, blue `info`). Body is markdown.
Primary CTA is filled; secondary is "Dismiss" (only when `dismissible`).

```
        ┌──────────────────────────────────────────────┐
        │ ⚠  Heads up: v2.0 has breaking changes    [x] │
        │                                                │
        │  The next update changes how workspaces sync.  │
        │  Existing local projects keep working, but      │
        │  cloud mirrors will need re-linking once.       │
        │                                                │
        │  • What changes → [link]                        │
        │  • Nothing to do until you update               │
        │                                                │
        │                    ┌──────────┐ ┌────────────┐ │
        │                    │ Dismiss  │ │ Update now │ │
        │                    └──────────┘ └────────────┘ │
        └──────────────────────────────────────────────┘
             ▲ 4px accent bar (amber=warning / blue=info)
```

- `[x]` and "Dismiss" only render when `dismissible: true`; dismissal writes the
  notice `id` to the persisted store.
- "Update now" = CTA `install-update` → `autoUpdate.install` (or `check` if not yet
  downloaded). "open-url" opens `cta.url` externally.
- If body is short and there's no CTA, this can instead reuse the imperative
  `alert()` primitive (it already has a "Don't show again" checkbox).

### 2. `blocking` — full-screen forced update

Wire up the existing `UpdateRequiredPage` — covers the whole window, no dismiss, no
close. Used when this version must not keep running (breaking server change already
shipped). It already subscribes to `autoUpdate` and offers Install / Check / Download
Manually.

```
   ┌────────────────────────────────────────────────────────┐
   │                                                          │
   │                        ⟳  (logo)                         │
   │                                                          │
   │                   Update required                        │
   │                                                          │
   │      This version of Superset is no longer supported.    │
   │      Update to continue — your work is safe.             │
   │                                                          │
   │              ┌───────────────────────────┐              │
   │              │      Install & restart     │              │
   │              └───────────────────────────┘              │
   │                    Download manually →                   │
   │                                                          │
   │                  You're on v1.4.2                        │
   └────────────────────────────────────────────────────────┘
```

### 3. `pre-update` — confirmation banner on update click

Anchored above the UpdatesPill (sidebar footer) where the click happened. Doesn't
interrupt anyone who isn't updating; catches exactly the moment of intent.

```
  │  sidebar                        │
  │  ┌───────────────────────────┐  │
  │  │ ⚠  Before you update       │  │
  │  │                             │  │
  │  │ v2.0 changes workspace     │  │
  │  │ sync — cloud mirrors need  │  │
  │  │ re-linking once. [Details] │  │
  │  │                             │  │
  │  │ ┌─────────┐ ┌────────────┐ │  │
  │  │ │ Not now │ │ Continue ↑ │ │  │
  │  │ └─────────┘ └────────────┘ │  │
  │  └────────────▼──────────────┘  │
  │        ┌────────────┐           │
  │        │ ↑ update    │  ← pill   │
  │        └────────────┘           │
```

- **Continue update** → proceeds with `autoUpdate.install`.
- **Not now** → closes, nothing installs; re-asks on the next update click
  (session-only back-out, not a persisted dismissal).
- Popover, not modal — clicking elsewhere also backs out.

### 4. Non-intrusive variant (optional, for low-severity `info`)

If a full modal feels heavy for pure FYI notices, render `info` as a **dismissible
banner** reusing the `v2-available-banner` pattern (top of the workspace, single
line + inline CTA) instead of a modal. Decision: modal-only to start; add banner mode
later if `info` notices feel intrusive.

```
  ┌────────────────────────────────────────────────────────────┐
  │ ⓘ  v2.1 ships next week with a faster terminal.  Read more →  ⨉ │
  └────────────────────────────────────────────────────────────┘
```

### Visual rules

- Reuse `@superset/ui` tokens — no new colors. Severity accent: amber for `warning`,
  blue/muted for `info`, destructive/red only inside the blocking page's context.
- Icon per severity (`⚠` warning, `ⓘ` info) from the existing icon set.
- Body via `MarkdownRenderer` (links, lists, bold) — keep authored copy short.
- Only one notice on screen at a time: highest severity wins; blocking always
  pre-empts soft.
- Respect `select-text` + the modal-`false` gotcha: pass `modal={true}` explicitly.

## Publishing flow (no release, no deploy)

1. Insert/update a row in `desktop_notices` (seed script now; admin UI is a later
   optional add).
2. Next client poll (≤ interval, or immediately on next launch/`online`) shows it.
3. To re-show after dismissal, publish with a new `id`.

## Build order

1. `desktop_notices` schema in `packages/db/src/schema/` → hand off `drizzle-kit
   generate` to run (per repo rules — never generate/edit migrations directly).
2. Back `/api/desktop/version` with a query over `active` rows.
3. `useDesktopNotices` (polling + filtering + dismissal).
4. `<VersionNotices/>` renderer (Dialog for soft, wire `UpdateRequiredPage` for
   blocking); mount in `-layout.tsx`.
5. Seed script + a couple of example rows for QA.

## Open questions

- **Reach:** root layout (everyone, incl. signed-out) vs authenticated-only?
- **Poll interval:** 30 min vs 60 min — tradeoff of freshness vs request volume.
- **Per-org / per-user targeting** later? DB can join on org; deferred for now.
