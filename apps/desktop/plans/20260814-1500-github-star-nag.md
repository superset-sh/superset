# Prompt Superset users to star superset-sh/superset on GitHub, at good moments

This ExecPlan is a living document. The sections `Progress`, `Surprises & Discoveries`, `Decision Log`, and `Outcomes & Retrospective` must be kept up to date as work proceeds.

Reference: this plan follows the conventions in the root `AGENTS.md`, `apps/desktop/AGENTS.md`, and the ExecPlan template (`.agents/skills/create-plan/SKILL.md` in this repo, invoked as the `create-plan` skill).

## Purpose / Big Picture

Today, nothing in the Superset desktop app ever asks a user to star `superset-sh/superset` on GitHub. The only "star us" UI in the whole monorepo lives on the public marketing site (`apps/marketing`), which desktop-app users never see. After this change, a desktop user who is clearly getting value from the app — they just finished onboarding, or they've created several workspaces, or they're sitting on the empty "no pane open" screen inside a workspace, or they just want to proactively support the project from Settings — will see a low-pressure, easily-dismissed prompt to star the repo, with a working one-click "Star on GitHub" action when possible and a "open the repo page in my browser" fallback otherwise. Starring from any one of those places permanently silences the prompt everywhere else. You can see it working by: (1) finishing the onboarding wizard and observing a toast, (2) opening a workspace and clicking away all its panes/tabs to reach the empty state, where a small "Star on GitHub" pill appears near the bottom of the screen, (3) opening Settings → General and finding a "Star Superset on GitHub" row, and (4) creating enough workspaces to cross a threshold and observing a dismissible card appear, which does not reappear for several days if dismissed and requires progressively more usage to reappear after each dismissal.

This is a deliberate, scoped-down adaptation of a similar feature already shipped in a sibling Electron app, internally referred to during design as "orca" (a different codebase entirely, not part of this repo, at `/Users/avipeltz/Developer/superset/orca/orca` — mentioned here only as background; nothing in that path is read or referenced once implementation starts). Orca's version has three trigger sources (a usage-count threshold, a "the user was just clicked away right after an agent finished a task" moment, and onboarding completion) and three UI surfaces (a settings row, a persistent card, a toast), plus a fourth ambient entry point on its empty/landing screen. This plan ports the settings row, the card, the toast, and the empty-state pill, but deliberately drops the "agent just finished a task" trigger — see Decision Log for why.

## Assumptions

- The target repository to star is `superset-sh/superset` (confirmed via `git remote -v` in this checkout: `origin` points at `https://github.com/superset-sh/superset.git`).
- Starring will be performed via the user's own locally-installed, locally-authenticated GitHub CLI (`gh`), the same way this repo already shells out to `gh` for other GitHub operations (see Context and Orientation). There is no in-app GitHub OAuth token this desktop app already holds that could star a repo on the user's behalf without `gh`; building one is out of scope for this plan.
- A meaningful fraction of desktop users may not have `gh` installed or authenticated. Every surface must degrade gracefully to "open the repo's GitHub page in the default browser" in that case, exactly like the settings/empty-state entry points already need to for other reasons.
- "Workspace" (a git worktree tied to a project, created via the `workspaces.create` tRPC mutation) is this app's closest analog to orca's "agent spawned" unit — it is the best available proxy for "this user is actively using the product," acknowledged as an imperfect analog (see Decision Log).
- This plan does not require a database migration. All new persisted state is either renderer `localStorage` (via a Zustand `persist` store, the repo's existing convention for this category of dismissible-nag state) or computed on demand by shelling out to `gh`. No new tables or columns are added to `packages/db` or `packages/local-db`.

## Open Questions

- What should the initial workspace-count threshold be before the first threshold-card nag appears? This plan proposes **5** as a placeholder (see Decision Log for the reasoning versus orca's 35), but the real number is a product decision about how much usage should "earn" the ask, not something derivable from code. Affects: Plan of Work Milestone 2, Interfaces and Dependencies.
- Should the persistent threshold card be feature-flag-gated the way `HiringBanner` is (via `FEATURE_FLAGS` in `packages/shared/src/constants.ts`, checked with `useFeatureFlagEnabled`), so it can be killed instantly without a release if it turns out to be annoying? This plan recommends yes, for the threshold card only — resolved during implementation (see Decision Log): the toast is a single one-time event rather than a recurring nag, so it and the low-friction settings row / empty-state pill are not flag-gated and are always available. Affects: Plan of Work Milestone 3, Interfaces and Dependencies.
- Exactly which tRPC mutation does the v2 ("cloud") new-workspace flow call to create a workspace? Milestone 1's research task confirmed that `apps/desktop/src/renderer/react-query/workspaces/useCreateWorkspace.ts` (wrapping `electronTrpc.workspaces.create`) is the single shared creation path for the v1 flow (`NewWorkspaceModal`) and several cross-cutting flows (tasks, project pages), but it is **not** used by `apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/NewWorkspaceScreen/NewWorkspaceScreen.tsx`, which is the v2 flow. Given the ongoing v1/v2 coexistence in this app (both surfaces are live in production simultaneously), the workspace-created counter must be incremented from **both** paths or it will systematically undercount v2 users. Milestone 1 includes a research step to pin this down before writing code. Affects: Plan of Work Milestone 2, Interfaces and Dependencies.
- Exact UI copy (card/toast headline and body text, button labels) is drafted below as a starting point but has not been reviewed by anyone doing product/design work on this app; treat it as a placeholder pending a real copy pass.
- Should the empty-state pill and the persistent threshold card ever both be visible at once (e.g., a user sitting on the empty-pane screen who has also just crossed the threshold)? This plan's default (see Plan of Work Milestone 3) is that the empty-state pill is unconditional (shows whenever not yet starred/completed) and the threshold card additionally respects cooldown/dismissal, so both could in principle render at once. If that reads as excessive in practice, the fix is to suppress the threshold card while the empty-state pill is visible, which the shared "maybeShow" gate proposed in Milestone 2 is structured to make easy to add later.

## Progress

- [x] (2026-08-14) Milestone 1: `apps/desktop/src/lib/trpc/routers/github-star/index.ts` (`checkGithubStarred`/`starGithubRepo`, exported for testing, wrapped by `createGithubStarRouter()`), registered as `githubStar` on the root router. 7 unit tests in `index.test.ts` covering 200/204/404/ENOENT/unrecognized-status cases, all passing. Also resolved the v2 workspace-creation call-site research task (see Decision Log/Surprises) — it is `useWorkspaceCreates.ts`'s `submit()`, not `useCreateWorkspace.ts`.
- [x] (2026-08-14) Milestone 2: `apps/desktop/src/renderer/stores/star-nag/store.ts` (Zustand + persist, key `star-nag-v1`, registered in `persisted-key-registry.test-data.ts`), 7 unit tests in `store.test.ts`. `alreadyExists?: boolean` threaded through `useWorkspaceCreates.ts`'s `CreateOutcome`/`createViaEnqueue` so the v2 path can tell genuinely-new worktree creates from reopens; `recordWorkspaceCreated()` wired into both `useCreateWorkspace.ts` (v1, guarded by `!data.wasExisting`) and `useWorkspaceCreates.ts` (v2, guarded by `result.alreadyExists === false && result.workspace.projectId !== null` — session creates are never counted, since `createSession` has no alreadyExists signal to guard on).
- [x] (2026-08-14) Milestone 3: all four surfaces built and wired — `useGithubStarAction` shared hook (`apps/desktop/src/renderer/hooks/useGithubStarAction/`), `GithubStarRow` in Settings → General (`.../settings/behavior/components/BehaviorSettings/components/GithubStarRow/`), `GitHubStarPill` mounted in both `EmptyTabView.tsx` (v1) and `WorkspaceEmptyState.tsx` (v2), `StarNagCard` (modeled on `HiringBanner`, gated by new `FEATURE_FLAGS.STAR_NAG_CARD`) mounted in both `WorkspaceSidebar.tsx` and `DashboardSidebar.tsx`, `StarNagToast`/`showStarNagOnboardingToast()` wired into `onboarding/project/page.tsx`'s `finish()` right after the `completeOnboarding` try/catch.
- [x] (2026-08-14) Milestone 4: `star_nag_shown`/`star_nag_starred`/`star_nag_opened_web`/`star_nag_dismissed` telemetry added to all four surfaces via `track()`. `bun run lint:fix` / `bun run lint` / `apps/desktop` `bun run typecheck` / `bun test` (2679 tests, whole `apps/desktop` suite) all clean.
- [x] (2026-08-14) Manual/CDP verification: booted the full dev stack for this workspace (`RENDERER_REMOTE_DEBUG_PORT=9231 bun dev`, plus starting the stopped `superset-electric-political-magnosaurus` docker container) and drove the real running app against a genuine signed-in session. All four surfaces confirmed rendering and functioning via real UI interaction (see Surprises & Discoveries for the one bug this caught and fixed, and for which parts were verified how). Dev stack torn down afterward — nothing was left running that wasn't running before.
- [x] (2026-08-14) PR #6469 opened; growth experiment recorded in Notion (Experiment Log) and a PostHog funnel insight created for the `star_nag_*` events.
- [x] (2026-08-14) Addressed CodeRabbit's automated review on PR #6469: hardened the `gh` subprocess call with a 10s timeout (`GH_CALL_TIMEOUT_MS`, commit `27006a74a`'s `completed`-override fix already covered the stale "pill doesn't respect completed" finding — see Decision Log), re-evaluate `StarNagCard`'s cooldown when it actually expires instead of only on the next unrelated store write, guard `GitHubStarPill`'s `star_nag_shown` telemetry against double-firing on a failed star attempt, gave the onboarding toast a finite 30s duration with an `onAutoClose` soft-dismiss (previously stayed open forever and never entered cooldown), co-located `StarNagToast` under `onboarding/project/components/` per this repo's co-location convention instead of the shared `components/` directory, added `prefers-reduced-motion` handling to `AnimatedStarButton`'s tilt/hover/confetti/pop animations, exported a shared `STAR_SUCCESS_ANIMATION_MS` constant (replacing three separately hardcoded `1700`s), simplified `useSpring(useMotionValue(0), ...)` to `useSpring(0, ...)`, and asserted the exact `gh` CLI args (including the new timeout option) in `github-star/index.test.ts`. Full `apps/desktop` suite (2735 tests), typecheck, and lint all clean; pushed as commit `a40f2fd3a`.
- [x] (2026-08-14) Live CDP verification of the fix round: booted this workspace's dev stack again (a genuinely pre-existing, unrelated stale migration — `auth.users` was missing the `deletion_requested_at` column added by a later `main` merge — was blocking sign-in entirely and had to be fixed first with `bun run db:migrate`; see Surprises & Discoveries). Confirmed live: the toast renders correctly, the hover-preview gold star color works, `prefers-reduced-motion: reduce` correctly suppresses the tilt/confetti/pop animations while the button remains fully clickable and the real star mutation still succeeds, and — three separate times, including once via a genuine background refetch racing a query-cache override — that an already-starred account never sees the toast. The sidebar card and empty-state pill were not independently re-screenshotted this round (this workspace's local host-service relay is stuck failing JWT auth, a separate pre-existing issue, which blocked creating a real workspace to mount them in); both share the same `AnimatedStarButton` verified above, and their own review-round fixes (cooldown re-eval, double-fire guard) are logic changes already covered by passing unit tests.
- [x] (2026-08-14) A second, smaller round of reply-driven fixes: added a module-level `shownThisSession` guard to `showStarNagOnboardingToast()` so a rapid double-click on the onboarding create/clone/open button can't stack two toasts before the route navigates away (the finish-then-navigate guard alone only prevents re-entry, not a same-tick double-fire); confirmed the "Settings row should use the shared action" finding was already stale (`GithubStarRow.tsx` already consumes `useGithubStarAction`, inheriting the `completed`-override fix from commit `27006a74a`); confirmed `star-nag-v1` not being scoped per signed-in user, while a real edge case on a shared device, matches this repo's existing convention for this whole category of store (`hiring-banner-v1` has the identical gap and `useSignOut` clears neither) — fixing it here alone would be inconsistent and is out of scope for this PR; and brought the plan's own Milestone 3c/3d prose and the feature-flag Open Question back in sync with the shipped behavior (the toast is not flag-gated, the card's cooldown needs the timer re-check, the toast sample now shows the real finite-duration/`onAutoClose` shape instead of the stale `duration: Infinity` sketch).

- [x] (2026-08-14) Milestone 3e: `dev.previewStarNagToast` and `dev.resetStarNagState` command-palette entries added; `StarNagToast` moved back to the shared `apps/desktop/src/renderer/components/StarNagToast/` directory now that it has a second real caller. `bun run typecheck` / `bun run lint` / full `apps/desktop` test suite (2735 tests) all clean.

Nothing outstanding on the implementation side — the four Open Questions below (threshold value, settings-page location, v2 call site, copy) were resolved enough to ship, and the CodeRabbit review round above is fixed, validated, and pushed. Two product/design decisions remain genuinely open and are not implementation blockers: the initial threshold (5 workspaces) is a placeholder pending real usage-data review, and all UI copy needs a real copy pass — both are tracked as a post-implementation checklist in Outcomes & Retrospective below, not resolved by this PR.

## Surprises & Discoveries

- **A user who already starred the repo outside the app was not being suppressed — a real bug caught by live CDP testing, now fixed.** The original `useGithubStarAction` implementation only called `useStarNagStore.markCompleted()` inside the *fresh star action's* success callback, never when the initial `checkStarred` query itself resolved `"starred"`. Live-testing against the developer's real signed-in session (whose GitHub account already had `superset-sh/superset` starred) surfaced this immediately: the Settings row correctly showed "Starred — thank you!", but `star-nag-v1` in `localStorage` still showed `completed: false`, meaning the threshold card and onboarding toast would have kept nagging an already-starred user forever. Fixed by adding a `useEffect` in `useGithubStarAction.ts` that calls `markCompleted()` whenever the live query result is `"starred"`, regardless of how it got that way — mirroring orca's own `maybeShow()` behavior of treating "found already starred" as equivalent to "just starred." Verified fixed by rechecking `localStorage.getItem("star-nag-v1")` after the fix landed and the dev app hot-reloaded: `completed: true`.
- **v2 workspace creation does not go through the same tRPC path as v1, and its "was this actually new" signal was silently being dropped before this change.** Milestone 1's research task confirmed `useWorkspaceCreates.ts`'s `submit()` (not `useCreateWorkspace.ts`) is the v2 chokepoint, backed by `host-service`'s `workspaces.create`/`createEnqueued`/`createSession` procedures over a separate client, not `electronTrpc`. The backend already returns `alreadyExists: boolean` on the non-session paths, but the renderer's `CreateOutcome`/`createViaEnqueue` discarded it before this change — it had to be threaded through as a new optional field before the star-nag counter could safely distinguish a new worktree from a reopened one. `createSession` (project-less sessions) has no such signal at all, so session creates are deliberately never counted toward the threshold.
- **Live verification required booting a genuinely idle dev environment**, not just re-reading a shared fixture. This workspace's local docker-based dev stack (`superset-electric-political-magnosaurus`) had been stopped for several days and needed `docker start`; the first `bun dev` launch also had to be restarted once `RENDERER_REMOTE_DEBUG_PORT` was actually set, since it hadn't been passed on the first boot. Once up, CDP verification worked exactly per `apps/desktop/AGENTS.md`'s guidance: real UI clicks (a raw `location.hash` assignment did **not** trigger TanStack Router's hash history — only an actual `<a>`/button `.click()` did), `Runtime.evaluate` with dynamic `import()` of renderer source files (not `Network.*` sniffing), and screenshots to visually confirm what the text-only checks implied. The `StarNagCard` (gated by the new `FEATURE_FLAGS.STAR_NAG_CARD` PostHog flag, which is not turned on anywhere yet) was verified by locally overriding the flag via `posthog.featureFlags.overrideFeatureFlags(...)` — the standard PostHog JS SDK mechanism for local QA — rather than by asking anyone to flip a real flag. All four surfaces (Settings row, the v2 empty-state `GitHubStarPill`, the sidebar `StarNagCard` including its dismiss/cooldown-doubling behavior, and the onboarding `StarNagToast` including its auto-dismiss-once-already-starred behavior) were confirmed rendering and behaving correctly through real interaction; the star action itself was exercised for real against the developer's actual `gh` CLI (safe and idempotent, since the repo was already starred). The v1 `EmptyTabView` mount point uses the identical shared `GitHubStarPill` component already verified in its v2 mount, but this specific signed-in test account's reachable workspaces all resolved to v2 routes, so the v1 mount point itself was not independently re-screenshotted — only typechecked/linted, like the rest of the v1 wiring (`useCreateWorkspace.ts`, `WorkspaceSidebar.tsx`).
- **One of CodeRabbit's PR #6469 findings was already stale by the time the review ran.** It flagged `GitHubStarPill`/`StarNagCard` for not treating an already-starred repo as permanently suppressed — the exact bug described above — but that had already been fixed by commit `27006a74a` (the `completed`-flag override in `useGithubStarAction.ts`) before the review pass completed. Per this repo's guidance to treat review-tool findings as untrusted and verify against current code rather than blindly applying suggested diffs, this was confirmed stale by re-reading the current `useGithubStarAction.ts` and replied to on the PR thread pointing at that commit, instead of re-applying a redundant fix.
- **Workspace rows are hard-deleted, so a live count of "workspaces" is not a valid proxy for lifetime usage.** While researching how to count "workspaces created" for the threshold trigger, `packages/shared/src/constants.ts` (around the `FEATURE_FLAGS.HIRING_BANNER` entry) was found to contain this exact warning, written by whoever built that comparable feature: the "We're Hiring" banner targets a **static PostHog cohort** of "users who have created 10+ workspaces all-time," specifically *because* "workspace rows are hard-deleted, so a lifetime count can't be derived from the DB." This directly ruled out an initial design idea (deriving the threshold-trigger's count from a live TanStack DB / Electric query of the user's current workspaces, e.g. `useHostWorkspaces` or `useAccessibleV2Workspaces`) — a user who created 10 workspaces and later deleted 6 of them would show a live count of 4, silently resetting their progress toward the nag threshold every time they clean up old workspaces. The design in this plan instead maintains its own monotonically-increasing counter in `localStorage`, incremented once at the moment each create-workspace mutation succeeds, which is immune to later deletions. This is the single most important design constraint this plan is built around; if it changes (e.g., workspace history becomes soft-deleted or otherwise queryable later), the counting approach in Milestone 2 should be revisited.

## Decision Log

- Decision: Do not port orca's "agent value moment" trigger (a prompt shown right after a coding agent finishes a turn of work, timed to a moment when the user has stopped typing).
  Rationale: in orca, this trigger depends on an `AgentDetector` that parses OSC terminal-title escape sequences streamed through every PTY to detect when an agent CLI's title text transitions into a "done"/idle state. This plan's research did not find an equivalent "per-terminal agent completion" signal already wired up in this codebase (Superset does have terminal/PTY infrastructure and agent lifecycle events used for notifications — see `apps/desktop/src/lib/trpc/routers/notifications.ts` and `NOTIFICATION_EVENTS.AGENT_LIFECYCLE` — which is a promising building block, but confirming it is precise and general enough to reuse for this purpose, across both terminal-based and non-terminal agent surfaces, is its own investigation). Building or verifying that detection is a substantial side effort on its own and not needed to deliver the rest of this feature. If this trigger is wanted later, it should be scoped as a follow-up ExecPlan that starts by investigating whether `AGENT_LIFECYCLE` notification events (already emitted today) are a sufficient signal, rather than building new OSC-parsing infrastructure from scratch.
  Date/Author: 2026-08-14, drafted during planning.

- Decision: Persist all dismiss/cooldown/threshold/completed state for this feature in a renderer-side Zustand store backed by `localStorage`, not in a main-process store or a new SQLite table.
  Rationale: this is the repo's established pattern for exactly this category of state — see `apps/desktop/src/renderer/stores/hiring-banner/store.ts` (a single persisted `dismissed: boolean`) and `apps/desktop/src/renderer/stores/createDismissalsStore/createDismissalsStore.ts` (a factory for "timestamped id-keyed dismissals," already used twice). It requires no Drizzle migration (which `AGENTS.md` says an agent must never write by hand, only request via `drizzle-kit generate` after editing a schema file) and no new main-process persistence module. `apps/desktop/AGENTS.md`'s localStorage policy requires every new persisted key to answer "what bounds it, who deletes it, what happens when the feature dies" — this plan's answers are: bounded (a handful of scalar fields, not a per-entity collection), nothing needs to actively delete it (it is a fixed-size singleton like `hiring-banner-v1`), and if the feature is ever removed, its key must be added to `DEAD_KEYS` in the same PR that removes the writer, per that policy.
  Date/Author: 2026-08-14, drafted during planning.

- Decision: Do not scope the `star-nag-v1` `localStorage` key to the signed-in user, despite a shared-device profile letting a second user inherit the first user's `completed`/workspace-count state.
  Rationale: this repo's whole category of simple single-scalar dismissal/engagement stores already works this way — `hiring-banner-v1` (`apps/desktop/src/renderer/stores/hiring-banner/store.ts`) is the direct precedent, and `useSignOut` (`apps/desktop/src/renderer/hooks/useSignOut/useSignOut.ts`) clears neither key today. Scoping only the new store would be inconsistent with the established pattern and would still leave the older store with the identical gap; fixing it repo-wide is a separate, out-of-scope cleanup, not something this PR should do unilaterally. Raised by CodeRabbit's review of PR #6469; verified against current code before declining.
  Date/Author: 2026-08-14, during PR review response.

- Decision: Count "workspaces created" as the threshold-trigger's usage metric (rather than, e.g., app launches, or terminal/agent sessions started), starting the threshold at a placeholder value of 5.
  Rationale: it's the closest available analog to orca's "agents spawned" that this app can cheaply and reliably instrument (see Surprises & Discoveries for why it must be a monotonic counter, not a live count). Orca's initial threshold (35) was tuned for a much higher-frequency action (spawning any agent turn); workspace creation is a coarser, less frequent action, so 35 would likely be far too high here. 5 is a placeholder starting point, not a researched number — flagged in Open Questions for product review.
  Date/Author: 2026-08-14, drafted during planning.

## Outcomes & Retrospective

Implemented end-to-end and verified live in the running app (see Progress and Surprises & Discoveries). All four surfaces from the Purpose section work as designed: a Settings row, an empty-state pill on both v1 and v2, a dismissible sidebar card with backoff, and a one-time post-onboarding toast — all funneling through one shared `useGithubStarAction` hook and one `useStarNagStore`, so starring from any surface permanently mutes the rest. The whole-repo test suite (2679 tests), typecheck, and lint are clean.

Two things remain genuinely open before this should ship broadly, both flagged already in Open Questions and not resolved by implementation: the placeholder initial threshold (5 workspaces) and all UI copy need real product/design review, and `FEATURE_FLAGS.STAR_NAG_CARD` needs to actually be turned on in PostHog for anyone to see the sidebar card (it defaults off by design, as a kill switch). The onboarding toast and Settings row and empty-state pill are not flag-gated and are live as soon as this ships.

This plan should move to `apps/desktop/plans/done/` once a PR is opened for this work.

## Context and Orientation

This work is entirely inside **`apps/desktop`**, the Electron desktop app in this Bun/Turbo monorepo. It also touches **`packages/shared`** (for a small new constant) and **`packages/ui`** (only by reusing existing components, not adding new ones there). No other app (`web`, `marketing`, `api`, `admin`, `docs`, `mobile`) is affected.

A few terms used throughout this plan, defined for a reader new to this repo:

- **Electron main process vs. renderer process**: this is a desktop app built with Electron. The "main process" (code under `apps/desktop/src/main/` and `apps/desktop/src/lib/trpc/routers/`) is a Node.js process with full OS access (it can spawn subprocesses like `gh`, read files, etc.). The "renderer process" (code under `apps/desktop/src/renderer/`) is the browser-like window the user actually sees and clicks on; it cannot import Node.js modules directly.
- **tRPC over Electron IPC**: this repo's chosen way for the renderer to ask the main process to do something (or to receive a stream of updates from it), instead of Electron's lower-level raw `ipcMain.handle`/`contextBridge` primitives. A "router" is a main-process file that defines a set of named `query` (read), `mutation` (write/action), or `subscription` (a live stream of values pushed from main to renderer) endpoints. `apps/desktop/src/lib/trpc/routers/index.ts` combines every router into one `AppRouter` type; the renderer calls into it via the typed client `electronTrpc` (`apps/desktop/src/renderer/lib/electron-trpc.ts`).
- **Zustand store with `persist`**: this repo's chosen state-management library for renderer-side app state. `persist` is a Zustand middleware that automatically serializes a store's state to the browser's `localStorage` (which survives app restarts, unlike plain in-memory state) under a given key name.
- **`gh` CLI**: GitHub's official command-line tool. If installed and the user has run `gh auth login`, it can make authenticated GitHub API calls on the user's behalf from a terminal (or, as this plan does, from a subprocess spawned by the app). This repo already shells out to it in several places — see below.

Relevant existing code this plan builds on or must be consistent with:

- **tRPC router registration and patterns.** `apps/desktop/src/lib/trpc/routers/index.ts` is where every router (e.g. `notifications`, `autoUpdate`, `external`) is added as a key on the root router. `apps/desktop/src/lib/trpc/routers/notifications.ts` and `apps/desktop/src/lib/trpc/routers/auto-update/index.ts` both demonstrate the `observable`-based subscription pattern this repo uses (required for main→renderer pushes; async generators do not work with this repo's IPC transport, per `apps/desktop/AGENTS.md`). This plan's new router does **not** need a subscription (see Milestone 1 — everything it exposes is a one-shot `query`/`mutation`), but `apps/desktop/src/lib/trpc/routers/external/index.ts`'s `openUrl` mutation (below) is a `mutation` example worth matching stylistically.
- **Shelling out to `gh` from the main process.** `apps/desktop/src/lib/trpc/routers/workspaces/utils/github/github.ts` already runs commands like `gh api repos/${nwo}/deployments` via a helper `execWithShellEnv("gh", [...], { cwd })` imported from `../shell-env` (`apps/desktop/src/lib/trpc/routers/workspaces/utils/shell-env.ts`). This uses the user's own local `gh` installation and whatever auth scopes their `gh auth login` already has — there is no app-managed GitHub token involved. This plan's new star-check/star mutation reuses this exact helper.
- **Opening a URL in the default browser.** `apps/desktop/src/lib/trpc/routers/external/index.ts` has:

        openUrl: publicProcedure.input(z.string()).mutation(async ({ input }) => {
          if (!isSafeExternalUrl(input)) {
            throw new TRPCError({ code: "BAD_REQUEST", ... });
          }
          await shell.openExternal(input);
        }),

  consumed from the renderer via `electronTrpc.external.openUrl.useMutation()`. This is the exact mechanism this plan's "web fallback" (when `gh` isn't available) uses.
- **A near-identical existing "engagement banner" to copy.** `apps/desktop/src/renderer/components/HiringBanner/HiringBanner.tsx` is a dismissible card shown in the sidebar (via `SidebarCard` from `@superset/ui/sidebar-card`), gated by a PostHog feature flag (`useFeatureFlagEnabled(FEATURE_FLAGS.HIRING_BANNER)`), backed by a one-field persisted store (`apps/desktop/src/renderer/stores/hiring-banner/store.ts`), and reporting `track("hiring_banner_shown"/"hiring_banner_clicked"/"hiring_banner_dismissed", ...)` to PostHog. It is mounted from `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebar.tsx` (v1) and `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/DashboardSidebar.tsx` (v2). This plan's threshold card follows the same shape.
- **The dismissal-store factory.** `apps/desktop/src/renderer/stores/createDismissalsStore/createDismissalsStore.ts` is a small factory: `createDismissalsStore(persistName, devtoolsName)` returns a Zustand store with `dismissedAt: Record<string, number>`, `dismiss(id)`, `isDismissed(id)`, `reset(id)`. It's referenced here as prior art for the "id-keyed, timestamped dismissal" shape, though this plan's own store (Milestone 2) needs additional fields (a counter, a threshold, a cooldown) that don't fit this factory's shape, so it defines its own store rather than reusing the factory directly.
- **The "record app version transitions" store**, for reference on the version-baseline-reset idea (this plan does not end up needing it — see Milestone 2 — but it demonstrates the pattern): `apps/desktop/src/renderer/stores/app-version-history/store.ts` persists `previousVersion`/`lastRunVersion` and exposes `recordBoot(currentVersion)`, called once per app boot.
- **Sonner toasts.** `import { toast } from "@superset/ui/sonner"`. `apps/desktop/src/renderer/lib/workspaces/showWorkspaceAutoNameWarningToast.ts` shows the pattern for a toast with an action button:

        toast.warning("Workspace used a fallback name", {
          description,
          duration: 15_000,
          action: { label: "Open Models", onClick: onOpenModelAuthSettings },
        });

- **The workspace-creation call sites.** `apps/desktop/src/renderer/react-query/workspaces/useCreateWorkspace.ts` is a shared hook wrapping `electronTrpc.workspaces.create.useMutation()`, used by the v1 `NewWorkspaceModal` flow and several other flows (tasks, project pages — see its `onSuccess`, which already distinguishes a genuinely **new** workspace from **reopening an existing one** via `!data.wasExisting`, a distinction this plan's counter must also respect). It is **not** used by the v2 `NewWorkspaceScreen` flow (`apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/NewWorkspaceScreen/NewWorkspaceScreen.tsx`), whose actual creation call site needs to be located as part of Milestone 1 (see Open Questions).
- **The onboarding-completion call site.** `apps/desktop/src/renderer/routes/_authenticated/onboarding/project/page.tsx`'s `finish(projectId)` function calls `apiTrpcClient.user.completeOnboarding.mutate()` then `refetchSession(...)` inside a `try`/`catch` that `return`s early on failure; only once that block succeeds does it branch into the v1/v2-specific "now open a workspace" logic. The point immediately after that `try`/`catch` block (before the `if (isV2CloudEnabled)` branch) is reached exactly once, only on genuine success, regardless of which branch runs next — this is where this plan's onboarding-completed trigger fires from.
- **Settings page structure.** There is currently no "Support"/"About"/"Help" settings section. The closest general-purpose page is `/settings/behavior`, rendered by `apps/desktop/src/renderer/routes/_authenticated/settings/behavior/page.tsx` → `apps/desktop/src/renderer/routes/_authenticated/settings/behavior/components/BehaviorSettings/BehaviorSettings.tsx`. Rows on this page are conditionally shown via a `visibleItems`/`isItemVisible(SETTING_ITEM_ID.X, visibleItems)` mechanism that also powers in-app settings search (`apps/desktop/src/renderer/routes/_authenticated/settings/utils/settings-search/settings-search.ts`); a new settings row needs a new `SETTING_ITEM_ID` entry to participate in search, matching how existing rows (e.g. `BEHAVIOR_CONFIRM_QUIT`) do it.
- **The empty "no pane open" screens.** There are two, one per workspace-view generation (this app currently ships v1 and v2 in parallel — see the note on that below):
  - `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/EmptyTabView.tsx` (v1), rendered by `TabsContent/index.tsx` whenever the active workspace has no resolved active tab.
  - `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceEmptyState/WorkspaceEmptyState.tsx` (v2), passed as a `renderEmptyState` prop in `v2-workspace/$workspaceId/page.tsx`.

  Both are centered, low-density layouts (a wordmark logo, then a vertical list of `EmptyTabActionButton`s — "Open Terminal," "Open Chat," "Open Browser," etc. — via the shared `EmptyTabActionButton` component), and both have visual room below that button list for a small, subtle addition (`EmptyTabView` already puts a "Delete workspace" text link there). Because the two files are near-duplicates rather than one shared component, any addition needs to go in both, ideally as one new shared component each imports, rather than duplicated markup (per this repo's stated preference for shared helpers over copy-pasted flows).
- **v1/v2 coexistence.** This app currently ships two parallel workspace-view implementations (referred to as "v1" and "v2") simultaneously in production; a user's account is on one or the other (or migrating) at any given time, gated by `useIsV2CloudEnabled()`/`isV2CloudEnabled`. Anything user-facing in this app, including this feature, generally needs to work correctly on both, which is why several places in this plan explicitly call out "v1 and v2" separately rather than assuming one code path covers everyone.
- **PostHog analytics.** Renderer: `apps/desktop/src/renderer/lib/analytics/index.ts` exports `track(event, properties)`, a thin wrapper over `posthog.capture(...)`. This is the function `HiringBanner.tsx` and this plan's telemetry both use.
- **Feature flags.** `packages/shared/src/constants.ts` exports `FEATURE_FLAGS`, a map of PostHog flag keys (e.g. `HIRING_BANNER: "hiring-banner"`), checked in components via `useFeatureFlagEnabled` from `posthog-js/react`.

## Plan of Work

### Milestone 1: A main-process way to check and perform the GitHub star, plus pinning down the v2 creation call site

This milestone adds the one piece of this feature that genuinely requires main-process (Node.js) access — shelling out to `gh` — and resolves the one open research question that blocks Milestone 2 (where exactly v2 creates a workspace). At the end of this milestone, nothing user-facing has changed yet, but the renderer has a typed, testable way to ask "has the signed-in user starred `superset-sh/superset`?" and "star it now," and the plan's Open Question about the v2 creation call site is resolved and recorded in this document.

Add a new constant to `packages/shared/src/constants.ts`, near the existing `COMPANY` object (which already holds similar cross-cutting links like `CAREERS_URL`):

    export const GITHUB_REPO = {
      OWNER: "superset-sh",
      NAME: "superset",
      URL: "https://github.com/superset-sh/superset",
    } as const;

Create a new router file `apps/desktop/src/lib/trpc/routers/github-star/index.ts` exporting `createGithubStarRouter()`, following the style of `apps/desktop/src/lib/trpc/routers/external/index.ts`. It exposes:

- `checkStarred: publicProcedure.query(async () => { ... })` returning one of the literal strings `"starred" | "not_starred" | "unknown"`. Implementation: call `execWithShellEnv("gh", ["api", "--include", "user/starred/superset-sh/superset"])` (reusing the helper already imported by `apps/desktop/src/lib/trpc/routers/workspaces/utils/github/github.ts` from `../shell-env`). GitHub's API returns HTTP 204 if the authenticated user has starred the repo, 404 if not. Inspect the combined stdout/stderr for an HTTP status line the same way `apps/desktop/src/lib/trpc/routers/workspaces/utils/github/github.ts` already parses `gh api` output; treat a 204 as `"starred"`, a definitive 404 as `"not_starred"`, and every other outcome (the `gh` binary is missing, the process throws `ENOENT`, the user isn't authenticated, a network error, a non-404/204 status) as `"unknown"` — never throw out of this procedure, since every caller needs a safe fallback state rather than an error boundary.
- `star: publicProcedure.mutation(async () => { ... })` returning a `boolean`. Implementation: `execWithShellEnv("gh", ["api", "-X", "PUT", "user/starred/superset-sh/superset"])`; return `true` if the command exits successfully, `false` on any error (again, never throw).

Register the new router in `apps/desktop/src/lib/trpc/routers/index.ts` as a new key, e.g. `githubStar: createGithubStarRouter()`, alongside the existing `external`, `notifications`, `autoUpdate` entries.

Write `apps/desktop/src/lib/trpc/routers/github-star/index.test.ts` covering: `checkStarred` returns `"starred"` when the mocked shell call's output contains an HTTP 204 status line, `"not_starred"` on a 404, and `"unknown"` when the mocked call throws (simulating `gh` not being installed); `star` returns `true` on a clean exit and `false` when the mocked call throws.

Finally, as a research task (no code changes), locate the v2 new-workspace creation call site: read `apps/desktop/src/renderer/routes/_authenticated/components/DashboardNewWorkspaceModal/components/NewWorkspaceScreen/NewWorkspaceScreen.tsx` and its sibling `DashboardNewWorkspaceForm` components to find which tRPC mutation actually creates a v2 workspace (it is not `electronTrpc.workspaces.create`, per this plan's own research — see Open Questions). Once found, update this plan's Milestone 2 (and remove the corresponding Open Question) with the exact file, hook/mutation name, and its success callback shape, mirroring the detail already recorded above for the v1 path (`useCreateWorkspace.ts`'s `onSuccess`, including its `!data.wasExisting` "genuinely new, not reopened" check — confirm whether the v2 mutation has an equivalent distinction, and if not, note that explicitly rather than guessing).

Acceptance for this milestone:

    cd apps/desktop
    bun test src/lib/trpc/routers/github-star/index.test.ts
    # Expected: all cases pass
    bun run typecheck
    # Expected: no errors

### Milestone 2: The renderer-side star-nag store and trigger logic

This milestone adds the persisted state machine — completed/dismissed/threshold/cooldown — and the pure logic that decides, given the current state and a trigger source, whether to show a prompt. At the end of this milestone there is still no visible UI change, but the store and its decision logic are fully unit-testable in isolation from any component.

Create `apps/desktop/src/renderer/stores/star-nag/store.ts`:

    import { create } from "zustand";
    import { devtools, persist } from "zustand/middleware";

    export const STAR_NAG_INITIAL_THRESHOLD = 5; // placeholder — see plan's Open Questions
    const STAR_NAG_COOLDOWN_MS = 3 * 24 * 60 * 60 * 1000; // 3 days, matches orca's precedent

    interface StarNagState {
      completed: boolean;
      workspacesCreatedSinceBaseline: number;
      nextThreshold: number;
      deferredUntil: number | null;
      recordWorkspaceCreated: () => void;
      shouldShowThresholdCard: () => boolean;
      dismiss: () => void; // crossed threshold, user said "later" — back off, double the bar
      markCompleted: () => void; // starred (from anywhere) or explicitly opted out
    }

    export const useStarNagStore = create<StarNagState>()(
      devtools(
        persist(
          (set, get) => ({
            completed: false,
            workspacesCreatedSinceBaseline: 0,
            nextThreshold: STAR_NAG_INITIAL_THRESHOLD,
            deferredUntil: null,
            recordWorkspaceCreated: () =>
              set((s) => ({
                workspacesCreatedSinceBaseline: s.workspacesCreatedSinceBaseline + 1,
              })),
            shouldShowThresholdCard: () => {
              const s = get();
              if (s.completed) return false;
              if (s.deferredUntil && s.deferredUntil > Date.now()) return false;
              return s.workspacesCreatedSinceBaseline >= s.nextThreshold;
            },
            dismiss: () =>
              set((s) => ({
                nextThreshold: s.nextThreshold * 2,
                workspacesCreatedSinceBaseline: 0,
                deferredUntil: Date.now() + STAR_NAG_COOLDOWN_MS,
              })),
            markCompleted: () => set({ completed: true, deferredUntil: null }),
          }),
          { name: "star-nag-v1" },
        ),
        { name: "StarNagStore" },
      ),
    );

  A few things worth calling out explicitly, since they are easy to get subtly wrong: `dismiss()` resets `workspacesCreatedSinceBaseline` to 0 and doubles `nextThreshold`, so the *next* card requires that many *additional* new workspaces from this moment — not from the original baseline. `recordWorkspaceCreated` must only ever be called for genuinely new workspaces (never for reopening an existing one), per the `!data.wasExisting` distinction already present in the v1 creation path.

Register the new key in `apps/desktop/src/renderer/lib/persisted-keys/persisted-key-registry.test-data.ts`, following the exact format of the existing `["src/renderer/stores/hiring-banner/store.ts", ["hiring-banner-v1"]]` entry — add `["src/renderer/stores/star-nag/store.ts", ["star-nag-v1"]]`.

Add the two workspace-creation instrumentation points identified in Milestone 1:

- In `apps/desktop/src/renderer/react-query/workspaces/useCreateWorkspace.ts`'s `onSuccess`, inside the existing `if (!data.wasExisting) { ... }` block, call `useStarNagStore.getState().recordWorkspaceCreated()`. (Using `.getState()` rather than the hook form is appropriate here since this is an imperative side effect inside a callback, not a render — the same pattern already used for `useWorkspaceInitStore` elsewhere in this file would also work if preferred; match whichever style a reviewer prefers, but do not introduce a new pattern for a single call site.)
- In the v2 creation path located during Milestone 1's research task, add the equivalent call at its success point, guarded the same way (only on genuinely new workspaces).

Add unit tests `apps/desktop/src/renderer/stores/star-nag/store.test.ts` covering: threshold not yet reached → `shouldShowThresholdCard()` is `false`; threshold reached → `true`; after `dismiss()`, `shouldShowThresholdCard()` is `false` again even though the raw count would have exceeded the old threshold, and stays `false` until `STAR_NAG_INITIAL_THRESHOLD * 2` more workspaces are recorded; `markCompleted()` makes `shouldShowThresholdCard()` permanently `false` regardless of count or cooldown; cooldown expiry (`deferredUntil` in the past) allows the card to show again once the (doubled) threshold is met.

Acceptance for this milestone:

    cd apps/desktop
    bun test src/renderer/stores/star-nag
    # Expected: all cases pass
    bun run lint:check-node-imports
    # Expected: no violations (this store must not import anything from src/main)

### Milestone 3: Wire up the four surfaces

This is the user-visible milestone. At the end of it, all four entry points described in Purpose / Big Picture are live.

**3a. Settings row.** Add a `SETTING_ITEM_ID.SUPPORT_STAR_GITHUB` (or similar name matching the existing enum's naming convention) to `apps/desktop/src/renderer/routes/_authenticated/settings/utils/settings-search/settings-search.ts`, with search keywords `["star", "github", "support", "feedback"]`, matching the pattern orca used for its equivalent settings-search entry. Add a small new row to `apps/desktop/src/renderer/routes/_authenticated/settings/behavior/components/BehaviorSettings/BehaviorSettings.tsx` (or a new `GithubStarRow` sub-component if that file is already large — check its current length before deciding), gated by `isItemVisible(SETTING_ITEM_ID.SUPPORT_STAR_GITHUB, visibleItems)` like the other rows on that page. The row: on mount, calls `electronTrpc.githubStar.checkStarred.useQuery()`; shows a "Star Superset on GitHub" button while `"not_starred"`, an "Open GitHub" button while `"unknown"` (using `electronTrpc.external.openUrl.useMutation()` against `GITHUB_REPO.URL`), and a plain "Starred — thank you!" confirmation once starred. On a successful `star` mutation, also call `useStarNagStore.getState().markCompleted()` — starring from Settings must permanently mute the other three surfaces, exactly like orca's equivalent.

**3b. Empty-state pill.** Create one new shared component, e.g. `apps/desktop/src/renderer/components/GitHubStarPill/GitHubStarPill.tsx`, implementing the same `checkStarred` → button-state → `star`-or-`openUrl` → `markCompleted()` logic as 3a, styled as a small pill (not a full settings row) positioned centered near the bottom of its container. Import and render it from both `apps/desktop/src/renderer/screens/main/components/WorkspaceView/ContentView/TabsContent/EmptyTabView.tsx` (v1) and `apps/desktop/src/renderer/routes/_authenticated/_dashboard/v2-workspace/$workspaceId/components/WorkspaceEmptyState/WorkspaceEmptyState.tsx` (v2), below the existing `EmptyTabActionButton` list, so the same component (not copy-pasted markup) appears in both places. Hide it once `useStarNagStore().completed` is `true` — there is no need for its own separate "already starred" state once the shared store says starring happened anywhere.

**3c. Persistent threshold card.** Create `apps/desktop/src/renderer/components/StarNagCard/StarNagCard.tsx`, modeled directly on `apps/desktop/src/renderer/components/HiringBanner/HiringBanner.tsx`'s structure (a `SidebarCard` from `@superset/ui/sidebar-card`, an `AnimatePresence`/`motion.div` wrapper, a `track(...)` call on show). Visibility: `useStarNagStore((s) => s.shouldShowThresholdCard())` (per the Open Questions entry on feature-flagging, also gate on `useFeatureFlagEnabled(FEATURE_FLAGS.STAR_NAG_CARD)` after adding that key to `packages/shared/src/constants.ts`'s `FEATURE_FLAGS`, so it can be killed without a release). Buttons: "Star on GitHub" (calls `checkStarred`-derived state → `star` mutation → on success, `markCompleted()`, `track("star_nag_starred", { surface: "card" })`) or "Open GitHub" if `gh` is unavailable; "Later" (calls the store's `dismiss()` and `track("star_nag_dismissed", { surface: "card" })`). Mount it in both `apps/desktop/src/renderer/screens/main/components/WorkspaceSidebar/WorkspaceSidebar.tsx` and `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/DashboardSidebar.tsx`, the same two places `HiringBanner` is already mounted, so it appears in both v1 and v2 sidebars. Because `shouldShowThresholdCard()` is a plain Zustand selector, it only re-runs when the store itself changes — a cooldown (`deferredUntil`) expiring is a pure passage of time, not a store write, so the component also needs a `setTimeout` keyed off `deferredUntil` that forces a re-render right when the cooldown actually ends (see Surprises & Discoveries); otherwise the card can stay hidden past its cooldown until some unrelated store write happens to occur.

**3d. Onboarding-completion toast.** In `apps/desktop/src/renderer/routes/_authenticated/onboarding/project/page.tsx`'s `finish` function, immediately after the `try`/`catch` block that calls `completeOnboarding.mutate()` and `refetchSession(...)` (i.e., right before the existing `if (isV2CloudEnabled) { ... }` branch, so it fires exactly once per successful onboarding completion regardless of which branch runs next), add a call to a new small helper, `showStarNagOnboardingToast()`, in `apps/desktop/src/renderer/components/StarNagToast/`. This briefly lived co-located under `onboarding/project/components/` (its only real caller at the time) before moving back to the shared `components/` directory once a second consumer appeared: the dev-only command-palette preview command (Milestone 3e) imports the sibling `previewStarNagOnboardingToast()` export, which the co-location convention's "used 2+ times → promote to shared `components/`" rule requires. That helper checks `useStarNagStore.getState().isEligible()` for `completed`/cooldown exactly like `shouldShowThresholdCard()` does (factor the shared "is this user eligible for any nag right now" check out of `shouldShowThresholdCard()` into a small reusable predicate both call, rather than duplicating the `completed`/`deferredUntil` checks a third time), sets a module-level `shownThisSession` flag so a rapid double-click on the create/clone/open button can't stack two toasts before the route navigates away, and, if eligible, shows a Sonner toast:

    toast.custom(() => <StarNagToastContent />, {
      duration: 30_000,
      // Bounded so an ignored toast eventually records a dismissal instead of
      // silently never entering cooldown. onAutoClose only fires when this
      // duration elapses naturally (not from a manual dismiss via starring or
      // the close button), so it can't double-count a dismissal.
      onAutoClose: () => {
        track("star_nag_dismissed", { surface: "toast" });
        useStarNagStore.getState().dismiss();
      },
    });

  with the toast's own close button calling `dismiss()` and its "Star on GitHub" button following the same check→star→`markCompleted()` flow as the other three surfaces. This does not need feature-flag gating (per the Open Questions recommendation) since it's a single one-time event, not a recurring nag.

Placeholder copy for this milestone (flagged in Open Questions as needing real product/design review):

- Card: heading "Enjoying Superset?", body "Superset is open source. If it's helped you today, a GitHub star helps other developers find it.", buttons "Star on GitHub" / "Later".
- Toast: heading "You're all set!", body "If you're enjoying Superset so far, a GitHub star helps other developers discover it.", buttons "Star on GitHub" / dismiss.
- Settings row: title "Star Superset on GitHub", description "Support the project with a GitHub star."
- Empty-state pill: label "Star on GitHub" (idle) / "Starred on GitHub" (after starring).

Acceptance for this milestone: manual verification only (see Validation and Acceptance below) plus:

    cd apps/desktop
    bun run typecheck
    bun run lint
    # Expected: no errors, no warnings (this repo treats lint warnings as CI failures)

**3e. Dev-only command-palette preview.** Added after the PR shipped, in response to a request to make the toast easy to trigger without replaying onboarding. Two new commands in `apps/desktop/src/renderer/commandPalette/modules/actions/commands.tsx`, inside the existing `if (env.NODE_ENV === "development")` block (this repo's established pattern — see the neighboring `dev.previewNoticeInfo`/`dev.clearNoticePreview` commands for desktop notices), both under the palette's `"dev"` section so they never ship to production:

- `dev.previewStarNagToast` ("Preview: GitHub star nag toast") calls a new `previewStarNagOnboardingToast()` export from `apps/desktop/src/renderer/components/StarNagToast/StarNagToast.tsx` — a thin sibling of `showStarNagOnboardingToast()` that renders the same `StarNagToastContent` via `toast.custom()` but skips the `isEligible()`/`shownThisSession` gating and the `track("star_nag_shown", ...)` call, so it always shows on demand and never pollutes real growth telemetry.
- `dev.resetStarNagState` ("Reset GitHub star nag state") calls `useStarNagStore.setState(...)` directly to clear `completed`/`deferredUntil` and set `workspacesCreatedSinceBaseline` equal to `nextThreshold`, so the sidebar card and empty-state pill also become eligible again immediately on whatever screen they're mounted on, without needing to actually create workspaces or wait out a cooldown.

This is why `StarNagToast` moved back to the shared `components/` directory in 3d above: `previewStarNagOnboardingToast()` now has two real callers (the onboarding page and this command module) in unrelated parts of the tree, which is exactly the "used 2+ times" trigger for promoting out of a single caller's route-local `components/`.

Add `track(...)` calls at every funnel point across all four surfaces, using a consistent event-name prefix so they can be analyzed together in PostHog: `star_nag_shown` (with a `surface: "card" | "toast" | "settings" | "empty_state"` property), `star_nag_starred`, `star_nag_dismissed`, `star_nag_opened_web` (the `gh`-unavailable fallback path). This mirrors `HiringBanner`'s `hiring_banner_shown`/`hiring_banner_clicked`/`hiring_banner_dismissed` convention closely enough to be analyzed the same way. Confirm `bun run lint:fix` produces no residual diff and `bun run lint` exits 0 before considering this milestone done, per this repo's rule that lint warnings block CI.

## Concrete Steps

    cd apps/desktop
    bun install                 # only if package.json changed (it should not need to)
    bun run typecheck
    bun run lint:fix
    bun run lint
    bun test src/lib/trpc/routers/github-star
    bun test src/renderer/stores/star-nag

Each command should be run from the `apps/desktop` directory unless otherwise noted; `bun run lint`/`bun run lint:fix` are actually root-level commands per `AGENTS.md` ("Biome runs at root level, not per-package") — run those specifically from the repository root instead:

    cd "$(git rev-parse --show-toplevel)"
    bun run lint:fix
    bun run lint
    # Expected: exit code 0, no output

## Validation and Acceptance

Automated:

    bun run typecheck   # No type errors anywhere in the repo
    bun run lint        # No lint errors or warnings
    bun test             # All tests pass, including the new github-star and star-nag suites

Manual, using `bun dev` to run the full desktop app locally (see `apps/desktop/AGENTS.md` for how to attach Chrome DevTools Protocol to verify against the real running app rather than only reading code):

1. With a machine that has `gh` installed and authenticated, and the signed-in test account's GitHub account **not** currently starring `superset-sh/superset`: open Settings → General (or wherever the row landed), confirm a "Star Superset on GitHub" row appears, click it, confirm it flips to a starred/thank-you state, and separately confirm (e.g. via `gh api user/starred/superset-sh/superset` in a terminal) that the repo is now actually starred on GitHub.
2. Un-star the repo again (`gh api -X DELETE user/starred/superset-sh/superset`), clear the `star-nag-v1` localStorage key (or use a fresh profile), open a workspace, close/click away all its panes/tabs until the empty state shows, and confirm the "Star on GitHub" pill appears near the bottom of that screen, in both a v1 and a v2 workspace.
3. With the store's `nextThreshold` still at its default and a fresh workspace count, create workspaces one at a time until crossing the threshold; confirm the card appears in the sidebar exactly once (not once per additional workspace created past the threshold), in both v1 and v2. Click "Later," confirm the card disappears and does not reappear even after creating a few more workspaces; confirm (by reading the persisted `star-nag-v1` `localStorage` value, or by temporarily lowering `STAR_NAG_COOLDOWN_MS` for local testing) that `nextThreshold` doubled and `deferredUntil` is set in the future.
4. Star the repo from any one of the four surfaces, then confirm the other three no longer show it (the settings row shows "starred," the empty-state pill hides, the card's `shouldShowThresholdCard()` returns `false`, and re-running the onboarding-completion flow — e.g. against a fresh test account that has starred once already — does not show the toast).
5. Complete the onboarding wizard end-to-end on a fresh test account and confirm the toast appears exactly once, immediately after landing past onboarding, in both the v1 and v2 post-onboarding destinations.
6. Temporarily rename/hide the `gh` binary on the test machine (or run in an environment without it) and repeat steps 1–5, confirming every surface falls back to an "Open GitHub" browser-opening action instead of erroring or hanging.

State clearly, when reporting this milestone's completion, which of the above were verified end-to-end in the running app (with CDP or manual interaction) versus only exercised through unit tests — per the CDP UI Verification rules in the root `AGENTS.md`, passing unit tests alone must not be reported as proof the feature works in the real app.

## Idempotence and Recovery

Every step in this plan is safe to re-run. The tRPC router and store files are created once; re-running `bun test`/`bun run typecheck`/`bun run lint` has no side effects. If a workspace-creation instrumentation call is accidentally added twice (e.g., during a merge conflict), the symptom is the counter incrementing by 2 per real workspace — the fix is simply removing the duplicate call, not a data migration, since the counter is just a `localStorage` integer with no external consumers. If the placeholder threshold (5) or cooldown (3 days) need to change after user feedback, that is a one-line edit to `STAR_NAG_INITIAL_THRESHOLD`/`STAR_NAG_COOLDOWN_MS` in `apps/desktop/src/renderer/stores/star-nag/store.ts` with no migration needed — existing users' persisted `nextThreshold` values already reflect whatever the constant was when they last had it reset, which is an acceptable, self-correcting drift (matches how orca's own `STAR_NAG_INITIAL_THRESHOLD` comment describes its role as a "first-time seed only"). If the whole feature is later removed, follow `apps/desktop/AGENTS.md`'s localStorage policy: add `"star-nag-v1"` to the persisted-keys registry's `DEAD_KEYS` list in the same PR that deletes the writer, so the boot-time sweep cleans it off existing user profiles.

## Artifacts and Notes

None yet — to be filled in with real screenshots/output during implementation.

## Interfaces and Dependencies

New tRPC router, `apps/desktop/src/lib/trpc/routers/github-star/index.ts`:

    export function createGithubStarRouter() {
      return router({
        checkStarred: publicProcedure.query(
          async (): Promise<"starred" | "not_starred" | "unknown"> => { ... }
        ),
        star: publicProcedure.mutation(async (): Promise<boolean> => { ... }),
      });
    }

Registered on the root router (`apps/desktop/src/lib/trpc/routers/index.ts`) as `githubStar`, consumed from the renderer as `electronTrpc.githubStar.checkStarred.useQuery()` / `electronTrpc.githubStar.star.useMutation()`.

New Zustand store, `apps/desktop/src/renderer/stores/star-nag/store.ts`, exporting `useStarNagStore` with the shape given in full in Milestone 2, persisted under the `localStorage` key `"star-nag-v1"`.

New shared constant, `packages/shared/src/constants.ts`: `GITHUB_REPO = { OWNER: "superset-sh", NAME: "superset", URL: "https://github.com/superset-sh/superset" }`. A new `FEATURE_FLAGS.STAR_NAG_CARD` entry (PostHog flag key, e.g. `"star-nag-card"`) gates only the sidebar card, per the resolved Open Question above — the toast is not flag-gated.

New components: `apps/desktop/src/renderer/components/GitHubStarPill/GitHubStarPill.tsx`, `apps/desktop/src/renderer/components/StarNagCard/StarNagCard.tsx`, plus small in-place additions to `BehaviorSettings.tsx`, `EmptyTabView.tsx`, `WorkspaceEmptyState.tsx`, `WorkspaceSidebar.tsx`, `DashboardSidebar.tsx`, and `onboarding/project/page.tsx` as described in Milestone 3.
