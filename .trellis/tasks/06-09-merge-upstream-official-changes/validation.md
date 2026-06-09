# Validation

## Merge Resolution

- Source merged: `origin/main`.
- Product conflict decision: keep the local V2-only product direction and do not restore upstream V1/V2 experiment gates or V1-first onboarding.
- Accepted compatible upstream changes including template gallery entry points, terminal runtime/reaper updates, CLI/SDK terminal resources, docs/package updates, and workspace import fixes.
- Rejected the conflicting upstream generated DB migration number by preserving local migration history and keeping remote-control schema declarations aligned with existing migrations.

## Commands

- `bun install --ignore-scripts` passed after plain `bun install` hit a docs postinstall `SIGKILL`.
- `bun run --cwd apps/desktop typecheck` passed.
- `bun test apps/desktop/src/renderer/routes/_authenticated/v2-only-cleanup.test.ts` passed: 5 pass.
- `bun run --cwd packages/pty-daemon test` passed: 57 pass.
- `bun run --cwd packages/host-service test` passed: 742 pass, 8 todo, 0 fail.
- `bun test packages/desktop-mcp` passed: 11 pass.
- `bun run --cwd packages/desktop-mcp typecheck` passed.
- `bun run lint:fix` passed with no fixes applied.
- `bun run lint` passed.
- `bun run typecheck` passed: 29 successful Turbo tasks.
- `rg -n "^(<<<<<<<|=======|>>>>>>>)" .` returned no conflict markers.
- `git diff --check` passed.
- `git diff --name-only --diff-filter=U` returned no unmerged files.

## Desktop Automation

Real Electron app was already running with CDP on port `9322`.

- `bun run desktop:automation -- window-info --json` showed current URL `http://localhost:3005/#/v2-workspace/72faa8d8-2dfa-4202-b7fe-1ec72711af87`.
- `bun run desktop:automation -- console-logs --level error --json` returned `[]`.
- `bun run desktop:automation -- smoke --url-includes "#/v2-workspace" --screenshot .trellis/tasks/06-09-merge-upstream-official-changes/artifacts/desktop-v2-workspace-smoke.png --report .trellis/tasks/06-09-merge-upstream-official-changes/artifacts/desktop-v2-workspace-smoke.json` passed.

Artifacts:

- `.trellis/tasks/06-09-merge-upstream-official-changes/artifacts/desktop-v2-workspace-smoke.png`
- `.trellis/tasks/06-09-merge-upstream-official-changes/artifacts/desktop-v2-workspace-smoke.json`

## Notes

- Fixed one host-service integration test to avoid using the developer account shell for the real daemon process-group test. The test now falls back to the controlled `/bin/sh` env from `beforeEach`, so it validates daemon input/process cleanup rather than local zsh startup behavior.
- Updated `.trellis/spec/guides/terminal-and-host-runtime.md` because upstream removed the daemon ACK flow-control protocol; current slow-renderer handling is bounded socket buffering plus reconnect replay.
