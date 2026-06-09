# Merge Upstream Official Changes Implementation Plan

## Checklist

- [x] Load Trellis session context.
- [x] Confirm task creation and merge source with the user.
- [x] Create Trellis task.
- [x] Fetch `origin/main` and `twitter/main`.
- [x] Run dry-run merge in an isolated worktree.
- [x] Record initial conflict groups.
- [x] Get user decision on V1 experiment / V2-only product conflict.
- [x] Start Trellis task.
- [x] Apply real merge in the main worktree.
- [x] Resolve conflicts according to the approved product direction.
- [x] Reconcile `bun.lock` using Bun, not npm/yarn/pnpm.
- [x] Reconcile Drizzle generated metadata without hand-inventing migrations.
- [x] Run focused tests for changed desktop/host-service/terminal/task areas.
- [x] Run root `bun run lint` and `bun run typecheck`.
- [x] Run desktop acceptance smoke if desktop behavior changes materially.
- [ ] Commit and push after validation.

## Initial Dry-Run Conflict List

- `apps/desktop/src/main/host-service/index.ts`
- `apps/desktop/src/renderer/components/PostHogSurfaceTagger/PostHogSurfaceTagger.tsx`
- `apps/desktop/src/renderer/hooks/useIsV2CloudEnabled.ts`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/components/DashboardSidebarHeader/DashboardSidebarHeader.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/TopBar/TopBar.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_dashboard/workspace/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/_standalone/layout.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/components/OnboardingNavigation/OnboardingNavigation.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/layout.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/onboarding/project/page.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/settings/experimental/components/ExperimentalSettings/ExperimentalSettings.tsx`
- `apps/desktop/src/renderer/routes/_authenticated/settings/utils/settings-search/settings-search.test.ts`
- `apps/desktop/src/renderer/routes/_authenticated/settings/utils/settings-search/settings-search.ts`
- `bun.lock`
- `packages/db/drizzle/meta/0057_snapshot.json`
- `packages/db/drizzle/meta/_journal.json`
- `packages/host-service/src/app.ts`
- `packages/host-service/src/serve.ts`

## Validation Commands

Run focused checks first, then root checks:

```bash
bun run --cwd apps/desktop typecheck
bun run --cwd packages/host-service test
bun run --cwd packages/pty-daemon test
bun run lint
bun run typecheck
```

If workspace creation, Task sync, or terminal runtime behavior changes, add the
desktop acceptance smoke path before pushing.

## Stop Conditions

- Any conflict that would re-enable V1-first onboarding, task paywall behavior,
  or remove our account/password login must be confirmed with the user.
- Any migration conflict requiring a newly generated migration must be confirmed
  before running Drizzle generation.
- Any upstream change that removes or invalidates our model provider center,
  Task system, or Trellis sync bridge must be summarized before resolution.
