# Validation: Chat / Code / Work Mode Tabs

## Automated Checks

- `bun test apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/utils/dashboardMode/dashboardMode.test.ts`
  - Passed: 18 tests.
- `bun test apps/desktop/src/renderer/routes/_authenticated/v2-only-cleanup.test.ts apps/desktop/src/renderer/routes/_authenticated/_dashboard/components/DashboardSidebar/utils/dashboardMode/dashboardMode.test.ts`
  - Passed: 23 tests.
- `bun run --cwd apps/desktop typecheck`
  - Passed.
- `bun run lint:fix`
  - Passed; Biome fixed 1 file.
- `bun run lint`
  - Passed.
- `bun run typecheck`
  - Passed: 29 tasks successful.
- `git diff --check`
  - Passed.
- `python3 ./.trellis/scripts/task.py validate 05-31-chat-code-work-mode-tabs`
  - Passed.

## Desktop Automation Acceptance

Real Electron app was launched with:

```bash
bun run --cwd apps/desktop dev
bun run --cwd apps/api dev
bun run db:seed-dev
```

Local account used:

- `admin@local.test`

Desktop Automation CLI checkpoints:

- `01-sign-in.png` / `01-sign-in.json`
  - Verified authenticated entry page before API session restored.
- `02-code-workspaces.png` / `02-code-workspaces.json`
  - Verified Code mode renders the V2 workspaces surface with the `Chat / Code / Work` switch.
- `03-chat-no-workspace.png` / `03-chat-no-workspace.json`
  - Verified Chat mode is reachable at `#/chat` and shows a non-blank choose/create workspace state when no workspace exists.
- `04-work-placeholder.png` / `04-work-placeholder.json`
  - Verified Work mode is reachable at `#/work` and renders the reserved placeholder.
- `05-code-return.png` / `05-code-return.json`
  - Verified switching Work -> Code returns to `#/v2-workspaces`.
- `06-collapsed-code-mode.png` / `06-collapsed-code-mode.json`
  - Verified collapsed left rail still exposes mode buttons and Code navigation.

All desktop smoke reports recorded zero renderer console errors.

## Notes

- The local dev account had no workspace rows, so the real-app smoke covered the no-active-workspace Chat fallback rather than an active workspace chat session.
- Workspace-scoped Chat/Work route behavior is covered by route helper tests and desktop typecheck. The active workspace Chat surface reuses the existing V2 `ChatPane` runtime.
