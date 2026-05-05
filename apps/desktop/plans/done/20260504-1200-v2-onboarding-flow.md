# V2 Onboarding Flow — Default-to-V2 with Conditional Steps for New and Migrating Users

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: This plan follows conventions from `AGENTS.md` (root) and the ExecPlan template.


## Purpose / Big Picture


Today, the Superset desktop app ships v1 by default; v2 is opt-in via a local Zustand store gated by a PostHog feature flag (`FEATURE_FLAGS.V2_CLOUD`). We want to flip this so new users land in v2 by default, walked through a polished first-run onboarding that connects their auth, model providers, GitHub CLI, macOS permissions, and a starting project. Existing v1 users who migrate to v2 see the same flow but with already-completed steps skipped — they don't re-auth, don't re-add providers if one is already configured, and don't pick a project if they already have one.

After this change, a user can:

- Install Superset desktop fresh (clean local-db + cleared localStorage), open it, and be guided through five steps that end in a working v2 dashboard with a connected provider, the `gh` CLI on PATH, the right macOS permissions granted, and at least one project attached.
- Have an existing v1 install switch to v2 default and find themselves in the same flow, but skipping straight past steps they've already satisfied.

You can see it working by running:

    cd apps/desktop
    bun dev

…then signing out, clearing local-db (`rm -rf ~/Library/Application Support/superset/db.sqlite`), clearing the localStorage entry `v2-local-override-v2`, restarting, and walking through the five steps. Each completed step should persist so a force-close + reopen resumes at the right step.


## Assumptions


These are temporary; each must move to the Decision Log or be removed by completion.

- The `FEATURE_FLAGS.V2_CLOUD` PostHog flag stays as the production gate — we are not removing it; we are flipping the *default user opt-in* under that flag.
- "Existing user" = local-db `projects` table count > 0 OR an authenticated session is already present. We will use both signals.
- The five-step list is fixed at: Auth → Providers → `gh` CLI → macOS permissions → Project selection. No additional steps in v1 of this onboarding.
- Onboarding is a hard gate to the v2 dashboard until the required steps are complete (Auth + Providers + Project for new users; only ungranted required steps for migrating users).
- Required macOS permissions are Full Disk Access and Accessibility (block onboarding advance); Microphone, Apple Events, and Local Network are recommended and skippable. (Confirmed — see D-2.)
- We retain a v1 fallback escape hatch in v2 Settings (toggle that sets `userPreference = "v1"`); no time limit. (Confirmed — see D-1.)
- Migrating users with `projects.count > 0` skip the create-a-project UI but pass through a worktree-adoption screen if we detect git worktrees on disk that aren't yet in the local-db `workspaces` table. If no unadopted worktrees exist, the step auto-advances to `/workspace`. (Confirmed — see D-3, amended D-3a.)
- Users can restart onboarding at any time from v2 Settings; this clears the `completed`/`skipped` flags on the onboarding store and navigates to `/onboarding/auth`. The per-step auto-advance logic naturally fast-forwards through any step the user has already satisfied (e.g., they're still authed, providers still configured), so "restart" effectively replays the conditional flow. (Confirmed — see D-8.)
- Onboarding is a hard redirect: required steps must be completed before any `/workspace*` route is reachable. (Confirmed — see D-4.)
- The existing `useMigrateV1DataToV2` hook continues to run on dashboard layout mount; the onboarding flow does not replace migration, only complements it.


## Open Questions


All initial planning questions have been resolved (see Decision Log entries D-1 through D-4). Future questions raised during implementation should be added here and resolved into the Decision Log.


## Progress


- [x] (2026-05-04 12:00Z) Drafted ExecPlan skeleton, captured current-state references and open questions.
- [x] (2026-05-04 12:15Z) Resolved Open Questions 1–4 (see Decision Log D-1 through D-4).
- [x] (2026-05-04 13:00Z) Milestone 0: GitHub CLI detection spike — `gh` v2.83.0 found at `/opt/homebrew/bin/gh` (Apple Silicon Homebrew). Confirmed need to probe `/opt/homebrew/bin`, `/usr/local/bin`, `/usr/bin`, `/bin` because Finder-launched Electron apps don't inherit the user's interactive shell PATH. Strategy: probe known paths + try inherited PATH. Implementation deferred to M3.
- [x] (2026-05-04 13:30Z) Milestone 1: Onboarding store + route shell. Created Zustand store at `apps/desktop/src/renderer/stores/onboarding/` (persist key `superset-onboarding-v1`), shared `OnboardingProgress` UI, sub-layout, and 6 step page stubs.
- [x] (2026-05-04 13:50Z) M1 hotfix: renamed route group `_authenticated/onboarding/` → `_authenticated/setup/` to resolve a `tsr generate` symbol collision with the existing `_onboarding/` v1 group (D-9-revised). URLs are now `/setup/<step>`.
- [x] (2026-05-04 13:55Z) Settings entry point (slice of M6, D-10): added a "Restart onboarding" row to Settings → Experimental with an AlertDialog confirm. Resets the onboarding store and navigates to `/setup/auth`. Visible only when v2 is enabled. Searchable via new `EXPERIMENTAL_RESTART_ONBOARDING` item id. Typecheck and lint pass.
- [x] (2026-05-04 14:30Z) M2 wiring: Auth step detects existing Better Auth session via `authClient.useSession()` and auto-advances; otherwise shows GitHub/Google sign-in buttons (mirrors existing `/sign-in/page.tsx`). Providers picker auto-advances when either Anthropic or OpenAI is already authenticated (via `chatServiceTrpc.auth.getAnthropic/OpenAIStatus.useQuery()`); otherwise shows the picker.
- [x] (2026-05-04 15:00Z) M2 finished: real OAuth + API key forms.
  - Wrapped setup layout in `ChatServiceProvider` so `chatServiceTrpc` works on every step (was crashing with "did you fail to wrap with TRPC" because the provider was only mounted in `/settings/models`).
  - Claude Code OAuth page integrates `useAnthropicOAuth` and renders `<AnthropicOAuthDialog>`. Connect kicks off OAuth, dialog handles code paste, on success `getAnthropicStatus.authenticated` flips and the page calls `markComplete("providers")` + advances to `/setup/gh-cli`.
  - Codex OAuth page mirrors with `useOpenAIOAuth` + `<OpenAIOAuthDialog>`.
  - New `ApiKeyForm` component (co-located) used by `claude-code/api-key/page.tsx` and `codex/api-key/page.tsx`. Submits via `chatServiceTrpc.auth.setAnthropicApiKey` / `setOpenAIApiKey`, marks complete, advances.
  - Custom Model paths route to `claude-code/custom/page.tsx` and `codex/custom/page.tsx`, both of which redirect to `/settings/models` for the full env-config form. The picker's auto-skip logic detects when configuration completes and advances.
  - Picker's Continue routes by selected method (oauth → OAuth page; api-key → form; custom → settings link).
- [x] (2026-05-04 14:35Z) M3: Added `system.detectGhCli` tRPC procedure at `src/lib/trpc/routers/system.ts` (probes `/opt/homebrew/bin/gh`, `/usr/local/bin/gh`, `/usr/bin/gh`, `/bin/gh`, then PATH). gh-cli step auto-advances if installed; otherwise shows install instructions with Homebrew command, direct-download link, Recheck, and Skip.
- [x] (2026-05-04 14:40Z) M4: Permissions step wired to existing `permissions.getStatus` (FDA, Accessibility, Microphone — Apple Events / Local Network have no detection so render as explainers). Continue gated on FDA + Accessibility being granted. Refetches every 2s.
- [x] (2026-05-04 14:45Z) M5 + 5a: Project step queries `projects.getRecents`; auto-advances if user has any. Otherwise shows two ActionCards linking to existing `/new-project` and `/welcome`. Adopt-worktrees step iterates projects via `utils.workspaces.getExternalWorktrees.fetch()`; auto-advances if total === 0; otherwise shows per-project list and an "Import all" action that calls `useImportAllWorktrees` for each project.
- [x] (2026-05-04 14:50Z) M6 (slice): Hard onboarding gate added in `_authenticated/layout.tsx`. If v2 is active AND required steps (auth, providers, project) aren't all complete AND the route is not under `/setup/*`, redirect to `/setup/<firstIncompleteStep>`. Default-flip + V1 fallback toggle still pending.
- [ ] Milestone 2: Steps 1 & 2 (Auth, Providers).
- [ ] Milestone 3: Step 3 (`gh` CLI detection).
- [ ] Milestone 4: Step 4 (macOS permissions).
- [ ] Milestone 5: Step 5 (Project selection).
- [ ] Milestone 6: Default-flip + dashboard gate.
- [ ] Milestone 7: Phased rollout under `V2_DEFAULT` flag.


## Surprises & Discoveries


- Observation: External worktree adoption is already implemented end-to-end (backend, tRPC, hook, UI banner).
  Evidence: `electronTrpc.workspaces.getExternalWorktrees` query and `electronTrpc.workspaces.importAllWorktrees` mutation exist; backend at `apps/desktop/src/lib/trpc/routers/workspaces/procedures/git-status.ts`; renderer hook `useImportAllWorktrees` at `apps/desktop/src/renderer/react-query/workspaces/useImportAllWorktrees.ts`; UI `ExternalWorktreesBanner` rendered on the dashboard project page and in Project Settings.
  Impact: Step 5a should reuse these APIs verbatim rather than introduce a new `git:list-worktrees` IPC or a new `workspaces.adoptExisting` tRPC. Plan amended (see Decision Log D-3a-revised).

- Observation: Desktop IPC is exclusively tRPC; there is no `apps/desktop/src/shared/ipc-channels.ts` file.
  Evidence: `apps/desktop/AGENTS.md` states: "For Electron interprocess communication, ALWAYS use trpc as defined in `src/lib/trpc`". Glob for `apps/desktop/src/**/ipc*.ts` returned nothing.
  Impact: Step 3 (gh detection) must add a tRPC procedure (e.g., `system.detectGhCli`) not a custom IPC channel. Plan amended (see Decision Log D-7-revised).

- Observation: `gh` is available at `/opt/homebrew/bin/gh` on Apple Silicon Homebrew installs; not in `/usr/bin` or `/usr/local/bin`.
  Evidence: `which gh` → `/opt/homebrew/bin/gh`; `gh --version` → 2.83.0; `ls /usr/bin/gh` → not found.
  Impact: M3 detection must probe `/opt/homebrew/bin`, `/usr/local/bin`, and `/usr/bin` in addition to inspecting PATH. Finder-launched Electron apps on macOS inherit a minimal PATH; we cannot rely on `which gh` from the spawned process alone.

- Observation: `_onboarding/layout.tsx` already exists with a macOS window-drag region.
  Evidence: file at `apps/desktop/src/renderer/routes/_authenticated/_onboarding/layout.tsx` queries `electronTrpc.window.getPlatform` and renders a `drag` region.
  Impact: M1 must extend this layout (preserve drag region), not replace it.


## Decision Log


- D-1: V1 fallback escape hatch lives as a toggle in v2 Settings (no time limit). Rationale: lower-risk rollout — users hitting v2 regressions can self-recover without engineering involvement. The toggle sets `userPreference = "v1"` and reloads the app. Date/Author: 2026-05-04 / planning.
- D-2: Required macOS permissions are Full Disk Access and Accessibility. Recommended (skippable) are Microphone, Apple Events, and Local Network. Rationale: agent functionality fundamentally depends on filesystem reads and keystroke automation; voice/AppleScript/local-network features are surface-area extensions that should not block first-run. Date/Author: 2026-05-04 / planning.
- D-3: Migrating users with `projects.count > 0` skip the *create-a-project* UI of Step 5. Rationale: zero friction for migrators; the existing project list in the dashboard already exposes "create new project" affordances. Date/Author: 2026-05-04 / planning.
- D-3a (amendment, 2026-05-04 12:30Z): Step 5 is split into a sub-step 5a "Adopt worktrees" that runs whenever migrators have projects on disk. For each project in local-db, run `git worktree list --porcelain` against `mainRepoPath`, diff against the `workspaces` table, and if any worktree paths exist on disk but aren't tracked, render an adoption screen ("Found N worktrees not yet added — Add all / Skip / Pick"). If no unadopted worktrees are found across all projects, auto-advance to `/workspace`. Rationale: users requested it directly; the existing migration hook handles v1→v2 data move but not "I created worktrees outside the app". Date/Author: 2026-05-04 / planning.
- D-3a-revised (2026-05-04 13:00Z): The detection and adoption APIs already exist — `electronTrpc.workspaces.getExternalWorktrees.useQuery({ projectId })` returns the unadopted worktree list, and `electronTrpc.workspaces.importAllWorktrees.useMutation()` adopts them. The `useImportAllWorktrees` hook at `apps/desktop/src/renderer/react-query/workspaces/useImportAllWorktrees.ts` wraps the mutation. The `ExternalWorktreesBanner` component already renders the dashboard-side affordance. Step 5a's only new code is an onboarding-flavored page that loops over local-db projects, fetches external worktrees per project, aggregates the count, and (if non-empty) renders an adoption UI built on the same hooks; otherwise auto-advances. Drop the proposed new IPC `git:list-worktrees` and tRPC `workspaces.adoptExisting` — those duplicate existing functionality. Date/Author: 2026-05-04 / discovery during implementation.
- D-8 (added 2026-05-04 12:30Z): Onboarding can be restarted from v2 Settings via a "Restart setup" button. Implementation: clears `completed` and `skipped` records and `completedAt` on the onboarding store (preserves nothing about prior progress), navigates to `/onboarding/auth`, and lets per-step auto-advance handle skipping already-satisfied steps. Rationale: users requested it directly; gives an escape if onboarding state ever desyncs from reality, and lets users intentionally re-walk the flow (e.g., to add a second provider, re-grant a permission, adopt new worktrees). Date/Author: 2026-05-04 / planning.
- D-4: Onboarding gates the v2 dashboard with a hard redirect-on-incomplete. Required steps (Auth, Providers, Project for new users) must be complete; attempts to navigate to `/workspace*` before that redirect to the current onboarding step. Rationale: guarantees configured state, prevents users running into "no provider configured" errors deep in the dashboard. Recommended steps (gh-cli, recommended-permissions) do not gate. Date/Author: 2026-05-04 / planning.
- D-5: Onboarding state lives in Zustand with `devtools` + `persist` middleware, mirroring `useV2LocalOverrideStore`. Rationale: existing pattern in the codebase, no new dependency, persists across reloads. Date/Author: 2026-05-04 / planning.
- D-6: Steps live as nested routes under `_authenticated/_onboarding/`, not as a single switch component. Rationale: deep-linkable, lets the layout render shared progress UI, lines up with existing `_onboarding/welcome` and `_onboarding/new-project`. Date/Author: 2026-05-04 / planning.
- D-7: GitHub CLI detection runs in the main process (Node.js context) and is exposed to the renderer via type-safe IPC. Rationale: renderer cannot spawn child processes; main is the only place `which gh` is reliable. Date/Author: 2026-05-04 / planning.
- D-7-revised (2026-05-04 13:00Z): The "type-safe IPC" mentioned in D-7 must be a tRPC procedure, not a request/response channel in `shared/ipc-channels.ts`. Per `apps/desktop/AGENTS.md`, all desktop IPC uses tRPC. Add `system.detectGhCli` to the existing main-process tRPC router tree under `apps/desktop/src/lib/trpc/routers/`. The renderer calls it via `electronTrpc.system.detectGhCli.useQuery()`. Date/Author: 2026-05-04 / discovery during implementation.
- D-9 (2026-05-04 13:30Z): The new onboarding routes live under `_authenticated/onboarding/` (no underscore prefix on `onboarding`), not `_authenticated/_onboarding/onboarding/`. Rationale: avoids the visually confusing nested `_onboarding/onboarding/` folder structure. The existing `_onboarding/` group keeps its original purpose (v1 welcome / new-project pages — `StartView` host and 3-mode project create). The new flow lives in a sibling `onboarding/` URL segment with its own layout and progress UI. Date/Author: 2026-05-04 / implementation.
- D-9-revised (2026-05-04 13:50Z): Renamed the new route group from `onboarding/` to `setup/`. URLs are now `/setup/<step>` (e.g., `/setup/auth`). Rationale: TanStack Router's `tsr generate` produces TypeScript identifiers from the route path, and `_authenticated/_onboarding/layout.tsx` (existing v1 group) and `_authenticated/onboarding/layout.tsx` (new v2 group) both produced the symbol `AuthenticatedOnboardingLayoutRoute`, causing a duplicate-declaration build error. Renaming the v2 group to `setup/` produces `AuthenticatedSetupLayoutRoute` — no collision. STEP_ROUTES updated accordingly. Date/Author: 2026-05-04 / discovery during `bun dev`.
- D-10 (2026-05-04 13:50Z): The "Restart setup" affordance ships in Settings → Experimental (alongside the existing "Try Superset v2" toggle and "v1 → v2 migration" rerun), not in a new Settings → General section. Rationale: matches existing settings IA — Experimental already houses v2-related controls; adding a new top-level General section for one button would be over-engineering. Visibility gated by `isV2CloudEnabled`. Searchable via new `EXPERIMENTAL_RESTART_ONBOARDING` setting item. Date/Author: 2026-05-04 / implementation.
- D-11 (2026-05-04 14:15Z): Step 2 (providers) UI designed from Figma node `955:2090` in file `faWpXObsgxN4gF5K1chLa1` ("Connect Claude Code"). The visual is Claude-Code-first — centered logo pill + title + subtitle + orange Connect button on a dark `#151110` background — rather than a side-by-side Anthropic/OpenAI choice. This shifts Step 2's spec from "show two provider cards" to "show Claude-first connect; OpenAI handling TBD". Implemented in `setup/providers/page.tsx` with co-located `ClaudeLogo` SVG (path lifted from `assets/app-icons/preset-icons/claude.svg`). Literal hex colors used (`#151110`, `#201e1c`, `#2a2827`, `#eae8e6`, `#a8a5a3`, Claude orange `#D97757`, button `rgba(255,91,0,0.8)`) — these are brand-specific and not currently in the project's semantic token system. OAuth wiring (real Connect behavior) still pending in M2; for now Connect advances to the next step. Open: how to surface OpenAI (separate sub-page? affordance below Connect? skip-and-add-later?). Date/Author: 2026-05-04 / implementation.
- D-11-revised (2026-05-04 14:30Z): Step 2 is now a two-tier flow: a light-themed picker page (`/setup/providers`) → a dark-themed provider-specific OAuth page (`/setup/providers/claude-code` or `/setup/providers/codex`). The picker matches a user-supplied screenshot — title "Connect AI Provider", subtitle "Choose how you'd like to connect your provider.", `<Tabs>` for Claude Code vs Codex, three `ProviderOptionCard`s per tab (Pro/Max + API Key + Custom Model), full-width blue Continue button, Back at bottom. Continue navigates to the appropriate provider sub-page based on tab selection. The dark Claude OAuth page (D-11) was moved verbatim from `setup/providers/page.tsx` to `setup/providers/claude-code/page.tsx` and now uses `ClaudeBrandIcon` (orange-bg `#D97757` + white burst, matching the picker's icon) instead of the cream-bg variant. A parallel `setup/providers/codex/page.tsx` mirrors the dark design for Codex. The connection-method selection (oauth/api-key/custom) is captured in local state but not yet routed — only OAuth flow is wired; api-key and custom paths fall through to the same OAuth page as a placeholder until forms are built. New components: `ClaudeBrandIcon`, `CodexBrandIcon`, `ProviderOptionCard` — all co-located under `setup/providers/components/`. Date/Author: 2026-05-04 / implementation.


## Context and Orientation


### Affected app

`apps/desktop` is the only affected app. v1 and v2 coexist in the same Electron binary; per-user toggles select which renders.

### Related packages

- `packages/local-db` — SQLite schema; `projects` and `workspaces` tables determine "existing user" state.
- `packages/shared` — defines `FEATURE_FLAGS.V2_CLOUD` and will define a new `FEATURE_FLAGS.V2_DEFAULT` for rollout.
- `packages/ui` — shadcn/ui shared components used by onboarding.

### Key files (full paths)

1. `apps/desktop/src/renderer/hooks/useIsV2CloudEnabled.ts` — current v2 gate. ANDs PostHog `V2_CLOUD` with local Zustand `optInV2`. Will change to default-on for new installs.
2. `apps/desktop/src/renderer/stores/v2-local-override.ts` — Zustand store holding `optInV2`. Persisted to localStorage as `v2-local-override-v2`.
3. `apps/desktop/src/renderer/routes/sign-in/page.tsx` — Better Auth sign-in (GitHub + Google buttons).
4. `apps/desktop/src/renderer/lib/auth-client.ts` — Better Auth client wiring.
5. `apps/desktop/src/renderer/routes/_authenticated/layout.tsx` — auth gate. Onboarding gate will live here or in a sibling.
6. `apps/desktop/src/renderer/routes/_authenticated/_onboarding/layout.tsx` — current onboarding route group; we will extend it.
7. `apps/desktop/src/renderer/routes/_authenticated/_onboarding/welcome/page.tsx` — current welcome (StartView host).
8. `apps/desktop/src/renderer/routes/_authenticated/_onboarding/new-project/page.tsx` — 3-mode project create (empty, clone, template).
9. `apps/desktop/src/renderer/screens/main/components/StartView/index.tsx` — open project drag-drop.
10. `apps/desktop/src/renderer/routes/_authenticated/settings/models/components/ModelsSettings/ModelsSettings.tsx` — model provider connection UI (Anthropic, OpenAI; manual key + OAuth).
11. `apps/desktop/src/renderer/routes/_authenticated/settings/permissions/components/PermissionsSettings/PermissionsSettings.tsx` — macOS permissions UI; tRPC procedures `permissions.getStatus`, `requestFullDiskAccess`, `requestAccessibility`, `requestMicrophone`, `requestAppleEvents`, `requestLocalNetwork`.
12. `apps/desktop/src/renderer/routes/_authenticated/hooks/useMigrateV1DataToV2/` — existing v1→v2 migration hook called from `_dashboard/layout.tsx`. Onboarding does not replace this; it complements it.
13. `apps/desktop/src/shared/ipc-channels.ts` — type-safe IPC contract; will add `system:detect-gh-cli`.

### Terms of art (defined inline)

- **v1 / v2**: two coexisting versions of the desktop app shell. v1 is the legacy chat-first UX; v2 is the emerging task/workspace-centric UX. Both ship in the same Electron binary; per-user opt-in selects which renders. See PR #3802 for v2 opt-in baseline.
- **Better Auth**: open-source auth library (`better-auth`) wrapping OAuth flows. We use it client-side via `authClient.useSession()` and tRPC bridges in main process.
- **tRPC procedure**: a typed RPC endpoint defined in `apps/desktop/src/main/lib/trpc/routers/`, callable from renderer via `electronTrpc.<router>.<proc>`.
- **PostHog feature flag**: server-side flag fetched by `useFeatureFlagEnabled(...)`. Used to gate v2 in production.
- **local-db**: SQLite database in the user's home dir, schema in `packages/local-db/src/schema/schema.ts`. Stores `projects`, `workspaces`, etc.
- **IPC channel**: typed bridge between Electron main and renderer processes. Defined in `apps/desktop/src/shared/ipc-channels.ts` as a `request`/`response` interface pair.
- **Onboarding step**: one of five user-visible stages — `auth`, `providers`, `gh-cli`, `permissions`, `project`. Each maps to a route under `_authenticated/_onboarding/`.


## New vs Existing User Matrix


For each step, this is the behavior under each user shape. "Skip" means the step's route auto-redirects to the next step. "Required" means the user cannot advance until satisfied. "Conditional" means evaluated per-user.

Step 1 — Auth. New user (no Better Auth session): required. Existing user with valid session: skip.

Step 2 — Providers. New user: required (must configure ≥1 of Anthropic or OpenAI). Existing user with ≥1 already configured (verified via `auth.getAnthropicStatus` / `auth.getOpenAIStatus`): skip. Existing user with neither: required.

Step 3 — GitHub CLI. All users: conditional. Detect `gh` via new IPC `system:detect-gh-cli`. If installed: skip. If missing: show install instructions (Homebrew + direct download + manual binary) and a "Recheck" button. Allow "Skip for now" (gh is recommended, not required).

Step 4 — macOS permissions. All users: conditional. Show only the permissions whose `getStatus()` is not granted. Required (per D-2): Full Disk Access, Accessibility — block advance until granted. Recommended: Microphone, Apple Events, Local Network — show a "Skip" affordance.

Step 5 — Project. New user: required (3-mode create flow). Existing user with `projects.count = 0`: required (3-mode create flow). Existing user with `projects.count > 0`: skips the create UI but passes through sub-step 5a.

Step 5a — Adopt worktrees (per D-3a). Runs only for users with `projects.count > 0`. For each project, the IPC `git:list-worktrees` returns the on-disk worktrees from `git worktree list --porcelain`. The renderer diffs against the local-db `workspaces` table (filter by `projectId`). If the diff is empty, auto-advance to `/workspace`. Otherwise render a checklist of unadopted worktree paths grouped by project, with "Add all" / "Skip" / per-row toggles, and an "Adopt selected" button. Adoption inserts rows into the `workspaces` table.


## Plan of Work


The work breaks into eight milestones. Milestone 0 is a time-boxed spike to de-risk `gh` detection. Milestones 1–6 build the flow incrementally; each is independently verifiable. Milestone 7 is rollout.


### Milestone 0 — Spike: GitHub CLI detection in main process

This milestone is a 30-minute spike to confirm reliable detection of the `gh` binary across macOS environments where users install via Homebrew, MacPorts, or direct download.

Scope:

- In `apps/desktop/src/main/lib/`, create a one-off scratch file `gh-detect.spike.ts` that uses `execa` to run `which gh` and falls back to checking common install paths: `/opt/homebrew/bin/gh`, `/usr/local/bin/gh`, `/usr/bin/gh`.
- Verify it returns version (`gh --version`) when found.
- Test on a clean shell environment (Electron main does NOT inherit the user's interactive shell PATH on macOS — this is the known risk).

Success criteria:

- Detection works when `gh` is on system PATH.
- Detection works when `gh` is installed via Homebrew but the Electron app was launched from Finder (PATH likely missing `/opt/homebrew/bin`).
- Documented mitigation (e.g., `shell-env` package or explicit path probing) for the Finder-launch case.

Outcome: _(to be filled after spike)_. Delete the spike file before Milestone 3.


### Milestone 1 — Onboarding state machine + route shell

This milestone establishes the per-user onboarding state and the route skeleton with shared progress UI. After this milestone, navigating to `/onboarding` shows a five-step progress indicator and lets you click Next/Back through empty placeholder pages, with state persisting across reloads.

Scope:

- Create `apps/desktop/src/renderer/stores/onboarding/onboardingStore.ts` (Zustand + `devtools` + `persist`, persist key `superset-onboarding-v1`). State shape:

      type OnboardingStep = "auth" | "providers" | "gh-cli" | "permissions" | "project" | "adopt-worktrees";
      interface OnboardingState {
        currentStep: OnboardingStep;
        completed: Record<OnboardingStep, boolean>;
        skipped: Record<OnboardingStep, boolean>; // for gh-cli + recommended permissions
        startedAt: number | null;
        completedAt: number | null;
      }
      interface OnboardingActions {
        markComplete(step: OnboardingStep): void;
        markSkipped(step: OnboardingStep): void;
        goTo(step: OnboardingStep): void;
        next(): void;
        back(): void;
        reset(): void;
      }

- Add a barrel `apps/desktop/src/renderer/stores/onboarding/index.ts`.
- Create routes under `apps/desktop/src/renderer/routes/_authenticated/_onboarding/`:
  - `auth/page.tsx`, `providers/page.tsx`, `gh-cli/page.tsx`, `permissions/page.tsx`, `project/page.tsx` — each a placeholder for now.
  - Update `_onboarding/layout.tsx` to render a shared `OnboardingProgress` component (5 dots/steps) and Back/Next buttons that call store actions. The existing `welcome` and `new-project` routes are NOT removed; they remain reachable for v1 use.
- Create `apps/desktop/src/renderer/routes/_authenticated/_onboarding/components/OnboardingProgress/OnboardingProgress.tsx` per `AGENTS.md` co-location rules.

Acceptance:

    cd apps/desktop
    bun dev
    # Sign in, then navigate to /onboarding/auth manually
    # Click Next through all 5 placeholder pages, observing the progress indicator advance
    # Reload mid-flow; the same step persists


### Milestone 2 — Step 1 (Auth) + Step 2 (Providers)

This milestone wires the first two steps to real auth and provider plumbing. After this milestone, a fresh user can sign in and add an Anthropic or OpenAI key from inside onboarding.

Scope:

- `auth/page.tsx`: render the same Better Auth sign-in UI as `routes/sign-in/page.tsx`, but wrapped in onboarding chrome. On successful session detection (via `authClient.useSession()`), call `markComplete("auth")` and `next()`. If the user already has a session when this route mounts, immediately call `markComplete("auth")` and `next()` (skip).
- `providers/page.tsx`: embed a slimmed-down version of `ModelsSettings` or directly reuse the underlying tRPC calls (`auth.getAnthropicStatus`, `auth.setAnthropicApiKey`, `auth.getOpenAIStatus`, `auth.setOpenAIApiKey`, plus the `AnthropicOAuthDialog` / `OpenAIOAuthDialog`). On mount, if either status returns configured, call `markComplete("providers")` and `next()`. Otherwise, render two cards (Anthropic, OpenAI), each offering "Connect with OAuth" and "Use API key". Enable Next only once at least one is configured.
- Co-locate slim wrappers as `apps/desktop/src/renderer/routes/_authenticated/_onboarding/providers/components/ProviderCard/ProviderCard.tsx`. Do not duplicate the OAuth dialog logic — import the existing components.

Acceptance:

    cd apps/desktop
    bun dev
    # Sign out, restart, sign in via /onboarding/auth → auto-advance to /onboarding/providers
    # Add Anthropic key → Next becomes enabled → click → advance to /onboarding/gh-cli placeholder


### Milestone 3 — Step 3 (gh CLI detection)

Builds on the Milestone 0 spike. After this milestone, the user sees install instructions only if `gh` is missing.

Scope:

- Add a `system` tRPC router in `apps/desktop/src/lib/trpc/routers/system/` exposing a `detectGhCli` query (per D-7-revised). The router must be registered in the root tRPC router for desktop IPC.
- Implementation lives in `apps/desktop/src/lib/trpc/routers/system/procedures/detect-gh-cli.ts`. Probe these paths in order — `/opt/homebrew/bin/gh`, `/usr/local/bin/gh`, `/usr/bin/gh`, `/bin/gh` — plus any `gh` resolvable via the inherited `PATH`. Use `execa` (already a dependency for git tasks) to run `<path> --version`; on success parse the version line and return `{ installed: true, version, path }`. On all failures return `{ installed: false, version: null, path: null }`. Never throw.
- `gh-cli/page.tsx`: on mount, call `electronTrpc.system.detectGhCli.useQuery()`. If `installed`, `markComplete("gh-cli")` and `next()`. If not, render install instructions (3 options: Homebrew `brew install gh`, direct download link, manual). Render a "Recheck" button (re-runs the query via `refetch()`) and a "Skip for now" button (calls `markSkipped("gh-cli")` then `next()`).
- Co-locate UI as `apps/desktop/src/renderer/routes/_authenticated/_onboarding/gh-cli/components/GhInstallGuide/GhInstallGuide.tsx`.

Acceptance:

    cd apps/desktop
    # On a machine with gh installed:
    bun dev
    # Reach /onboarding/gh-cli → it auto-advances
    # On a machine without gh (or by temporarily renaming the binary):
    # Reach /onboarding/gh-cli → instructions render → click Recheck → either advances or stays


### Milestone 4 — Step 4 (macOS permissions)

After this milestone, the user is asked only for permissions they haven't granted, with a clear required-vs-recommended split.

Scope:

- `permissions/page.tsx`: call `electronTrpc.permissions.getStatus.useQuery()` (existing). Filter out `granted: true` permissions. Split the remaining into REQUIRED = [FullDiskAccess, Accessibility] and RECOMMENDED = [Microphone, AppleEvents, LocalNetwork] per D-2.
- For each permission row, reuse the existing pattern: status badge + "Open Settings" button calling the corresponding `request*` tRPC procedure. Refetch every 2s.
- Disable Next until all REQUIRED permissions are granted. RECOMMENDED show a "Skip" link that records `markSkipped("permissions")` only if at least the required ones are granted.
- If on mount all REQUIRED are already granted and no RECOMMENDED are missing, auto-advance.
- If not on macOS (e.g., dev on Linux), `markComplete("permissions")` and skip.

Acceptance:

    cd apps/desktop
    bun dev
    # Reach /onboarding/permissions on a Mac without FDA granted
    # Required FDA row visible; Next disabled; click Open Settings → grant → row badge flips to Granted
    # Required Accessibility likewise; once both granted, Next enables


### Milestone 5 — Step 5 (Project selection) and Step 5a (Worktree adoption)

After this milestone, a new user can select or clone a project from inside onboarding; a migrator without projects creates one; a migrator with projects skips create and is offered any unadopted git worktrees we found on disk.

Scope — Step 5 (`project/page.tsx`):

- Query local-db for `projects` count via existing query plumbing (or expose a thin tRPC procedure if one doesn't exist; first check `apps/desktop/src/main/lib/trpc/routers/` for an existing list/count proc).
- If count > 0: `markComplete("project")` and navigate to `/onboarding/adopt-worktrees`.
- If count = 0: render the existing 3-mode flow (`EmptyRepoTab`, `CloneRepoTab`, `TemplateTab`) inline. On successful project create, `markComplete("project")` and navigate directly to `/workspace` (new users skip 5a — they have no pre-existing worktrees to adopt).
- Do not duplicate the 3-mode components — import them from `_onboarding/new-project/`.

Scope — Step 5a (`adopt-worktrees/page.tsx`) — REUSE existing APIs (per D-3a-revised):

- Fetch the user's projects (existing query, e.g., `electronTrpc.projects.getRecents`).
- For each project, query `electronTrpc.workspaces.getExternalWorktrees.useQuery({ projectId })`. The backend already runs `git worktree list` and diffs against the `workspaces` table — the renderer receives only unadopted worktrees.
- Aggregate across projects. If total count is zero: navigate to `/workspace`.
- Otherwise render a per-project section listing the unadopted worktrees (path + branch). Provide an "Import all" primary action and "Skip for now" secondary. The primary action calls `useImportAllWorktrees().mutateAsync({ projectId })` for each project with unadopted worktrees, then `toast.success` and navigates to `/workspace`.
- Reuse the visual pattern from `ExternalWorktreesBanner` for the per-project list. Do not import the banner itself — it's tied to the dashboard layout.
- Co-locate UI as `apps/desktop/src/renderer/routes/_authenticated/_onboarding/adopt-worktrees/components/WorktreeAdoptionList/WorktreeAdoptionList.tsx`.

Acceptance:

    cd apps/desktop
    # Migrator with existing project + a worktree created outside the app:
    cd <some-project-main-repo>
    git worktree add ../some-feature-branch
    # Restart desktop, walk through onboarding to /onboarding/adopt-worktrees
    # Expected: the new worktree appears in the list with its branch label
    # Click "Adopt selected" → workspaces table now includes the path → /workspace shows it

Acceptance:

    cd apps/desktop
    # On a fresh install (clean local-db):
    bun dev
    # Reach /onboarding/project → 3-mode UI → "Empty" creates repo → lands at /workspace
    # On a machine with existing projects:
    # Reach /onboarding/project → auto-advances (or shows choice per D-3)


### Milestone 6 — Default-flip + dashboard gate

This milestone flips the v2 default and ensures the dashboard is gated by onboarding completion. After this milestone, fresh installs land in v2 + onboarding automatically; users who try to bypass onboarding by typing `/workspace` in the URL bar are redirected back.

Scope:

- Add a new constant `FEATURE_FLAGS.V2_DEFAULT` in `packages/shared/src/constants.ts`.
- Modify `apps/desktop/src/renderer/hooks/useIsV2CloudEnabled.ts`:
  - Read both flags: `V2_CLOUD` (gates feature availability) and `V2_DEFAULT` (gates default-on behavior).
  - In the `useV2LocalOverrideStore`, change semantics: instead of `optInV2: false` default, store `userPreference: "v1" | "v2" | null`. `null` (default for fresh installs) means "follow the V2_DEFAULT flag".
  - Migration: on first read where the legacy `optInV2` is present, write it into `userPreference` and clear it.
  - The hook returns true iff `V2_CLOUD` is on AND ( `userPreference === "v2"` OR ( `userPreference === null` AND `V2_DEFAULT` is on )).
- Add a v1 escape hatch in v2 Settings (per D-1): a toggle in a new `apps/desktop/src/renderer/routes/_authenticated/settings/general/components/V1FallbackToggle/V1FallbackToggle.tsx`. Setting it to "Use v1" writes `userPreference = "v1"` and reloads the app window so the gate re-evaluates.
- Add a "Restart setup" button in v2 Settings (per D-8): a new component `apps/desktop/src/renderer/routes/_authenticated/settings/general/components/RestartOnboardingButton/RestartOnboardingButton.tsx`. On click, opens a confirmation dialog ("This will walk you through setup again. Already-completed steps will be skipped automatically. Continue?"); on confirm, calls `useOnboardingStore.getState().reset()` and navigates to `/onboarding/auth`.
- Add a hard onboarding gate (per D-4) in `apps/desktop/src/renderer/routes/_authenticated/layout.tsx`. Logic: if v2 is active AND required steps (`auth`, `providers`, `project`) are not all complete in `useOnboardingStore`, AND the current route is not under `_onboarding/`, redirect to `/onboarding/<currentStep>`. Recommended steps (`gh-cli`, `permissions`) do not gate.
- The onboarding store exposes a `requiredStepsComplete` selector for the gate to consume.

Acceptance:

    # With V2_DEFAULT off, behavior unchanged for existing users
    # With V2_DEFAULT on for the test user:
    bun dev
    # Fresh install: lands in v2, redirected to /onboarding/auth
    # Try navigating to /workspace mid-flow: redirected back to current step (hard gate)
    #   OR: lands in /workspace with banner offering to resume (soft gate)
    # Existing v1 user with userPreference="v1" stays in v1


### Milestone 7 — Phased rollout under V2_DEFAULT flag

Behind a separate PostHog flag so we can ramp safely without code reverts.

Scope:

- Configure `V2_DEFAULT` PostHog flag with rollout cohorts: internal team (100%) → 5% of new signups → 25% → 100%.
- During each cohort, monitor: sign-in success rate, provider-add success rate, onboarding completion rate, time-to-dashboard, and v1 fallback usage.
- Add a single PostHog event per step transition: `onboarding_step_started` and `onboarding_step_completed` with `{step, user_type: "new" | "migrating"}`.

Acceptance:

- Telemetry visible in PostHog dashboard.
- Rollout can be paused/reverted by toggling `V2_DEFAULT` without a code deploy.


## Concrete Steps


All commands run from the repo root unless noted. Working directory matters.

Initial validation (before any changes):

    bun install
    bun run typecheck
    # Expected: No errors

After Milestones 1–6, run:

    bun run typecheck
    bun run lint
    bun test
    # Expected: All green. CI treats lint warnings as errors per AGENTS.md.

Smoke test the desktop app:

    cd apps/desktop
    bun dev
    # Expected: Electron window opens. Sign out if needed via the app menu.

Reset to "fresh install" state for repeated verification:

    # macOS paths — verify before deleting
    rm -rf "$HOME/Library/Application Support/superset/db.sqlite"
    # In DevTools console of the running Electron renderer:
    localStorage.removeItem("v2-local-override-v2");
    localStorage.removeItem("superset-onboarding-v1");

Then reload the app window.


## Validation and Acceptance


Validation is a 5-scenario regression matrix. All five must pass before shipping.

Scenario A — fresh new user. Clean local-db, cleared localStorage, no Better Auth session.

    bun dev
    # Expected: lands on /onboarding/auth → sign in via Google → auto-advance to /onboarding/providers
    # Add Anthropic key → /onboarding/gh-cli (auto-advance if installed; install instructions if missing)
    # → /onboarding/permissions: required FDA + Accessibility must be granted; recommended Microphone/AppleEvents/LocalNetwork show Skip
    # → /onboarding/project → create empty repo → lands at /workspace
    # Reload — stays in /workspace; onboarding does not re-trigger (completedAt is set).

Scenario B — existing v1 user, fully configured. Has session + provider + projects + permissions, hasn't seen v2.

    # Force userPreference=null in DevTools, V2_DEFAULT=on
    # Expected: lands directly in v2 /workspace (or briefly bounces through onboarding routes that auto-advance).

Scenario C — existing v1 user, partial state. Authed, has projects, no providers, gh missing.

    # Expected: skip auth, skip projects, stop at /onboarding/providers, then /onboarding/gh-cli, then /workspace.

Scenario D — V1 fallback (per D-1). User on v2 toggles "switch to v1" in v2 Settings.

    # Expected: app window reloads in v1; userPreference="v1" persists in localStorage; v2 onboarding does not re-trigger on next launch.

Scenario E — gate enforcement (per D-4 hard redirect). Mid-onboarding, user types /workspace into URL.

    # Expected: redirected back to /onboarding/<currentStep>. Verify by partially completing onboarding, then manually editing the URL bar in DevTools or restarting and trying to deep-link.

Scenario F — worktree adoption (per D-3a). Migrator with one project; create a worktree externally:

    cd <project-main-repo>
    git worktree add ../adopted-feature
    # Restart desktop, walk to /onboarding/adopt-worktrees
    # Expected: ../adopted-feature appears in the list.
    # Click "Adopt selected" → /workspace shows the new workspace in the sidebar.
    # Re-running onboarding (via Settings → Restart setup) and reaching this step
    # should NOT show ../adopted-feature again — it's already adopted.

Scenario G — restart from Settings (per D-8). Authed user with completed onboarding:

    # Open v2 Settings → General → click "Restart setup" → confirm
    # Expected: navigates to /onboarding/auth, which auto-advances since session is valid;
    # /onboarding/providers auto-advances if a provider is still configured;
    # user lands at the first step where state is incomplete (e.g., gh-cli or permissions),
    # or directly back at /workspace if everything is still satisfied.

Run code-quality validation after each milestone:

    bun run typecheck
    bun run lint
    bun test
    # Expected: zero errors, zero warnings (lint warnings == errors per AGENTS.md).


## Idempotence and Recovery


All steps in this plan are idempotent.

- Re-running `bun install` is safe.
- The Zustand store uses `persist`; resetting via `useOnboardingStore.getState().reset()` returns to initial state without breaking the schema.
- The default-flip migration in Milestone 6 (legacy `optInV2` → `userPreference`) is conditional on the legacy field's presence; running it twice is a no-op.
- IPC handler registration is idempotent — register-once on app boot.

If a step fails halfway:

- Onboarding store mid-flow: call `reset()` from DevTools or delete `localStorage["superset-onboarding-v1"]`.
- Provider key add fails: existing tRPC procs are atomic per provider; retry by re-submitting.
- `gh` IPC fails: it returns `{installed: false}` rather than throwing, so the UI gracefully shows install instructions.
- Migration from `optInV2` to `userPreference` fails: keep both fields readable for one release; the new field wins when present.

Rollback path: toggle PostHog `V2_DEFAULT` off. All users return to opt-in v2 behavior. No code revert required.


## Artifacts and Notes


Per `apps/desktop/AGENTS.md`, all desktop IPC uses tRPC routers, not request/response IPC channels. There is no `apps/desktop/src/shared/ipc-channels.ts`.

New tRPC procedure for Step 3 (gh detection) — add to a `system` router under `apps/desktop/src/lib/trpc/routers/`:

    system.detectGhCli: publicProcedure
      .query(async () => {
        // Implementation: probe PATH (after augmenting with /opt/homebrew/bin,
        // /usr/local/bin, /usr/bin, /bin), run `<path>/gh --version` to confirm.
        // Returns:
        //   { installed: true, version: "2.83.0", path: "/opt/homebrew/bin/gh" }
        //   | { installed: false, version: null, path: null }
      });

Step 5a — Adopt worktrees — REUSE existing tRPC, do not add new procedures:

- Query: `electronTrpc.workspaces.getExternalWorktrees.useQuery({ projectId })` (already exists; backend at `apps/desktop/src/lib/trpc/routers/workspaces/procedures/git-status.ts`).
- Mutation: `electronTrpc.workspaces.importAllWorktrees.useMutation()`, wrapped by the existing `useImportAllWorktrees` hook at `apps/desktop/src/renderer/react-query/workspaces/useImportAllWorktrees.ts`.
- Onboarding's only new code is the page component that orchestrates these calls per project and renders the aggregated UI.

Onboarding store types — must exist verbatim in `apps/desktop/src/renderer/stores/onboarding/onboardingStore.ts`:

    export type OnboardingStep =
      | "auth"
      | "providers"
      | "gh-cli"
      | "permissions"
      | "project"
      | "adopt-worktrees";

    export interface OnboardingState {
      currentStep: OnboardingStep;
      completed: Record<OnboardingStep, boolean>;
      skipped: Record<OnboardingStep, boolean>;
      startedAt: number | null;
      completedAt: number | null;
    }

V2 preference store migration shape (Milestone 6) in `apps/desktop/src/renderer/stores/v2-local-override.ts`:

    type V2UserPreference = "v1" | "v2" | null;
    interface V2OverrideState {
      userPreference: V2UserPreference;
      // legacy field, read-only during one release for migration:
      optInV2?: boolean;
    }

PostHog flag names (Milestone 7) — defined in `packages/shared/src/constants.ts`:

    export const FEATURE_FLAGS = {
      V2_CLOUD: "v2_cloud",
      V2_DEFAULT: "v2_default",
      // ...existing flags
    } as const;


## Interfaces and Dependencies


- **Better Auth**: existing dependency; no new install. Used for Step 1 (`authClient.useSession()`).
- **execa**: already used in main process for git tasks; reused for `gh` detection in Milestone 3. No new install.
- **Zustand**: already used; the new store extends the existing pattern (`devtools` + `persist`).
- **shadcn/ui**: existing components from `packages/ui` (Button, Card, Progress, Dialog) for onboarding UI. No new components added there.
- **PostHog**: existing client; reuse `useFeatureFlagEnabled`.

No new top-level dependencies are introduced by this plan. If the `gh`-detection spike (Milestone 0) shows we need a `shell-env` or similar package to find the user's interactive shell PATH on macOS, that decision is recorded in the Decision Log and added in Milestone 3.


## Risks


1. **V1 regression.** Flipping the default could expose v2 bugs to users who would have stayed in v1. Mitigation: separate `V2_DEFAULT` flag, phased rollout, escape hatch (pending D-1).
2. **Onboarding loop.** A bug in the gate logic could trap users in onboarding even after completion. Mitigation: explicit `completedAt` timestamp + "Skip onboarding (debug)" affordance behind a dev flag.
3. **`gh` PATH on macOS Finder launch.** Electron apps launched from Finder don't inherit the user's interactive shell PATH. Mitigation: Milestone 0 spike resolves this; fallback is to probe known install paths.
4. **Existing user with stale provider key.** A user who has `setAnthropicApiKey` set but the key is invalid will be skipped past Step 2 and hit errors later. Mitigation: in Step 2, treat "configured" strictly — if a key is present but `getAnthropicStatus` reports it as invalid, treat as not-configured and prompt to re-add.
5. **Permissions UI loop.** Some macOS permissions require app restart to fully take effect (e.g., FDA). Mitigation: explain this in the UI and treat any `granted: undefined` as "ask again next launch" rather than hard-blocking forever.


## Phased Rollout Summary


- Phase 0: Land all milestones behind `V2_DEFAULT` = off (no user impact).
- Phase 1: Enable `V2_DEFAULT` for internal team (employees only via PostHog cohort).
- Phase 2: 5% of new signups for 1 week. Watch onboarding completion rate, provider-add rate, time-to-dashboard.
- Phase 3: 25% for 1 week.
- Phase 4: 100%.

At any phase, toggling `V2_DEFAULT` off reverts behavior without a code deploy.


## Outcomes & Retrospective


_(empty until completion)_


---


### Revision Log


- 2026-05-04 12:00Z: Initial draft. Five-step onboarding scope, eight milestones, four open questions surfaced for resolution before implementation.
- 2026-05-04 12:15Z: Resolved Open Questions 1–4 with user. Locked decisions D-1 (v1 fallback toggle in v2 Settings, no time limit), D-2 (FDA + Accessibility required; Mic/AppleEvents/LocalNetwork recommended), D-3 (skip Step 5 directly to /workspace for users with existing projects), D-4 (hard redirect gate on required steps). Updated Assumptions, New-vs-Existing matrix, Milestone 4, Milestone 5, Milestone 6, and Validation scenarios to reflect locked decisions. No structural changes to milestones; specifications are now prescriptive rather than conditional.
- 2026-05-04 12:30Z: Added two scope items at user request. (1) D-3a amendment: Step 5 now branches into a sub-step 5a "Adopt worktrees" that scans `git worktree list` for each project and offers to adopt unadopted worktree paths. Added new IPC `git:list-worktrees` and tRPC procedure `workspaces.adoptExisting`. Added "adopt-worktrees" to `OnboardingStep` union. (2) D-8: A "Restart setup" button in v2 Settings clears onboarding completion flags and navigates to `/onboarding/auth`; per-step auto-advance logic skips already-satisfied steps. Updated Milestone 5 (split into 5 + 5a), Milestone 6 (added Settings button), Validation (added scenarios F and G), Interfaces (added IPC and tRPC signatures), and Assumptions.
- 2026-05-04 13:00Z: Implementation discovery pass. Found that worktree adoption is already implemented (`workspaces.getExternalWorktrees`, `workspaces.importAllWorktrees`, `useImportAllWorktrees`, `ExternalWorktreesBanner`) and that desktop IPC is exclusively tRPC (no `shared/ipc-channels.ts`). Added Surprises & Discoveries entries, added Decision Log D-3a-revised and D-7-revised, rewrote Milestone 3 to use a `system.detectGhCli` tRPC procedure, rewrote Milestone 5a to reuse existing APIs instead of inventing `git:list-worktrees`/`workspaces.adoptExisting`, and rewrote the Interfaces section accordingly. Completed M0 spike: confirmed `gh` location and PATH probing strategy.
- 2026-05-04 13:30Z: Completed M1. Created `apps/desktop/src/renderer/stores/onboarding/` (Zustand + persist), `_authenticated/onboarding/layout.tsx` with shared progress UI, `OnboardingProgress` component, and 6 step page stubs. Added D-9 documenting the route group naming (used `_authenticated/onboarding/` rather than nesting under `_authenticated/_onboarding/onboarding/`). Typecheck and lint pass.
