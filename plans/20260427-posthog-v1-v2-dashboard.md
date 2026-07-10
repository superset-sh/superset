# PostHog v1 vs v2 usage dashboard (desktop)

## Goal

A PostHog dashboard that answers: how is the desktop migration from v1 to v2 going? Per-user, per-org, over time, and by feature. Scope is `apps/desktop` only — web/admin/mobile do not have a v1/v2 split.

## The core problem

PostHog has no idea which surface fired any event today. The v1/v2 decision lives in `apps/desktop/src/renderer/hooks/useIsV2CloudEnabled.ts`:

```
isV2CloudEnabled = useFeatureFlagEnabled("v2-cloud") && useV2LocalOverrideStore.optInV2
```

Both gates are needed; neither is currently reflected on outgoing events. No super property, no user property, no event property. Every chart we want to build depends on filling that gap first.

## Plan

### 1. Tag every event with the surface — super property

Register `surface` and `surface_source` as PostHog **super properties** so they auto-attach to every `capture()` without touching individual call sites.

- `surface`: `"v1" | "v2"` — the effective state (matches `isV2CloudEnabled`)
- `surface_source`: `"v2-flag-off" | "opted-out" | "opted-in"` — diagnostic. Lets us tell "user could be on v2 but chose not to" from "v2 flag isn't on for them yet"

**Where:** new component `apps/desktop/src/renderer/components/PostHogSurfaceTagger/PostHogSurfaceTagger.tsx`, mounted next to `PostHogUserIdentifier` in the authenticated layout. It uses `useIsV2CloudEnabled` and re-registers super properties whenever the resolved state changes:

```ts
const { isV2CloudEnabled, isRemoteV2Enabled } = useIsV2CloudEnabled();
const optInV2 = useV2LocalOverrideStore((s) => s.optInV2);

useEffect(() => {
  const surface = isV2CloudEnabled ? "v2" : "v1";
  const source = !isRemoteV2Enabled
    ? "v2-flag-off"
    : optInV2
      ? "opted-in"
      : "opted-out";
  posthog.register({ surface, surface_source: source });
}, [isV2CloudEnabled, isRemoteV2Enabled, optInV2]);
```

Super properties persist across the session via localStorage (PostHog default). They re-evaluate on toggle, so a user who opts in mid-session immediately starts firing v2-tagged events.

### 2. Mirror as a user property

Persistent per-user dimensions for cohort building:

- `surface` (latest)
- `surface_first_v2_at` — set once, the first time `isV2CloudEnabled` becomes true
- `surface_ever_v2` — boolean, sticky once true

Done with `posthog.people.set()` / `posthog.people.set_once()` in the same effect as step 1. Enables PostHog cohorts: `v2-only`, `v1-only`, `ever-tried-v2`, `switched-back` (`surface_ever_v2 = true AND surface = v1`).

### 3. Toggle event

Capture `surface_toggled` whenever `setOptInV2` is called, with `{ from, to }`. Single event, fired from the toggle UI. This powers the switchback funnel without scraping super-property changes.

Likely site: wherever `setOptInV2` is invoked in settings UI — grep `setOptInV2(` to confirm. Add `track("surface_toggled", { from, to })` adjacent to the store call.

### 4. Event coverage audit (separate, blocking for some tiles)

The exploration found that v1 has years of organic events while v2 routes (`/v2-workspace/...`) are newer. Before per-feature parity tiles work, audit the v2 surface to ensure parity for the events that already exist on v1:

- workspace opened
- pane opened (already has `panel_type`)
- chat session created/opened/deleted
- file opened from tool

Rule: **one event name across both surfaces, segmented by the `surface` super property.** No `v2_chat_opened` vs `chat_opened`. If v2 has divergent event names today, rename to the v1 name.

This audit produces a small follow-up PR; it isn't part of the wiring above.

## Dashboard tiles (built in PostHog UI)

All tiles filter to `app_name = "desktop"`.

1. **Active users by surface** — DAU + WAU, stacked area, breakdown by `surface`. The headline number.
2. **% of active users on v2** — single line, the migration north star. Trend over time.
3. **Per-feature parity** — for each event in the audit list, events-per-active-user broken down by `surface`. Reveals features missing or slower on v2.
4. **Switchback funnel** — `surface_toggled` from v1→v2 → any v2 event → `surface_toggled` v2→v1. Drop-off rate is the v2 regression signal.
5. **Retention** — D1/D7/D30 retention curves, compared between `surface = v1` and `surface = v2` cohorts.
6. **Surface source breakdown** — pie of `surface_source`. Tells us how much "v1" usage is "we haven't ramped the flag" vs "user opted out". Drives ramp decisions.

## Cohorts to define once

- `v2-only` — `surface = v2` in last 7d, no v1 events in last 7d
- `v1-only` — inverse
- `switched-back` — `surface_ever_v2 = true AND surface = v1` in last 7d
- `never-tried-v2` — `surface_ever_v2 != true`

## Rollout order

1. PR 1: super property + user property + toggle event (steps 1–3). Low risk, no UI changes. Land first; data starts flowing.
2. Wait ~7 days for backfill so dashboards have meaningful windows.
3. PR 2: v2 event coverage audit + renames (step 4).
4. Build dashboard tiles in PostHog UI (no code).

## Out of scope

- Backfilling historical events with `surface` — not possible, accept the cutover date as the dashboard start.
- Web/admin/mobile instrumentation — no v1/v2 split there.
- Org-level rollups (% of orgs on v2, etc.) — would need `posthog.group("organization", ...)`, deliberately out of scope here.
